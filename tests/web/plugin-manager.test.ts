import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AccessStore, type PluginGrant } from "../../src/web/access.js";
import type { WebSettings } from "../../src/web/config.js";
import { killTree, parseSavedPlugins, PluginManager } from "../../src/web/plugins/manager.js";

let root: string;
let settings: WebSettings;
let access: AccessStore;
let mgr: PluginManager;
let saves = 0;
const closed: string[] = [];

const grant = (over: Partial<PluginGrant> = {}): PluginGrant => ({ level: "read", views: { read: false, edit: false, create: false }, ...over });

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-mgr-"));
	settings = { port: 8743, lan: false, token: "PRINCIPAL-".padEnd(40, "x") };
	access = new AccessStore(settings, () => {});
	saves = 0;
	closed.length = 0;
	mgr = new PluginManager({
		dir: root,
		settings,
		save: () => saves++,
		access,
		apiUrl: () => "http://127.0.0.1:8743",
		contract: "1.12.0",
		finder: { node: () => process.execPath, python: () => undefined },
		closeStreams: (id) => closed.push(id),
		restartDelayMs: 20,
	});
});
afterEach(async () => {
	await mgr.close();
	fs.rmSync(root, { recursive: true, force: true });
});

/** Plugin Node écrit dans le dossier de test. */
function write(id: string, script: string, manifest: Record<string, unknown> = {}): void {
	const dir = path.join(root, id);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: id, version: "1.0.0", run: { exec: "node", args: ["main.mjs"] }, access: "pilot", ...manifest }));
	fs.writeFileSync(path.join(dir, "main.mjs"), script);
}
const waitFor = async (cond: () => boolean, ms = 8000) => {
	const end = Date.now() + ms;
	while (!cond()) {
		if (Date.now() > end) throw new Error("délai dépassé");
		await new Promise((r) => setTimeout(r, 20));
	}
};
const info = (id: string) => mgr.list().find((p) => p.id === id)!;
const enable = (id: string, g: PluginGrant = grant()) => {
	const r = mgr.enable(id, { hash: info(id).hash!, grant: g });
	if (typeof r === "string") throw new Error(r);
	return r;
};
const KEEP_ALIVE = "setInterval(() => {}, 1000);";

