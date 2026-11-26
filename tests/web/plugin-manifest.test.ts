import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fingerprint, readPlugin, type ExecFinder } from "../../src/web/plugins/manifest.js";

let root: string;
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "sc-plg-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const finder: ExecFinder = { node: () => "C:\\node\\node.exe", python: () => "C:\\Python\\python.exe" };
const CONTRACT = "1.12.0";

function plugin(folder: string, manifest: unknown, files: Record<string, string> = { "main.mjs": "console.log(1)" }): string {
	const dir = path.join(root, folder);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, "plugin.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
	for (const [f, c] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
		fs.writeFileSync(path.join(dir, f), c);
	}
	return dir;
}
const ok = { name: "Overlay OBS", version: "1.0.0", run: { exec: "node", args: ["main.mjs", "--port", "9000"] }, access: "read" };

describe("manifeste plugin.json", () => {
	test("valide : node + script du dossier, commande exacte, droits vues", () => {
		const dir = plugin("overlay", { ...ok, author: "Moi", description: "Santé dans OBS", views: ["read", "create"], contract: "1.12.0" });
		const r = readPlugin(dir, { finder, contract: CONTRACT });
		expect(r).toEqual({
			ok: true,
			id: "overlay",
			manifest: { name: "Overlay OBS", version: "1.0.0", author: "Moi", description: "Santé dans OBS", access: "read", views: ["read", "create"], contract: "1.12.0" },
			command: { kind: "node", file: "C:\\node\\node.exe", script: path.join(fs.realpathSync(dir), "main.mjs"), args: ["--port", "9000"] },
		});
	});

	test("python : interpréteur trouvé dans le PATH ; absent → raison", () => {
		const dir = plugin("meteo", { ...ok, run: { exec: "python", args: ["meteo.py"] } }, { "meteo.py": "print(1)" });
		expect(readPlugin(dir, { finder, contract: CONTRACT })).toMatchObject({ ok: true, command: { kind: "python", file: "C:\\Python\\python.exe" } });
		expect(readPlugin(dir, { finder: { ...finder, python: () => undefined }, contract: CONTRACT })).toEqual({ ok: false, id: "meteo", reason: "python_missing" });
		expect(readPlugin(dir, { finder: { ...finder, node: () => undefined }, contract: CONTRACT }).ok).toBe(true);
	});

	test("exécutable du dossier (.exe)", () => {
		const dir = plugin("outil", { ...ok, run: { exec: "bin/outil.exe" } }, { "bin/outil.exe": "MZ" });
		expect(readPlugin(dir, { finder, contract: CONTRACT })).toMatchObject({ ok: true, command: { kind: "file", file: path.join(fs.realpathSync(dir), "bin", "outil.exe"), args: [] } });
	});

	test.each([
		["plugin.json illisible", "{pas du json", "manifest_unreadable"],
		["nom vide", { ...ok, name: " " }, "manifest_invalid"],
		["nom trop long", { ...ok, name: "x".repeat(41) }, "manifest_invalid"],
		["niveau inconnu", { ...ok, access: "admin" }, "manifest_invalid"],
		["droit de vue inconnu", { ...ok, views: ["delete"] }, "manifest_invalid"],
		["arguments pas des chaînes", { ...ok, run: { exec: "node", args: ["main.mjs", 3] } }, "manifest_invalid"],
		["ligne de commande dans exec", { ...ok, run: { exec: "node main.mjs & del C:\\x" } }, "exec_invalid"],
		["exec avec |", { ...ok, run: { exec: "a.exe|b.exe" } }, "exec_invalid"],
		["exec hors du dossier", { ...ok, run: { exec: "..\\..\\outil.exe" } }, "exec_outside"],
		["exec chemin absolu", { ...ok, run: { exec: "C:\\Windows\\System32\\cmd.exe" } }, "exec_outside"],
		["exec absent", { ...ok, run: { exec: "absent.exe" } }, "exec_missing"],
		["script .cmd (passerait par un shell)", { ...ok, run: { exec: "go.cmd" } }, "exec_type"],
		["node sans script", { ...ok, run: { exec: "node" } }, "script_missing"],
		["node avec une option avant le script", { ...ok, run: { exec: "node", args: ["--allow-addons", "main.mjs"] } }, "script_missing"],
		["script hors du dossier", { ...ok, run: { exec: "node", args: ["..\\autre\\main.mjs"] } }, "script_outside"],
		["contrat trop récent", { ...ok, contract: "9.0.0" }, "contract_too_new"],
	])("refus : %s", (_n, manifest, reason) => {
		const dir = plugin("p", manifest, { "main.mjs": "1", "go.cmd": "echo", "a.exe": "MZ" });
		fs.mkdirSync(path.join(root, "autre"), { recursive: true });
		fs.writeFileSync(path.join(root, "autre", "main.mjs"), "1");
		expect(readPlugin(dir, { finder, contract: CONTRACT })).toEqual({ ok: false, id: "p", reason });
	});

	test("nom de dossier refusé (espaces, points)", () => {
		expect(readPlugin(plugin("mon plugin", ok), { finder, contract: CONTRACT })).toMatchObject({ ok: false, reason: "folder_name" });
	});

	test("noms réservés de JavaScript (__proto__, constructor…) → nom de dossier refusé", () => {
		for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"])
			expect(readPlugin(plugin(name, ok), { finder, contract: CONTRACT })).toMatchObject({ ok: false, id: name, reason: "folder_name" });
	});

	test("script par un lien (jonction) vers l'extérieur → refusé", () => {
		const dir = plugin("p", { ...ok, run: { exec: "node", args: ["lien/main.mjs"] } });
		const outside = path.join(root, "dehors");
		fs.mkdirSync(outside);
		fs.writeFileSync(path.join(outside, "main.mjs"), "1");
		fs.symlinkSync(outside, path.join(dir, "lien"), "junction");
		expect(readPlugin(dir, { finder, contract: CONTRACT })).toEqual({ ok: false, id: "p", reason: "script_outside" });
	});
});

