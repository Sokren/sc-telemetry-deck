import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AccessLevel } from "../../src/web/access.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

const ME = "/api/v1/access/me";
const SAMPLE: Record<string, string> = { id: "health", name: "emote_wave", section: "actor" };
const concrete = (p: string) => p.replace(/\{([^}]+)\}/g, (_m, k: string) => SAMPLE[k] ?? "x");

let s: TestServer;
const secrets = {} as Record<AccessLevel, string>;
beforeAll(async () => {
	s = await startTestServer({ game: null });
	for (const level of ["read", "pilot", "pilot_full"] as const) {
		const r = s.access.create({ name: level, level, lan: false });
		if (typeof r === "string") throw new Error(r);
		secrets[level] = r.secret;
	}
});
afterAll(() => s.close());

async function asToken(secret: string, method: string, apiPath: string, server = s): Promise<{ status: number; body: any }> {
	const ac = new AbortController();
	const body = method === "POST" || method === "PUT" ? JSON.stringify(apiPath.endsWith("/morse") ? { text: "SOS" } : {}) : undefined;
	const res = await fetch(server.url + concrete(apiPath), {
		method,
		signal: ac.signal,
		headers: { authorization: `Bearer ${secret}`, ...(body ? { "content-type": "application/json" } : {}) },
		body,
	});
	if (apiPath.endsWith("/events")) {
		ac.abort();
		return { status: res.status, body: undefined };
	}
	const text = await res.text();
	return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

describe("GET /api/v1/access/me", () => {
	test("jeton Pilotage : 200, forme du contrat, can déduit du niveau", async () => {
		const r = await asToken(secrets.pilot, "GET", ME);
		expect(r.status).toBe(200);
		validateResponse(ME, "GET", 200, r.body);
		expect(r.body).toMatchObject({ kind: "external", name: "pilot", plugin: null, level: "pilot", custom: false });
		expect(r.body.can).toMatchObject({ "read.game": true, "actions.spaceship_power": true, "actions.protected": false, admin: false, "net.lan": false });
		const text = JSON.stringify(r.body);
		expect(text).not.toContain(secrets.pilot.slice(-4));
		for (const k of ["\"id\"", "hash", "last4", "created", "stopped"]) expect(text).not.toContain(k);
	});

	test("jeu injoignable : les 11 catégories de l'instantané", async () => {
		const r = await asToken(secrets.read, "GET", ME);
		const cats = Object.keys(r.body.can).filter((k) => k.startsWith("actions.") && !["actions.unknown", "actions.dangerous", "actions.protected"].includes(k));
		expect(cats).toHaveLength(11);
		expect(cats.every((k) => r.body.can[k] === false)).toBe(true);
	});

	test("jeton stoppé → 403 stopped", async () => {
		const r = s.access.create({ name: "stopme", level: "pilot", lan: false });
		if (typeof r === "string") throw new Error(r);
		s.access.stop(r.token.id);
		expect(await asToken(r.secret, "GET", ME)).toEqual({ status: 403, body: { error: "forbidden", reason: "stopped" } });
	});

	test("sans la case réseau local, hors du PC → 403 lan ; avec la case → 200, net.lan vrai", async () => {
		const remote = await startTestServer({ game: null, extra: { isLocal: () => false } });
		try {
			const pc = remote.access.create({ name: "pc", level: "read", lan: false });
			const lan = remote.access.create({ name: "lan", level: "read", lan: true });
			if (typeof pc === "string" || typeof lan === "string") throw new Error("create");
			expect(await asToken(pc.secret, "GET", ME, remote)).toEqual({ status: 403, body: { error: "forbidden", reason: "lan" } });
			const ok = await asToken(lan.secret, "GET", ME, remote);
			expect(ok.status).toBe(200);
			expect(ok.body.can["net.lan"]).toBe(true);
		} finally {
			await remote.close();
		}
	});

	test("jeton principal : kind main, level null, admin true", async () => {
		const r = await s.call("GET", ME);
		expect(r.status).toBe(200);
		validateResponse(ME, "GET", 200, r.body);
		expect(r.body).toMatchObject({ kind: "main", name: null, plugin: null, level: null, custom: false });
		expect(r.body.can).toMatchObject({ admin: true, "actions.protected": true, "views.edit": "all" });
	});

	test("jeton mobile : kind mobile, admin false", async () => {
		const r = await s.call("GET", ME, { auth: "mobile" });
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ kind: "mobile", level: null });
		expect(r.body.can.admin).toBe(false);
	});

	test("sans jeton → 401", async () => {
		expect((await s.call("GET", ME, { auth: false })).status).toBe(401);
	});

	test("plugin : regrantPlugin visible à l'appel suivant, sans relance", async () => {
		const secret = s.access.issuePlugin("overlay", "Overlay", { level: "pilot", views: { read: true, edit: false, create: false } });
		const before = await asToken(secret, "GET", ME);
		validateResponse(ME, "GET", 200, before.body);
		expect(before.body).toMatchObject({ kind: "plugin", name: "Overlay", plugin: "overlay", level: "pilot" });
		expect(before.body.can).toMatchObject({ "actions.spaceship_power": true, "views.read": true, "net.lan": false });
		s.access.regrantPlugin("overlay", { level: "read", views: { read: false, edit: ["v1"], create: true } });
		const after = (await asToken(secret, "GET", ME)).body;
		expect(after.level).toBe("read");
		expect(after.can).toMatchObject({ "actions.spaceship_power": false, "views.read": false, "views.edit": ["v1"], "views.create": true });
		s.access.revokePlugin("overlay");
	});
});