describe("lanceur de plugins", () => {
	test("trouvé mais jamais lancé seul ; invalide avec sa raison", async () => {
		write("a", KEEP_ALIVE);
		write("b", KEEP_ALIVE, { run: { exec: "..\\x.exe" } });
		await mgr.startEnabled();
		expect(info("a")).toMatchObject({ state: "new", manifest: { name: "a" }, protection: "node" });
		expect(info("b")).toMatchObject({ state: "invalid", reason: "exec_outside" });
		expect(mgr.list().every((p) => p.pid === undefined)).toBe(true);
	});

	test("activer : lancé, jeton de plugin au niveau accordé, environnement minimal sans jeton principal", async () => {
		process.env.SCTD_TEST_SECRET = "ne-doit-pas-passer";
		write("env", `for (const [k, v] of Object.entries(process.env)) console.log("ENV " + k + "=" + v); console.log("END"); ${KEEP_ALIVE}`);
		mgr.scan();
		enable("env", grant({ level: "read" }));
		await waitFor(() => mgr.output("env").some((l) => l.text === "END"));
		delete process.env.SCTD_TEST_SECRET;
		const env = Object.fromEntries(
			mgr
				.output("env")
				.filter((l) => l.text.startsWith("ENV "))
				.map((l) => [l.text.slice(4, l.text.indexOf("=")), l.text.slice(l.text.indexOf("=") + 1)]),
		) as Record<string, string>;
		expect(env.SC_TELEMETRY_URL).toBe("http://127.0.0.1:8743");
		expect(env.SC_TELEMETRY_TOKEN).toMatch(/^sct_plg_/);
		expect(access.find(env.SC_TELEMETRY_TOKEN)).toMatchObject({ level: "read", plugin: { id: "env" } });
		expect(JSON.stringify(env)).not.toContain(settings.token);
		expect(env.SCTD_TEST_SECRET).toBeUndefined();
		const allowed = new Set(["SC_TELEMETRY_URL", "SC_TELEMETRY_TOKEN", "SC_TELEMETRY_PLUGIN_DIR", "SC_TELEMETRY_DATA_DIR", "SC_TELEMETRY_LANG", "PATH", "SYSTEMROOT", "TEMP", "TMP", "PATHEXT", "COMSPEC", "WINDIR",
			// Ajoutées d'office par libuv sous Windows à tout processus lancé (pas des secrets).
			"HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE", "USERDOMAIN", "USERNAME", "USERPROFILE"]);
		expect(Object.keys(env).filter((k) => !allowed.has(k.toUpperCase()))).toEqual([]);
		expect(info("env")).toMatchObject({ state: "running", grant: { level: "read" } });
		expect(settings.plugins?.env).toMatchObject({ enabled: true, hash: info("env").hash });
		expect(saves).toBeGreaterThan(0);
	});

	test("Node protégé : lit son dossier, écrit dans data, ne lit pas settings.json", async () => {
		const secretFile = path.join(root, "settings.json");
		fs.writeFileSync(secretFile, "{}");
		write(
			"perm",
			`import fs from "node:fs";
const tryIt = (f) => { try { f(); return "ok"; } catch (e) { return e.code ?? "err"; } };
console.log("OWN " + tryIt(() => fs.readFileSync(new URL("./plugin.json", import.meta.url))));
console.log("DATA " + tryIt(() => fs.writeFileSync(process.env.SC_TELEMETRY_DATA_DIR + "/x.txt", "1")));
console.log("SETTINGS " + tryIt(() => fs.readFileSync(${JSON.stringify(secretFile)})));
${KEEP_ALIVE}`,
		);
		mgr.scan();
		enable("perm");
		await waitFor(() => mgr.output("perm").some((l) => l.text.startsWith("SETTINGS")));
		const out = mgr.output("perm").map((l) => l.text);
		expect(out).toContain("OWN ok");
		expect(out).toContain("DATA ok");
		expect(out).toContain("SETTINGS ERR_ACCESS_DENIED");
	});

	test("arrêter : processus tué, jeton révoqué, flux fermés ; relancer ; désactiver", async () => {
		write("s", `console.log("TOKEN " + process.env.SC_TELEMETRY_TOKEN); ${KEEP_ALIVE}`);
		mgr.scan();
		enable("s");
		await waitFor(() => mgr.output("s").some((l) => l.text.startsWith("TOKEN ")));
		const token = mgr.output("s").find((l) => l.text.startsWith("TOKEN "))!.text.slice(6);
		const pid = info("s").pid!;
		await mgr.stop("s");
		expect(info("s").state).toBe("stopped");
		expect(access.find(token)).toBeUndefined();
		expect(closed).toContain("plugin:s");
		expect(() => process.kill(pid, 0)).toThrow();
		await mgr.start("s");
		await waitFor(() => info("s").state === "running");
		await mgr.disable("s");
		expect(info("s").state).toBe("disabled");
		expect(settings.plugins?.s?.enabled).toBe(false);
	});

	test("3 plantages en une minute → en échec, plus relancé", async () => {
		write("crash", `console.error("boum"); process.exit(1);`);
		mgr.scan();
		enable("crash");
		await waitFor(() => info("crash").state === "failed");
		expect(info("crash").crashes).toBe(3);
		expect(mgr.output("crash").filter((l) => l.stream === "err" && l.text === "boum")).toHaveLength(3);
		expect(info("crash").pid).toBeUndefined();
	});

	test("fichier modifié après activation → « modifié », pas lancé ; réactivé avec la nouvelle empreinte", async () => {
		write("m", KEEP_ALIVE);
		mgr.scan();
		enable("m");
		await mgr.close();
		fs.writeFileSync(path.join(root, "m", "main.mjs"), `${KEEP_ALIVE} // changé`);
		await mgr.startEnabled();
		expect(info("m")).toMatchObject({ state: "changed" });
		expect(info("m").pid).toBeUndefined();
		expect(mgr.enable("m", { hash: "0".repeat(64), grant: grant() })).toBe("hash_mismatch");
		enable("m");
		await waitFor(() => info("m").state === "running");
	});

	test("au démarrage : plugins activés relancés ; fermeture : tout s'arrête", async () => {
		write("x", KEEP_ALIVE);
		mgr.scan();
		enable("x");
		await mgr.close();
		expect(info("x").state).toBe("stopped");
		await mgr.startEnabled();
		await waitFor(() => info("x").state === "running");
		const pid = info("x").pid!;
		await mgr.close();
		expect(() => process.kill(pid, 0)).toThrow();
	});

	test("niveau accordé jamais au-dessus du niveau demandé ; droits de vues limités à ceux demandés", () => {
		write("lvl", KEEP_ALIVE, { access: "read", views: ["read"] });
		mgr.scan();
		const h = info("lvl").hash!;
		expect(mgr.enable("lvl", { hash: h, grant: grant({ level: "pilot" }) })).toBe("invalid");
		expect(mgr.enable("lvl", { hash: h, grant: grant({ views: { read: true, edit: "all", create: false } }) })).toBe("invalid");
	});

	test("réglages : entrées invalides ignorées", () => {
		const ok = { enabled: true, hash: "a".repeat(64), grant: { level: "pilot", views: { read: true, edit: ["main"], create: false } } };
		expect(parseSavedPlugins({ ok, "bad id": ok, x: { ...ok, hash: "z" }, y: { ...ok, grant: { level: "god", views: ok.grant.views } } })).toEqual({ ok });
		expect(parseSavedPlugins(undefined)).toEqual({});
	});

	test("réglages : __proto__ et noms réservés ignorés, sans changer l'objet lu", () => {
		const ok = { enabled: true, hash: "a".repeat(64), grant: { level: "pilot", views: { read: true, edit: false, create: false } } };
		const raw = JSON.parse(`{"__proto__": ${JSON.stringify(ok)}, "constructor": ${JSON.stringify(ok)}, "ok": ${JSON.stringify(ok)}}`);
		const out = parseSavedPlugins(raw);
		expect(Object.keys(out)).toEqual(["ok"]);
		expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
		expect((out as Record<string, unknown>).hash).toBeUndefined();
	});

	test("dossiers constructor et hash jamais activés : refusé / nouveau, pas « modifié »", () => {
		write("ok", KEEP_ALIVE);
		write("constructor", KEEP_ALIVE);
		write("hash", KEEP_ALIVE);
		mgr.scan();
		settings.plugins = Object.assign(Object.create({ hash: { enabled: true, hash: "b".repeat(64), grant: grant() } }), {
			ok: { enabled: false, hash: info("ok").hash!, grant: grant() },
		});
		mgr.scan();
		expect(info("constructor")).toMatchObject({ state: "invalid", reason: "folder_name" });
		expect(info("hash")).toMatchObject({ state: "new" });
	});
});

