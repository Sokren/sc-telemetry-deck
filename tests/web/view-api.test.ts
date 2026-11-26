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

	test("modèles : liste traduite, création depuis un modèle, erreurs", async () => {
		const s = await start();
		const list = await s.call("GET", "/api/v1/views/templates?lang=en");
		expect(list.status).toBe(200);
		validateResponse("/api/v1/views/templates", "GET", 200, list.body);
		expect(list.body.templates.map((t: any) => t.id)).toEqual(["xeneon_pilot", "instrument_panel"]);
		expect(list.body.templates[0]).toMatchObject({ id: "xeneon_pilot", name: "Xeneon Edge – pilot", size: { width: 2560, height: 720 } });
		const made = await s.call("POST", "/api/v1/views?lang=fr", { body: { template: "xeneon_pilot" } });
		expect(made.status).toBe(201);
		validateResponse("/api/v1/views", "POST", 201, made.body);
		expect(made.body).toMatchObject({ name: "Xeneon Edge – pilote", look: "cockpit" });
		expect(made.body.sections.map((x: any) => x.width)).toEqual(["full", "third", "third", "third", "third"]);
		const renamed = await s.call("POST", "/api/v1/views?lang=fr", { body: { template: "xeneon_pilot", name: "Mon Xeneon" } });
		expect(renamed.body.name).toBe("Mon Xeneon");
		const nope = await s.call("POST", "/api/v1/views", { body: { template: "nope" } });
		expect(nope.status).toBe(400);
		validateResponse("/api/v1/views", "POST", 400, nope.body);
		expect(nope.body).toEqual({ error: "unknown_template" });
		const both = await s.call("POST", "/api/v1/views", { body: { template: "xeneon_pilot", sections: [] } });
		expect(both.status).toBe(400);
		expect(both.body).toEqual({ error: "invalid_view" });
		for (let i = 0; i < 7; i++) expect((await s.call("POST", "/api/v1/views", { body: { name: `V${i}` } })).status).toBe(201);
		const full = await s.call("POST", "/api/v1/views", { body: { template: "xeneon_pilot" } });
		expect(full.status).toBe(409);
		expect(full.body).toEqual({ error: "too_many_views" });
		const fullInstrument = await s.call("POST", "/api/v1/views", { body: { template: "instrument_panel", name: "Instrument de bord" } });
		expect(fullInstrument.status).toBe(409);
	});

	test("modèle Instrument de bord : copie avec son habillage, compte dans les 10", async () => {
		const s = await start();
		const made = await s.call("POST", "/api/v1/views?lang=fr", { body: { template: "instrument_panel", name: "Instrument de bord" } });
		expect(made.status).toBe(201);
		validateResponse("/api/v1/views", "POST", 201, made.body);
		expect(made.body).toMatchObject({ name: "Instrument de bord", look: "instrument" });
		const views = await s.call("GET", "/api/v1/views");
		expect(views.body.views.some((v: any) => v.id === made.body.id)).toBe(true);
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

describe("/api/v1/views/export et /import", () => {
	const doc = async (s: TestServer, q = "") => (await s.call("GET", `/api/v1/views/export?lang=fr${q.replace("?", "&")}`)).body;

	test("export d'une vue, de toutes, et en code", async () => {
		const s = await start();
		await s.call("POST", "/api/v1/views?lang=fr", { body: { name: "Vol" } });
		const all = await s.call("GET", "/api/v1/views/export?lang=fr");
		expect(all.status).toBe(200);
		validateResponse("/api/v1/views/export", "GET", 200, all.body);
		expect(all.body).toMatchObject({ format: "sc-telemetry-deck.views", format_version: 1, app_version: "0.0.0-test" });
		expect(all.body.views.map((v: any) => v.name)).toEqual(["Ma vue", "Vol"]);
		expect((await doc(s, "?id=main")).views).toHaveLength(1);
		const code = await s.call("GET", "/api/v1/views/export?id=main&as=code");
		validateResponse("/api/v1/views/export", "GET", 200, code.body);
		expect(code.body).toMatchObject({ app_version: "0.0.0-test" });
		expect(code.body.code).toMatch(/^SCTD1:/);
		expect((await s.call("GET", "/api/v1/views/export?id=nope")).status).toBe(404);
	});

	test("dry_run : aperçu, rien de créé", async () => {
		const s = await start();
		const r = await s.call("POST", "/api/v1/views/import?dry_run=1", { body: await doc(s) });
		expect(r.status).toBe(200);
		validateResponse("/api/v1/views/import", "POST", 200, r.body);
		expect(r.body).toMatchObject({ app_version: "0.0.0-test", from_version: "0.0.0-test", skipped: [], views: [{ name: "Ma vue", sections: 3, items: 10 }] });
		expect(r.body.views[0]).not.toHaveProperty("id");
		expect((await s.call("GET", "/api/v1/views")).body.views).toHaveLength(1);
	});

	test("import d'un code : vue ajoutée, nouvel id, événement views envoyé", async () => {
		const s = await start();
		const { code } = (await s.call("GET", "/api/v1/views/export?id=main&as=code&lang=fr")).body;
		let r: any;
		const events = await viewsEvents(s, 2, async () => {
			r = await s.call("POST", "/api/v1/views/import?lang=fr", { body: { code } });
		});
		expect(r.status).toBe(201);
		validateResponse("/api/v1/views/import", "POST", 201, r.body);
		expect(r.body.views[0].id).not.toBe("main");
		expect(events[1].views).toHaveLength(2);
		expect((await s.call("GET", "/api/v1/views")).body.views.map((v: any) => v.name)).toEqual(["Ma vue", "Ma vue"]);
	});

	test("import avec cases ignorées rapporte from_version et skipped", async () => {
		const s = await start();
		const d = await doc(s, "?id=main");
		d.app_version = "0.3.14";
		d.views[0].sections[1].items.push({ id: "g", kind: "instrument", ref: "g_load", size: 1 });
		const r = await s.call("POST", "/api/v1/views/import", { body: d });
		expect(r.status).toBe(201);
		expect(r.body).toMatchObject({
			from_version: "0.3.14",
			skipped: [{ view: "Ma vue", section: "Vol", kind: "instrument", ref: "g_load", reason: "unknown_ref" }],
		});
	});

	test("plus de 10 vues → 409 avec free, rien de créé", async () => {
		const s = await start();
		for (let i = 0; i < 8; i++) await s.call("POST", "/api/v1/views", { body: { name: `V${i}` } });
		const d = await doc(s, "?id=main");
		d.views = [d.views[0], d.views[0]];
		const r = await s.call("POST", "/api/v1/views/import", { body: d });
		expect(r.status).toBe(409);
		validateResponse("/api/v1/views/import", "POST", 409, r.body);
		expect(r.body).toEqual({ error: "too_many_views", free: 1 });
		expect((await s.call("GET", "/api/v1/views")).body.views).toHaveLength(9);
		expect((await s.call("POST", "/api/v1/views/import?dry_run=1", { body: d })).status).toBe(409);
	});

	test("sauvegarde de 9 vues pleines (> 64 Ko) acceptée", async () => {
		const s = await start();
		const items = Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, kind: "vital", ref: "oxygen", size: 1 }));
		const section = (j: number) => ({ id: `s${j}`, title: `Section ${j}`, width: "half", items: items.map((it) => ({ ...it, id: `${it.id}s${j}` })) });
		const view = { name: "Pleine", sections: Array.from({ length: 20 }, (_, j) => section(j)) };
		const d = { ...(await doc(s)), views: Array.from({ length: 9 }, () => view) };
		expect(JSON.stringify(d).length).toBeGreaterThan(64 * 1024);
		const r = await s.call("POST", "/api/v1/views/import?dry_run=1", { body: d });
		expect(r.status).toBe(200);
		expect(r.body.views).toHaveLength(9);
	});

	test("code abîmé → 400 invalid_export", async () => {
		const s = await start();
		const r = await s.call("POST", "/api/v1/views/import", { body: { code: "SCTD1:abc" } });
		expect(r.status).toBe(400);
		validateResponse("/api/v1/views/import", "POST", 400, r.body);
		expect(r.body).toEqual({ error: "invalid_export" });
	});
});
