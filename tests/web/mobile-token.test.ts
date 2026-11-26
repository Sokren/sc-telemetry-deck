import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startTestServer, type TestServer } from "./harness.js";

/** Jeton admin (PC seulement) et jeton mobile (tablettes, téléphones : droits de la page sans l'administration). */
let server: TestServer;
let local = true;
beforeEach(async () => {
	local = true;
	server = await startTestServer({ extra: { isLocal: () => local } });
});
afterEach(() => server.close());

const PC_ONLY = { error: "forbidden", reason: "pc_only" };
/** Routes d'administration : réseau local, jetons externes, plugins, réglage des mises à jour. */
const isAdminRoute = (r: { method: string; path: string }) =>
	/^\/api\/v1\/(lan|access|plugins)(\/|$)/.test(r.path) || (r.path === "/api/v1/update" && r.method === "PUT") || r.path === "/api/v1/update/check";
const concrete = (p: string) => p.replace(/\{[^}]+\}/g, "x");

describe("jeton admin : PC seulement", () => {
	test("sur le PC : routes de la page et d'administration", async () => {
		for (const p of ["/api/v1/status", "/api/v1/lan", "/api/v1/access/tokens"]) expect((await server.call("GET", p)).status, p).toBe(200);
	});

	test("hors PC : 403 pc_only partout", async () => {
		local = false;
		for (const p of ["/api/v1/status", "/api/v1/views", "/api/v1/lan"]) {
			const r = await server.call("GET", p);
			expect(r.status, p).toBe(403);
			expect(r.body, p).toEqual(PC_ONLY);
		}
	});
});

describe("jeton mobile : droits de la page", () => {
	test("PC ou réseau : lire, vues, debug, état des mises à jour, actions", async () => {
		for (const where of [true, false]) {
			local = where;
			for (const p of ["/api/v1/status", "/api/v1/views", "/api/v1/debug", "/api/v1/update", "/api/v1/ship/functions"]) {
				expect([401, 403], `${p} (PC: ${where})`).not.toContain((await server.call("GET", p, { auth: "mobile" })).status);
			}
			const created = await server.call("POST", "/api/v1/views", { auth: "mobile", body: { name: `Mobile ${where}` } });
			expect(created.status).toBe(201);
			const trigger = await server.call("POST", "/api/v1/actions/v_lights_on/trigger", { auth: "mobile" });
			expect([401, 403]).not.toContain(trigger.status);
		}
	});

	test("routes d'administration refusées, même sur le PC", async () => {
		const admin = server.routes.filter(isAdminRoute);
		expect(admin.length).toBeGreaterThan(10);
		for (const r of admin) {
			const res = await server.call(r.method, concrete(r.path), { auth: "mobile", body: r.method === "GET" ? undefined : {} });
			expect(res.status, `${r.method} ${r.path}`).toBe(403);
			expect(res.body, `${r.method} ${r.path}`).toEqual(PC_ONLY);
		}
	});

	test("accepté en ?t= (flux d'événements de la page)", async () => {
		const res = await fetch(`${server.url}/api/v1/status?t=${server.mobileToken}`);
		expect(res.status).toBe(200);
	});
});

describe("jetons externes : inchangés", () => {
	test("jeton Lecture : lit, ne déclenche pas", async () => {
		const made = await server.call("POST", "/api/v1/access/tokens", { body: { name: "Overlay", level: "read", lan: false } });
		expect(made.status).toBe(201);
		const headers = { authorization: `Bearer ${made.body.secret}` };
		expect((await fetch(`${server.url}/api/v1/status`, { headers })).status).toBe(200);
		const trig = await fetch(`${server.url}/api/v1/actions/v_lights_on/trigger`, { method: "POST", headers });
		expect(trig.status).toBe(403);
		expect(await trig.json()).toEqual({ error: "forbidden", reason: "level" });
	});
});

describe("routes d'administration marquées", () => {
	test("exactement les routes réseau, jetons, plugins et réglage des mises à jour", () => {
		for (const r of server.routes) expect(r.admin === true, `${r.method} ${r.path}`).toBe(isAdminRoute(r));
	});
});