/** Routes ouvertes aux jetons externes et le droit de `can` qui les couvre. */
const COVERED: [string, string][] = [
	["GET /api/v1/status", "read.status"],
	["GET /api/v1/events", "read.events"],
	["GET /api/v1/character", "read.character"],
	["GET /api/v1/vitals", "read.character"],
	["GET /api/v1/vitals/{id}", "read.character"],
	["GET /api/v1/ship/status", "read.ship"],
	["GET /api/v1/ship/functions", "read.ship"],
	["GET /api/v1/ship/functions/{id}", "read.ship"],
	["GET /api/v1/game", "read.game"],
	["GET /api/v1/telemetry/{section}", "read.telemetry"],
	["GET /api/v1/actions", "read.actions"],
	["POST /api/v1/actions/{name}/trigger", "actions.player_emotes"],
	["POST /api/v1/ship/functions/{id}/press", "actions.dangerous"],
	["POST /api/v1/morse", "morse.send"],
	["DELETE /api/v1/morse", "morse.send"],
	["GET /api/v1/debug", "read.debug"],
	["GET /api/v1/access/tokens", "admin"],
];

describe("cohérence : can dit la même chose que les refus des routes", () => {
	test.each(["read", "pilot", "pilot_full"] as const)("niveau %s", async (level) => {
		const { can } = (await asToken(secrets[level], "GET", ME)).body;
		const wrong: string[] = [];
		for (const [key, right] of COVERED) {
			const [method, path] = key.split(" ");
			const { status, body } = await asToken(secrets[level], method, path);
			const refused = status === 403 && body?.error === "forbidden" && body.reason === "level";
			if (can[right] === refused) wrong.push(`${key} : can["${right}"]=${can[right]}, statut ${status}`);
		}
		// Actions protégées : refus propre (dangerous_action) au Pilotage, jamais au Pilotage complet.
		const eject = await asToken(secrets[level], "POST", "/api/v1/actions/v_eject/trigger");
		const ejectRefused = eject.status === 403 && (eject.body?.reason === "dangerous_action" || eject.body?.reason === "level");
		if (can["actions.protected"] === ejectRefused) wrong.push(`v_eject : can["actions.protected"]=${can["actions.protected"]}, statut ${eject.status}`);
		expect(wrong).toEqual([]);
	});
});

describe("clés actions.<catégorie> stables", () => {
	test("catégories de l'instantané seul, sans interroger le jeu (pas d'attente, clés stables)", async () => {
		const { accessMeRoute } = await import("../../src/web/routes/access.js");
		const route = accessMeRoute({
			source: { getSnapshot: () => [{ name: "v_radar", category: "spaceship_radar", holdable: false }] },
		});
		const reply = (await route.handle({ caller: { kind: "main" } } as never)) as { json: { can: Record<string, unknown> } };
		expect(reply.json.can).toHaveProperty("actions.spaceship_radar", true);
		expect(Object.keys(reply.json.can).filter((k) => k.startsWith("actions."))).toEqual(["actions.spaceship_radar", "actions.unknown", "actions.dangerous", "actions.protected"]);
	});
});

describe("contrat : l'exception est nommée", () => {
	test("la description générale cite GET /api/v1/access/me (EN et FR) et le conseil de relecture", async () => {
		const { OPENAPI } = await import("./harness.js");
		const d: string = OPENAPI.info.description;
		expect(d.match(/GET \/api\/v1\/access\/me/g)?.length).toBe(2);
		expect(d).toContain("after a 403");
		expect(d).toContain("après un 403");
	});
});