describe("empreinte des fichiers", () => {
	test("stable, change quand un fichier change ou s'ajoute ; dossier data ignoré", () => {
		const dir = plugin("p", ok, { "main.mjs": "a", "lib/x.mjs": "b" });
		const a = fingerprint(dir);
		if (!("hash" in a)) throw new Error(a.error);
		expect(a.files).toBe(3);
		expect(fingerprint(dir)).toEqual(a);
		fs.mkdirSync(path.join(dir, "data"));
		fs.writeFileSync(path.join(dir, "data", "state.json"), "{}");
		expect(fingerprint(dir)).toEqual(a);
		fs.writeFileSync(path.join(dir, "lib/x.mjs"), "c");
		const b = fingerprint(dir);
		expect(b).not.toEqual(a);
		fs.writeFileSync(path.join(dir, "new.txt"), "");
		expect(fingerprint(dir)).not.toEqual(b);
	});

	test("lien dans le dossier → refusé", () => {
		const dir = plugin("p", ok);
		const outside = path.join(root, "dehors");
		fs.mkdirSync(outside);
		fs.symlinkSync(outside, path.join(dir, "lien"), "junction");
		expect(fingerprint(dir)).toEqual({ error: "symlink" });
	});
});

describe("interpréteurs dans le PATH", () => {
	test("trouvé (.exe), alias du Microsoft Store ignorés, absent → undefined", async () => {
		const { findInPath } = await import("../../src/web/plugins/find.js");
		const bin = path.join(root, "bin");
		const store = path.join(root, "WindowsApps");
		fs.mkdirSync(bin);
		fs.mkdirSync(store);
		const ext = process.platform === "win32" ? ".exe" : "";
		fs.writeFileSync(path.join(store, `python${ext}`), "");
		fs.writeFileSync(path.join(bin, `python${ext}`), "");
		fs.writeFileSync(path.join(bin, "node.cmd"), "");
		const env = { PATH: [store, bin].join(path.delimiter) };
		expect(findInPath("python", env)).toBe(path.join(bin, `python${ext}`));
		if (process.platform === "win32") expect(findInPath("node", env)).toBeUndefined();
		expect(findInPath("absent", env)).toBeUndefined();
	});
});

describe("plugin d'exemple livré", () => {
	test("examples/plugins/bonjour-telemetrie est valide", () => {
		const dir = path.resolve("examples/plugins/bonjour-telemetrie");
		expect(readPlugin(dir, { finder, contract: CONTRACT })).toMatchObject({ ok: true, id: "bonjour-telemetrie", manifest: { access: "read" } });
	});
});

describe("corrections de la relecture : code hors empreinte", () => {
	test("script ou exe dans data/ (où le plugin écrit) → refusé", () => {
		const a = plugin("a", { ...ok, run: { exec: "node", args: ["data/x.mjs"] } }, { "data/x.mjs": "1" });
		expect(readPlugin(a, { finder, contract: CONTRACT })).toEqual({ ok: false, id: "a", reason: "path_invalid" });
		const b = plugin("b", { ...ok, run: { exec: "data/x.exe" } }, { "data/x.exe": "MZ" });
		expect(readPlugin(b, { finder, contract: CONTRACT })).toEqual({ ok: false, id: "b", reason: "path_invalid" });
	});

	test("flux NTFS (main.mjs:cache) → refusé", () => {
		const dir = plugin("p", { ...ok, run: { exec: "node", args: ["main.mjs:cache"] } });
		expect(readPlugin(dir, { finder, contract: CONTRACT })).toEqual({ ok: false, id: "p", reason: "path_invalid" });
		const e = plugin("q", { ...ok, run: { exec: "a.exe:cache" } }, { "a.exe": "MZ" });
		expect(readPlugin(e, { finder, contract: CONTRACT })).toEqual({ ok: false, id: "q", reason: "path_invalid" });
	});

	test("PATH : entrées relatives ignorées", async () => {
		const { findInPath } = await import("../../src/web/plugins/find.js");
		const ext = process.platform === "win32" ? ".exe" : "";
		const prev = process.cwd();
		process.chdir(root);
		try {
			fs.writeFileSync(path.join(root, `python${ext}`), "");
			expect(findInPath("python", { PATH: ["", "."].join(path.delimiter) })).toBeUndefined();
		} finally {
			process.chdir(prev);
		}
	});
});
