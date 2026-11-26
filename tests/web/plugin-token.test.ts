import { afterEach, describe, expect, test } from "vitest";
import { AccessStore, type PluginGrant } from "../../src/web/access.js";
import type { WebSettings } from "../../src/web/config.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

const settings = (): WebSettings => ({ port: 8743, lan: false, token: "x".repeat(32) });
const grant = (over: Partial<PluginGrant> = {}): PluginGrant => ({ level: "read", views: { read: false, edit: false, create: false }, ...over });

describe("jetons de plugin : modèle", () => {
	test("sct_plg_, en mémoire seulement, absent de la liste, révocable, journal à part", () => {
		const s = settings();
		const store = new AccessStore(s, () => {});
		const secret = store.issuePlugin("overlay", "Overlay OBS", grant({ level: "pilot" }));
		expect(secret).toMatch(/^sct_plg_[A-Za-z0-9_-]{43}$/);
		expect(s.access).toBeUndefined();
		expect(store.list()).toEqual([]);
		const tok = store.find(secret);
		expect(tok).toMatchObject({ id: "plugin:overlay", name: "Overlay OBS", level: "pilot", lan: false, plugin: { id: "overlay" } });
		store.record("plugin:overlay", { at: "t", method: "GET", path: "/p", status: 403 });
		expect(store.log("plugin:overlay").refused).toBe(1);
		// Nouveau lancement : nouveau secret, l'ancien ne marche plus.
		const again = store.issuePlugin("overlay", "Overlay OBS", grant());
		expect(store.find(secret)).toBeUndefined();
		expect(store.find(again)?.level).toBe("read");
		store.revokePlugin("overlay");
		expect(store.find(again)).toBeUndefined();
		expect(store.find("sct_plg_inconnu")).toBeUndefined();
	});
});

let srv: TestServer | undefined;
afterEach(async () => {
	await srv?.close();
	srv = undefined;
});