describe("arrêt de l'arbre de processus", () => {
	test("le petit-enfant meurt aussi", async () => {
		const pidFile = path.join(root, "pid.txt");
		const code = `const c = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" }); require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(()=>{},1000);`;
		const parent = spawn(process.execPath, ["-e", code], { stdio: "ignore" });
		await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf-8").length > 0);
		const grandchild = Number(fs.readFileSync(pidFile, "utf-8"));
		await killTree(parent.pid!);
		await waitFor(() => {
			try {
				process.kill(grandchild, 0);
				return false;
			} catch {
				return true;
			}
		});
	});
});

describe("corrections de la relecture : lanceur", () => {
	test("relance après plantage : fichiers relus, plugin modifié pas relancé", async () => {
		const m2 = new PluginManager({ dir: root, settings, save: () => {}, access, apiUrl: () => "x", contract: "1.12.0", finder: { node: () => process.execPath, python: () => undefined }, restartDelayMs: 400 });
		write("r", `console.log("v1"); process.exit(1);`);
		m2.scan();
		const r = m2.enable("r", { hash: m2.list()[0].hash, grant: grant() });
		if (typeof r === "string") throw new Error(r);
		await waitFor(() => m2.output("r").some((l) => l.text.startsWith("Sorti en erreur")));
		fs.writeFileSync(path.join(root, "r", "main.mjs"), `console.log("v2"); setInterval(() => {}, 1000);`);
		await new Promise((res) => setTimeout(res, 800));
		expect(m2.output("r").some((l) => l.text === "v2")).toBe(false);
		expect(m2.get("r")?.state).toBe("changed");
		await m2.close();
	});

	test("plugin en marche devenu invalide → arrêté au rescan", async () => {
		write("inv", KEEP_ALIVE);
		mgr.scan();
		enable("inv");
		await waitFor(() => info("inv").state === "running");
		const pid = info("inv").pid!;
		fs.writeFileSync(path.join(root, "inv", "plugin.json"), "{cassé");
		mgr.scan();
		await waitFor(() => info("inv").pid === undefined);
		expect(info("inv").state).toBe("invalid");
		expect(() => process.kill(pid, 0)).toThrow();
	});

	test("droits baissés pendant qu'il tourne : appliqués tout de suite au jeton en cours", async () => {
		write("g", `console.log("TOKEN " + process.env.SC_TELEMETRY_TOKEN); ${KEEP_ALIVE}`, { access: "pilot_full" });
		mgr.scan();
		enable("g", grant({ level: "pilot_full" }));
		await waitFor(() => mgr.output("g").some((l) => l.text.startsWith("TOKEN ")));
		const token = mgr.output("g").find((l) => l.text.startsWith("TOKEN "))!.text.slice(6);
		enable("g", grant({ level: "read" }));
		expect(access.find(token)?.level).toBe("read");
	});

	test("fermeture brutale de l'appli : killAllSync tue les plugins", async () => {
		write("k", KEEP_ALIVE);
		mgr.scan();
		enable("k");
		await waitFor(() => info("k").state === "running");
		const pid = info("k").pid!;
		mgr.killAllSync();
		await waitFor(() => {
			try {
				process.kill(pid, 0);
				return false;
			} catch {
				return true;
			}
		});
	});
});
