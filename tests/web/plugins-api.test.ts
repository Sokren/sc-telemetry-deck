import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

let dir: string;
let srv: TestServer;
const opened: string[] = [];

beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-plgapi-"));
	opened.length = 0;
	srv = await startTestServer({ game: null, extra: { plugins: { dir, finder: { node: () => process.execPath, python: () => undefined }, openFolder: (d) => opened.push(d) } } });
});
afterEach(async () => {
	await srv.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

function write(id: string, script = "setInterval(() => {}, 1000);", manifest: Record<string, unknown> = {}): void {
	fs.mkdirSync(path.join(dir, id), { recursive: true });
	fs.writeFileSync(path.join(dir, id, "plugin.json"), JSON.stringify({ name: id, version: "1.0.0", run: { exec: "node", args: ["main.mjs"] }, access: "pilot", views: ["read"], ...manifest }));
	fs.writeFileSync(path.join(dir, id, "main.mjs"), script);
}
const waitFor = async (cond: () => Promise<boolean>, ms = 8000) => {
	const end = Date.now() + ms;
	while (!(await cond())) {
		if (Date.now() > end) throw new Error("délai dépassé");
		await new Promise((r) => setTimeout(r, 30));
	}
};
const views = { read: true, edit: false, create: false };

describe("API des plugins (jeton principal, PC)", () => {
	test("liste, rescanner, activer, journal, arrêter, relancer, désactiver", async () => {
		write("overlay", `const r = await fetch(process.env.SC_TELEMETRY_URL + "/api/v1/lan", { headers: { authorization: "Bearer " + process.env.SC_TELEMETRY_TOKEN } }); console.log("LAN " + r.status); setInterval(() => {}, 1000);`);
		const list = await srv.call("GET", "/api/v1/plugins");
		expect(list.status).toBe(200);
		validateResponse("/api/v1/plugins", "GET", 200, list.body);
		expect(list.body.plugins).toEqual([]);
		const scanned = await srv.call("POST", "/api/v1/plugins/scan");
		validateResponse("/api/v1/plugins/scan", "POST", 200, scanned.body);
		const p = scanned.body.plugins[0];
		expect(p).toMatchObject({ id: "overlay", state: "new", command: "node main.mjs", protection: "node", manifest: { name: "overlay", access: "pilot" } });

		const bad = await srv.call("POST", "/api/v1/plugins/overlay/enable", { body: { hash: "0".repeat(64), level: "read", views } });
		expect(bad).toMatchObject({ status: 409, body: { error: "hash_mismatch" } });
		expect((await srv.call("POST", "/api/v1/plugins/overlay/enable", { body: { hash: p.hash, level: "pilot_full", views } })).body).toEqual({ error: "invalid_plugin_grant" });
		const on = await srv.call("POST", "/api/v1/plugins/overlay/enable", { body: { hash: p.hash, level: "read", views } });
		expect(on.status).toBe(200);
		validateResponse("/api/v1/plugins/{id}/enable", "POST", 200, on.body);
		expect(on.body).toMatchObject({ state: "running", grant: { level: "read", views } });

		// Le plugin appelle l'API avec son jeton : refus « level » visible dans son journal et sa sortie.
		await waitFor(async () => (await srv.call("GET", "/api/v1/plugins/overlay/log")).body.output.some((l: { text: string }) => l.text === "LAN 403"));
		const log = await srv.call("GET", "/api/v1/plugins/overlay/log");
		validateResponse("/api/v1/plugins/{id}/log", "GET", 200, log.body);
		expect(log.body.calls.entries).toEqual([expect.objectContaining({ path: "/api/v1/lan", status: 403 })]);
		expect(log.body.calls.refused).toBe(1);

		const off = await srv.call("POST", "/api/v1/plugins/overlay/stop");
		validateResponse("/api/v1/plugins/{id}/stop", "POST", 200, off.body);
		expect(off.body.state).toBe("stopped");
		expect((await srv.call("POST", "/api/v1/plugins/overlay/restart")).body.state).toBe("running");
		expect((await srv.call("POST", "/api/v1/plugins/overlay/disable")).body.state).toBe("disabled");
		const notEnabled = await srv.call("POST", "/api/v1/plugins/overlay/start");
		expect(notEnabled).toMatchObject({ status: 409, body: { error: "not_enabled" } });
		validateResponse("/api/v1/plugins/{id}/start", "POST", 409, notEnabled.body);
		expect((await srv.call("POST", "/api/v1/plugins/nope/start")).status).toBe(404);
		expect((await srv.call("GET", "/api/v1/plugins/nope/log")).status).toBe(404);
	});

	test("ouvrir le dossier ; sans empreinte → 409 hash_mismatch ; droits mal formés → 400", async () => {
		write("a");
		await srv.call("POST", "/api/v1/plugins/scan");
		expect((await srv.call("POST", "/api/v1/plugins/open-folder")).status).toBe(204);
		expect(opened).toEqual([dir]);
		expect((await srv.call("POST", "/api/v1/plugins/a/enable", { body: { level: "read" } })).status).toBe(409);
		expect((await srv.call("POST", "/api/v1/plugins/a/enable", { body: "x" })).status).toBe(409);
		const p = (await srv.call("GET", "/api/v1/plugins")).body.plugins[0];
		expect((await srv.call("POST", "/api/v1/plugins/a/enable", { body: { hash: p.hash, level: "read", views: { read: "yes" } } })).body).toEqual({ error: "invalid_plugin_grant" });
	});

	test("hors PC → pc_only ; jeton de plugin ou externe → refusé", async () => {
		const ext = srv.access.create({ name: "x", level: "pilot_full", lan: false });
		if (typeof ext === "string") throw new Error(ext);
		const r = await fetch(`${srv.url}/api/v1/plugins`, { headers: { authorization: `Bearer ${ext.secret}` } });
		expect(r.status).toBe(403);
		await srv.close();
		srv = await startTestServer({ game: null, extra: { isLocal: () => false, plugins: { dir, finder: { node: () => process.execPath, python: () => undefined } } } });
		expect((await srv.call("GET", "/api/v1/plugins")).body).toEqual({ error: "pc_only" });
	});
});