async function as(secret: string, method: string, path: string, body?: unknown) {
	const res = await fetch(srv!.url + path, {
		method,
		headers: { authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await res.text();
	return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

/** Jeton de plugin délivré par l'appli de test (même magasin que les jetons externes). */
function issue(id: string, g: PluginGrant): string {
	return srv!.access.issuePlugin(id, id, g);
}

const view = (name: string) => ({ name, sections: [{ id: "s1", title: "A", width: "full", items: [] }] });

describe("jetons de plugin : API", () => {
	test("niveau appliqué, PC seulement, jamais dans l'adresse", async () => {
		srv = await startTestServer({ game: null });
		const secret = issue("p", grant());
		expect((await as(secret, "GET", "/api/v1/status")).status).toBe(200);
		expect(await as(secret, "GET", "/api/v1/lan")).toEqual({ status: 403, body: { error: "forbidden", reason: "level" } });
		expect((await fetch(`${srv.url}/api/v1/status?t=${secret}`)).status).toBe(401);
		await srv.close();
		srv = await startTestServer({ game: null, extra: { isLocal: () => false } });
		const remote = issue("p", grant());
		expect(await as(remote, "GET", "/api/v1/status")).toEqual({ status: 403, body: { error: "forbidden", reason: "lan" } });
	});

	test("vues : sans droit → 403 view ; jeton externe → 403 level", async () => {
		srv = await startTestServer({ game: null });
		const none = issue("p", grant({ level: "pilot_full" }));
		const r = await as(none, "GET", "/api/v1/views");
		expect(r).toEqual({ status: 403, body: { error: "forbidden", reason: "view" } });
		validateResponse("/api/v1/views", "GET", 403, r.body);
		const ext = srv.access.create({ name: "x", level: "pilot_full", lan: false });
		if (typeof ext === "string") throw new Error(ext);
		expect((await as(ext.secret, "GET", "/api/v1/views")).body).toEqual({ error: "forbidden", reason: "level" });
		for (const [m, p] of [["GET", "/api/v1/views/export"], ["GET", "/api/v1/views/templates"], ["POST", "/api/v1/views/import"]] as const)
			expect((await as(none, m, p, m === "POST" ? {} : undefined)).body).toEqual({ error: "forbidden", reason: "level" });
	});

	test("lire : toutes les vues ; créer : refusé", async () => {
		srv = await startTestServer({ game: null });
		const reader = issue("p", grant({ views: { read: true, edit: false, create: false } }));
		const list = await as(reader, "GET", "/api/v1/views");
		expect(list.status).toBe(200);
		expect(list.body.views.map((v: { id: string }) => v.id)).toEqual(["main"]);
		expect((await as(reader, "POST", "/api/v1/views", view("X"))).body).toEqual({ error: "forbidden", reason: "view" });
		expect((await as(reader, "PUT", "/api/v1/views/main", view("X"))).body).toEqual({ error: "forbidden", reason: "view" });
	});

	test("créer : vue marquée du plugin, modifiable et supprimable par lui seul ; vues du joueur intouchables", async () => {
		srv = await startTestServer({ game: null });
		const maker = issue("compteur", grant({ views: { read: false, edit: false, create: true } }));
		const c = await as(maker, "POST", "/api/v1/views", view("Compteur"));
		expect(c.status).toBe(201);
		validateResponse("/api/v1/views", "POST", 201, c.body);
		expect(c.body.plugin).toBe("compteur");
		// Sans « lire » : il ne voit que ses vues.
		const mine = await as(maker, "GET", "/api/v1/views");
		expect(mine.body.views.map((v: { id: string }) => v.id)).toEqual([c.body.id]);
		const up = await as(maker, "PUT", `/api/v1/views/${c.body.id}`, view("Compteur 2"));
		expect(up.status).toBe(200);
		expect(up.body.plugin).toBe("compteur");
		expect((await as(maker, "PUT", "/api/v1/views/main", view("pirate"))).body).toEqual({ error: "forbidden", reason: "view" });
		expect((await as(maker, "DELETE", "/api/v1/views/main")).body).toEqual({ error: "forbidden", reason: "view" });
		// Un autre plugin ne touche pas à cette vue ; le joueur (jeton principal) garde tout.
		const other = issue("autre", grant({ views: { read: true, edit: false, create: true } }));
		expect((await as(other, "PUT", `/api/v1/views/${c.body.id}`, view("x"))).body).toEqual({ error: "forbidden", reason: "view" });
		expect((await srv.call("PUT", `/api/v1/views/${c.body.id}`, { body: view("Joueur") })).body.plugin).toBe("compteur");
		expect((await as(maker, "DELETE", `/api/v1/views/${c.body.id}`)).status).toBe(204);
	});

	test("modifier : seulement les vues accordées, ou toutes", async () => {
		srv = await startTestServer({ game: null });
		const second = (await srv.call("POST", "/api/v1/views", { body: view("Mining") })).body.id as string;
		const some = issue("p", grant({ views: { read: false, edit: ["main"], create: false } }));
		expect((await as(some, "PUT", "/api/v1/views/main", view("Ma vue"))).status).toBe(200);
		expect((await as(some, "PUT", `/api/v1/views/${second}`, view("x"))).body).toEqual({ error: "forbidden", reason: "view" });
		expect((await as(some, "GET", "/api/v1/views")).body.views.map((v: { id: string }) => v.id)).toEqual(["main"]);
		const all = issue("q", grant({ views: { read: false, edit: "all", create: false } }));
		expect((await as(all, "PUT", `/api/v1/views/${second}`, view("Mining 2"))).status).toBe(200);
		expect((await as(all, "DELETE", `/api/v1/views/${second}`)).status).toBe(204);
	});
});

describe("flux d'événements : vues filtrées", () => {
	/** Premier événement `views` reçu sur le flux (ou `null` si aucun dans le premier envoi). */
	async function firstViews(secret: string): Promise<{ views: { id: string }[] } | null> {
		const res = await fetch(`${srv!.url}/api/v1/events`, { headers: { authorization: `Bearer ${secret}` } });
		const reader = res.body!.getReader();
		const { value } = await reader.read();
		await reader.cancel();
		const text = new TextDecoder().decode(value);
		const m = /event: views\ndata: (.*)\n/.exec(text);
		return m ? JSON.parse(m[1]) : null;
	}

	test("jeton externe et plugin sans droit : aucune vue ; plugin : ses vues seulement ; lire : toutes", async () => {
		srv = await startTestServer({ game: null });
		const own = (await as(issue("maker", grant({ views: { read: false, edit: false, create: true } })), "POST", "/api/v1/views", view("Compteur"))).body.id;
		const ext = srv.access.create({ name: "x", level: "read", lan: false });
		if (typeof ext === "string") throw new Error(ext);
		expect(await firstViews(ext.secret)).toBeNull();
		expect(await firstViews(issue("none", grant()))).toBeNull();
		expect((await firstViews(issue("maker", grant({ views: { read: false, edit: false, create: true } }))))!.views.map((v) => v.id)).toEqual([own]);
		expect((await firstViews(issue("reader", grant({ views: { read: true, edit: false, create: false } }))))!.views.map((v) => v.id)).toEqual(["main", own]);
	});
});
