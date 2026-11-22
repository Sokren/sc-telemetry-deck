import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { defaultLayout } from "../../src/web/view.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});
async function start() {
	const s = await startTestServer({ game: null });
	servers.push(s);
	return s;
}
const layout = () => JSON.parse(JSON.stringify(defaultLayout("fr").sections));

/** Lit le flux SSE jusqu'à recevoir `count` événements `views`. */
async function viewsEvents(s: TestServer, count: number, during: () => Promise<void>, lang = "fr"): Promise<any[]> {
	const ctrl = new AbortController();
	const res = await fetch(`${s.url}/api/v1/events?t=${s.token}&lang=${lang}`, { signal: ctrl.signal });
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	const seen: any[] = [];
	let buf = "";
	let triggered = false;
	while (seen.length < count) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		const blocks = buf.split("\n\n");
		buf = blocks.pop()!;
		for (const b of blocks) if (b.startsWith("event: views")) seen.push(JSON.parse(b.match(/^data: (.+)$/m)![1]));
		if (seen.length > 0 && !triggered) {
			triggered = true;
			await during();
		}
	}
	ctrl.abort();
	return seen;
}

describe("/api/v1/views", () => {
	test("GET : vue du premier lancement dans la langue demandée, conforme au contrat", async () => {
		const s = await start();
		const fr = await s.call("GET", "/api/v1/views?lang=fr");
		expect(fr.status).toBe(200);
		validateResponse("/api/v1/views", "GET", 200, fr.body);
		expect(fr.body).toEqual({ views: [{ id: "main", name: "Ma vue", sections: defaultLayout("fr").sections }] });
		expect((await s.call("GET", "/api/v1/views?lang=en")).body.views[0].name).toBe("My view");
	});

	test("POST : vue vide créée, 10 au plus", async () => {
		const s = await start();
		const r = await s.call("POST", "/api/v1/views?lang=fr", { body: { name: "Vol" } });
		expect(r.status).toBe(201);
		validateResponse("/api/v1/views", "POST", 201, r.body);
		expect(r.body).toMatchObject({ name: "Vol", sections: [] });
		for (let i = 0; i < 8; i++) expect((await s.call("POST", "/api/v1/views", { body: { name: `V${i}` } })).status).toBe(201);
		const full = await s.call("POST", "/api/v1/views", { body: { name: "Trop" } });
		expect(full.status).toBe(409);
		validateResponse("/api/v1/views", "POST", 409, full.body);
		expect(full.body).toEqual({ error: "too_many_views" });
		const bad = await s.call("POST", "/api/v1/views", { body: { name: 3 } });
		expect(bad.status).toBe(400);
		validateResponse("/api/v1/views", "POST", 400, bad.body);
	});

	test("PUT : deux écrans modifient deux vues différentes, rien n'est perdu ; fichier écrit", async () => {
		const s = await start();
		const b = (await s.call("POST", "/api/v1/views", { body: { name: "B" } })).body;
		const ra = await s.call("PUT", "/api/v1/views/main", { body: { name: "A", sections: [] } });
		expect(ra.status).toBe(200);
		validateResponse("/api/v1/views/{id}", "PUT", 200, ra.body);
		await s.call("PUT", `/api/v1/views/${b.id}`, { body: { name: "B2", sections: layout() } });
		const views = (await s.call("GET", "/api/v1/views")).body.views;
		expect(views.map((v: any) => [v.name, v.sections.length])).toEqual([
			["A", 0],
			["B2", 3],
		]);
		const file = JSON.parse(fs.readFileSync(path.join(path.dirname(s.deps.viewFile!), "view.json"), "utf-8"));
		expect(file.version).toBe(2);
		expect(file.views).toHaveLength(2);
	});

	test("PUT : cases morse (message enregistré, morse libre) gardées et conformes au contrat", async () => {
		const s = await start();
		const items = [
			{ id: "m1", kind: "morse", size: 1, settings: { text: "SOS", light: "ship_lights", unitMs: 300, repeat: 2 } },
			{ id: "m2", kind: "morse_free", size: 2, settings: { light: "flashlight", unitMs: 400, repeat: 1 } },
		];
		const r = await s.call("PUT", "/api/v1/views/main", { body: { name: "Morse", sections: [{ id: "s", title: "Morse", width: "full", items }] } });
		expect(r.status).toBe(200);
		validateResponse("/api/v1/views/{id}", "PUT", 200, r.body);
		expect(r.body.sections[0].items).toEqual(items);
		const bad = await s.call("PUT", "/api/v1/views/main", {
			body: { name: "Morse", sections: [{ id: "s", title: "Morse", width: "full", items: [{ id: "m", kind: "morse", size: 1, settings: { light: "flashlight", unitMs: 400, repeat: 1 } }] }] },
		});
		expect(bad.status).toBe(400);
	});

	test("PUT avec un nom d'action invalide : 400, rien d'enregistré ; vue inconnue : 404", async () => {
		const s = await start();
		const sections = layout();
		sections[0].items.push({ id: "boom", kind: "action", ref: "../boom", size: 1 });
		const r = await s.call("PUT", "/api/v1/views/main", { body: { name: "X", sections } });
		expect(r.status).toBe(400);
		validateResponse("/api/v1/views/{id}", "PUT", 400, r.body);
		expect(r.body).toEqual({ error: "invalid_view" });
		expect((await s.call("GET", "/api/v1/views?lang=fr")).body.views[0].name).toBe("Ma vue");
		const unknown = await s.call("PUT", "/api/v1/views/nope", { body: { name: "X", sections: [] } });
		expect(unknown.status).toBe(404);
		validateResponse("/api/v1/views/{id}", "PUT", 404, unknown.body);
		expect(unknown.body).toEqual({ error: "unknown_view" });
	});

	test("DELETE : supprime, refuse la dernière vue et une vue inconnue", async () => {
		const s = await start();
		const last = await s.call("DELETE", "/api/v1/views/main");
		expect(last.status).toBe(409);
		validateResponse("/api/v1/views/{id}", "DELETE", 409, last.body);
		expect(last.body).toEqual({ error: "last_view" });
		const b = (await s.call("POST", "/api/v1/views", { body: { name: "B" } })).body;
		expect((await s.call("DELETE", "/api/v1/views/main")).status).toBe(204);
		expect((await s.call("GET", "/api/v1/views")).body.views.map((v: any) => v.id)).toEqual([b.id]);
		const unknown = await s.call("DELETE", "/api/v1/views/main");
		expect(unknown.status).toBe(404);
		validateResponse("/api/v1/views/{id}", "DELETE", 404, unknown.body);
	});

	test("flux SSE : vues envoyées à la connexion, puis après chaque changement", async () => {
		const s = await start();
		const seen = await viewsEvents(s, 2, async () => {
			await s.call("POST", "/api/v1/views?lang=fr", { body: { name: "Vol" } });
		});
		expect(seen[0].views.map((v: any) => v.name)).toEqual(["Ma vue"]);
		expect(seen[1].views.map((v: any) => v.name)).toEqual(["Ma vue", "Vol"]);
	});
});
