import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PROTECTED_ACTIONS } from "../../src/game/dangerous.js";
import { AccessStore, type AccessLevel } from "../../src/web/access.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

/** Routes ouvertes aux jetons externes, par niveau minimal ; toute autre route non publique : jeton principal seulement. */
const READ = [
	"GET /api/v1/status",
	"GET /api/v1/events",
	"GET /api/v1/character",
	"GET /api/v1/ship/status",
	"GET /api/v1/vitals",
	"GET /api/v1/vitals/{id}",
	"GET /api/v1/ship/functions",
	"GET /api/v1/ship/functions/{id}",
	"GET /api/v1/telemetry/{section}",
	"GET /api/v1/actions",
];
const PILOT = ["POST /api/v1/actions/{name}/trigger", "POST /api/v1/ship/functions/{id}/press", "POST /api/v1/morse", "DELETE /api/v1/morse"];

/** Valeurs plausibles des paramètres de chemin. */
const SAMPLE: Record<string, string> = { id: "health", name: "emote_wave", section: "actor", index: "0", file: "x" };
const concrete = (p: string) => p.replace(/\{([^}]+)\}/g, (_m, k: string) => SAMPLE[k] ?? "x");

let s: TestServer;
const secrets = {} as Record<AccessLevel | "lan", string>;
beforeAll(async () => {
	s = await startTestServer({ game: null });
	const store = new AccessStore(s.deps.settings, () => {});
	for (const level of ["read", "pilot", "pilot_full"] as const) {
		const r = store.create({ name: level, level, lan: false });
		if (typeof r === "string") throw new Error(r);
		secrets[level] = r.secret;
	}
	const lan = store.create({ name: "lan", level: "read", lan: true });
	if (typeof lan === "string") throw new Error(lan);
	secrets.lan = lan.secret;
});
afterAll(() => s.close());

/** Statut d'une requête (flux d'événements : statut lu puis connexion coupée). */
async function statusOf(method: string, apiPath: string, secret: string, server = s): Promise<{ status: number; body: any }> {
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

describe("jetons externes : liste blanche des routes", () => {
	test("chaque route est classée (lecture, pilotage ou jeton principal seulement)", () => {
		const keys = s.routes.filter((r) => !r.public).map((r) => `${r.method} ${r.path}`);
		for (const k of [...READ, ...PILOT]) expect(keys).toContain(k);
	});

	test.each(["read", "pilot", "pilot_full"] as const)("jeton %s : accès exactement selon son niveau", async (level) => {
		const wrong: string[] = [];
		for (const r of s.routes.filter((x) => !x.public)) {
			const key = `${r.method} ${r.path}`;
			const allowed = READ.includes(key) || (PILOT.includes(key) && level !== "read");
			const { status, body } = await statusOf(r.method, r.path, secrets[level]);
			if (allowed && (status === 401 || (status === 403 && body?.error === "forbidden"))) wrong.push(`${key} refusé (${status})`);
			if (!allowed && !(status === 403 && body?.error === "forbidden" && body.reason === "level")) wrong.push(`${key} accepté (${status})`);
		}
		expect(wrong).toEqual([]);
	});
});

describe("jetons externes : présentation du jeton", () => {
	test("jeton externe dans l'adresse (?t=) → 401", async () => {
		const res = await fetch(`${s.url}/api/v1/status?t=${secrets.pilot}`);
		expect(res.status).toBe(401);
	});
	test("jeton externe inconnu → 401", async () => {
		expect((await statusOf("GET", "/api/v1/status", `${secrets.read}x`)).status).toBe(401);
	});
	test("jeton principal : inchangé (en-tête et ?t=)", async () => {
		expect((await s.call("GET", "/api/v1/status")).status).toBe(200);
		expect((await fetch(`${s.url}/api/v1/status?t=${s.token}`)).status).toBe(200);
		expect((await s.call("GET", "/api/v1/lan")).status).toBe(200);
	});
});

describe("jetons externes : réseau local", () => {
	test("hors PC : refusé sans la case, accepté avec", async () => {
		const remote = await startTestServer({ game: null, extra: { isLocal: () => false } });
		try {
			const store = new AccessStore(remote.deps.settings, () => {});
			const pc = store.create({ name: "pc", level: "read", lan: false });
			const lan = store.create({ name: "lan", level: "read", lan: true });
			if (typeof pc === "string" || typeof lan === "string") throw new Error("create");
			expect(await statusOf("GET", "/api/v1/status", pc.secret, remote)).toEqual({ status: 403, body: { error: "forbidden", reason: "lan" } });
			expect((await statusOf("GET", "/api/v1/status", lan.secret, remote)).status).toBe(200);
		} finally {
			await remote.close();
		}
	});
});

describe("jetons externes : actions protégées", () => {
	const titan = JSON.parse(readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8"));
	const locked = structuredClone(titan);
	locked.vehicle.state.doors = { open_state: "DOOR_OPEN_STATE_CLOSED", lock_state: "DOOR_LOCK_STATE_LOCKED" };

	async function ship() {
		const sent: string[] = [];
		const srv = await startTestServer({ game: { frames: [locked], holdOpen: true, trigger: (r) => (sent.push(r.action_name), { status: 1 }) } });
		for (let i = 0; i < 40 && (await srv.call("GET", "/api/v1/telemetry/vehicle")).status !== 200; i++) await new Promise((r) => setTimeout(r, 50));
		const store = new AccessStore(srv.deps.settings, () => {});
		const mk = (level: AccessLevel) => {
			const r = store.create({ name: level, level, lan: false });
			if (typeof r === "string") throw new Error(r);
			return r;
		};
		return { srv, sent, pilot: mk("pilot"), full: mk("pilot_full"), read: mk("read") };
	}

	test("déclencher : liste rouge refusée au Pilotage, acceptée au Pilotage complet (journal marqué) et au jeton principal", async () => {
		const { srv, sent, pilot, full } = await ship();
		try {
			for (const name of PROTECTED_ACTIONS) {
				expect(await statusOf("POST", `/api/v1/actions/${name}/trigger`, pilot.secret, srv)).toEqual({ status: 403, body: { error: "forbidden", reason: "dangerous_action" } });
			}
			expect(sent).toEqual([]);
			for (const name of PROTECTED_ACTIONS) expect((await statusOf("POST", `/api/v1/actions/${name}/trigger`, full.secret, srv)).status).toBe(200);
			expect((await srv.call("POST", "/api/v1/actions/v_eject/trigger")).status).toBe(200);
			expect(sent).toEqual([...PROTECTED_ACTIONS, "v_eject"]);
			// Le reste est normal au niveau Pilotage.
			for (const name of ["v_power_set_off", "v_open_all_doors", "v_emergency_exit"]) expect((await statusOf("POST", `/api/v1/actions/${name}/trigger`, pilot.secret, srv)).status).toBe(200);
		} finally {
			await srv.close();
		}
	});

	test("appuyer : déverrouiller les portes refusé au Pilotage (rien envoyé), accepté au Pilotage complet", async () => {
		const { srv, sent, pilot, full } = await ship();
		try {
			for (const mode of ["off", "toggle"]) {
				const r = await fetch(`${srv.url}/api/v1/ship/functions/doors_locked/press`, {
					method: "POST",
					headers: { authorization: `Bearer ${pilot.secret}`, "content-type": "application/json" },
					body: JSON.stringify({ mode }),
				});
				expect(r.status).toBe(403);
				expect(await r.json()).toEqual({ error: "forbidden", reason: "dangerous_action" });
			}
			expect(sent).toEqual([]);
			const ok = await fetch(`${srv.url}/api/v1/ship/functions/doors_locked/press`, {
				method: "POST",
				headers: { authorization: `Bearer ${full.secret}`, "content-type": "application/json" },
				body: JSON.stringify({ mode: "off" }),
			});
			expect(ok.status).toBe(200);
			expect(sent).toEqual(["v_unlock_all_doors"]);
		} finally {
			await srv.close();
		}
	});

	test("liste des actions : sans les actions protégées pour Lecture et Pilotage, avec pour Pilotage complet", async () => {
		const { srv, read, pilot, full } = await ship();
		try {
			const names = async (secret: string) =>
				((await statusOf("GET", "/api/v1/actions", secret, srv)).body.groups as { actions: { name: string }[] }[]).flatMap((g) => g.actions.map((a) => a.name));
			for (const secret of [read.secret, pilot.secret]) {
				const list = await names(secret);
				expect(list.filter((n) => PROTECTED_ACTIONS.has(n))).toEqual([]);
				expect(list).toContain("v_power_set_off");
			}
			expect((await names(full.secret)).filter((n) => PROTECTED_ACTIONS.has(n)).sort()).toEqual([...PROTECTED_ACTIONS].sort());
		} finally {
			await srv.close();
		}
	});
});

describe("gestion des jetons externes (jeton principal, PC)", () => {
	test("créer, lister sans secret ni empreinte, modifier, journal, révoquer", async () => {
		const srv = await startTestServer({ game: null });
		try {
			const c = await srv.call("POST", "/api/v1/access/tokens", { body: { name: "VoiceAttack", level: "pilot", lan: false } });
			expect(c.status).toBe(201);
			validateResponse("/api/v1/access/tokens", "POST", 201, c.body);
			const { token, secret } = c.body;
			expect(secret.startsWith("sct_ext_")).toBe(true);
			expect(token).not.toHaveProperty("hash");
			const list = await srv.call("GET", "/api/v1/access/tokens");
			validateResponse("/api/v1/access/tokens", "GET", 200, list.body);
			expect(JSON.stringify(list.body)).not.toContain(secret);
			expect(JSON.stringify(list.body)).not.toContain(srv.deps.settings.access![0].hash);
			expect(list.body.tokens).toEqual([token]);

			expect((await statusOf("GET", "/api/v1/status", secret, srv)).status).toBe(200);
			const log = await srv.call("GET", `/api/v1/access/tokens/${token.id}/log`);
			validateResponse("/api/v1/access/tokens/{id}/log", "GET", 200, log.body);
			expect(log.body.entries).toEqual([expect.objectContaining({ method: "GET", path: "/api/v1/status", status: 200 })]);

			const up = await srv.call("PUT", `/api/v1/access/tokens/${token.id}`, { body: { level: "pilot_full", lan: true } });
			expect(up.status).toBe(200);
			validateResponse("/api/v1/access/tokens/{id}", "PUT", 200, up.body);
			expect(up.body).toMatchObject({ level: "pilot_full", lan: true });
			expect((await statusOf("POST", "/api/v1/actions/v_eject/trigger", secret, srv)).status).not.toBe(403);
			const marked = await srv.call("GET", `/api/v1/access/tokens/${token.id}/log`);
			expect(marked.body.entries.at(-1)).toMatchObject({ path: "/api/v1/actions/{name}/trigger", sensitive: true });

			expect((await srv.call("DELETE", `/api/v1/access/tokens/${token.id}`)).status).toBe(204);
			expect((await statusOf("GET", "/api/v1/status", secret, srv)).status).toBe(401);
			expect((await srv.call("DELETE", `/api/v1/access/tokens/${token.id}`)).status).toBe(404);
		} finally {
			await srv.close();
		}
	});

	test("renouveler : nouveau secret une fois, l'ancien refusé, flux ouverts fermés, 404 si inconnu", async () => {
		const srv = await startTestServer({ game: null });
		try {
			const c = await srv.call("POST", "/api/v1/access/tokens", { body: { name: "VA", level: "read", lan: false } });
			const old = c.body.secret as string;
			const res = await fetch(`${srv.url}/api/v1/events`, { headers: { authorization: `Bearer ${old}` } });
			const reader = res.body!.getReader();
			await reader.read();
			const ended = (async () => {
				for (;;) if ((await reader.read()).done) return true;
			})();
			const r = await srv.call("POST", `/api/v1/access/tokens/${c.body.token.id}/renew`);
			expect(r.status).toBe(200);
			validateResponse("/api/v1/access/tokens/{id}/renew", "POST", 200, r.body);
			expect(r.body.token).toMatchObject({ id: c.body.token.id, name: "VA", level: "read", lan: false });
			expect(r.body.secret).not.toBe(old);
			expect(await Promise.race([ended, new Promise<boolean>((ok) => setTimeout(() => ok(false), 2000))])).toBe(true);
			expect((await statusOf("GET", "/api/v1/status", old, srv)).status).toBe(401);
			expect((await statusOf("GET", "/api/v1/status", r.body.secret, srv)).status).toBe(200);
			expect((await srv.call("POST", "/api/v1/access/tokens/nope/renew")).status).toBe(404);
		} finally {
			await srv.close();
		}
	});

	test("stop : 403 stopped (journal), flux fermés, durée invalide 400, reprise", async () => {
		const srv = await startTestServer({ game: null });
		try {
			const c = await srv.call("POST", "/api/v1/access/tokens", { body: { name: "VA", level: "read", lan: false } });
			const { id } = c.body.token;
			const secret = c.body.secret as string;
			const res = await fetch(`${srv.url}/api/v1/events`, { headers: { authorization: `Bearer ${secret}` } });
			const reader = res.body!.getReader();
			await reader.read();
			const ended = (async () => {
				for (;;) if ((await reader.read()).done) return true;
			})();
			const off = await srv.call("POST", `/api/v1/access/tokens/${id}/stop`, { body: { minutes: 15 } });
			expect(off.status).toBe(200);
			validateResponse("/api/v1/access/tokens/{id}/stop", "POST", 200, off.body);
			expect(off.body.stopped.until).toEqual(expect.any(String));
			expect(await Promise.race([ended, new Promise<boolean>((ok) => setTimeout(() => ok(false), 2000))])).toBe(true);
			const refused = await statusOf("GET", "/api/v1/status", secret, srv);
			expect(refused).toEqual({ status: 403, body: { error: "forbidden", reason: "stopped" } });
			validateResponse("/api/v1/status", "GET", 403, refused.body);
			const log = await srv.call("GET", `/api/v1/access/tokens/${id}/log`);
			expect(log.body.entries.at(-1)).toMatchObject({ path: "/api/v1/status", status: 403 });

			const forever = await srv.call("POST", `/api/v1/access/tokens/${id}/stop`, { body: {} });
			expect(forever.body.stopped).toEqual({ until: null });
			expect((await srv.call("POST", `/api/v1/access/tokens/${id}/stop`, { body: { minutes: 0 } })).status).toBe(400);

			const on = await srv.call("POST", `/api/v1/access/tokens/${id}/start`);
			expect(on.status).toBe(200);
			validateResponse("/api/v1/access/tokens/{id}/start", "POST", 200, on.body);
			expect(on.body).not.toHaveProperty("stopped");
			expect((await statusOf("GET", "/api/v1/status", secret, srv)).status).toBe(200);
			expect((await srv.call("POST", "/api/v1/access/tokens/nope/stop", { body: {} })).status).toBe(404);
			expect((await srv.call("POST", "/api/v1/access/tokens/nope/start")).status).toBe(404);
		} finally {
			await srv.close();
		}
	});

	test("erreurs : corps invalide 400, trop de jetons 409, inconnu 404", async () => {
		const srv = await startTestServer({ game: null });
		try {
			const bad = await srv.call("POST", "/api/v1/access/tokens", { body: { name: "", level: "read", lan: false } });
			expect(bad.status).toBe(400);
			expect(bad.body).toEqual({ error: "invalid_token" });
			for (let i = 0; i < 20; i++) expect((await srv.call("POST", "/api/v1/access/tokens", { body: { name: `t${i}`, level: "read", lan: false } })).status).toBe(201);
			const dup = await srv.call("POST", "/api/v1/access/tokens", { body: { name: "T0", level: "read", lan: false } });
			expect(dup.status).toBe(409);
			expect(dup.body).toEqual({ error: "name_taken" });
			const ids = (await srv.call("GET", "/api/v1/access/tokens")).body.tokens.map((x: { id: string }) => x.id);
			const rename = await srv.call("PUT", `/api/v1/access/tokens/${ids[1]}`, { body: { name: "t0" } });
			expect(rename.status).toBe(409);
			expect(rename.body).toEqual({ error: "name_taken" });
			const many = await srv.call("POST", "/api/v1/access/tokens", { body: { name: "trop", level: "read", lan: false } });
			expect(many.status).toBe(409);
			expect(many.body).toEqual({ error: "too_many" });
			expect((await srv.call("PUT", "/api/v1/access/tokens/nope", { body: { lan: true } })).status).toBe(404);
			expect((await srv.call("GET", "/api/v1/access/tokens/nope/log")).status).toBe(404);
		} finally {
			await srv.close();
		}
	});

	test("hors PC → pc_only ; jeton externe (même Pilotage complet) → refusé", async () => {
		const remote = await startTestServer({ game: null, extra: { isLocal: () => false } });
		try {
			expect((await remote.call("GET", "/api/v1/access/tokens")).body).toEqual({ error: "pc_only" });
		} finally {
			await remote.close();
		}
		const r = await statusOf("GET", "/api/v1/access/tokens", secrets.pilot_full);
		expect(r).toEqual({ status: 403, body: { error: "forbidden", reason: "level" } });
	});
});

describe("corrections de la relecture", () => {
	test("révoquer ou modifier un jeton ferme ses flux d'événements ouverts", async () => {
		const srv = await startTestServer({ game: null });
		try {
			const open = async () => {
				const c = await srv.call("POST", "/api/v1/access/tokens", { body: { name: `t${Math.random()}`, level: "read", lan: false } });
				const res = await fetch(`${srv.url}/api/v1/events`, { headers: { authorization: `Bearer ${c.body.secret}` } });
				const reader = res.body!.getReader();
				await reader.read(); // premier envoi : le flux est ouvert
				const ended = (async () => {
					for (;;) if ((await reader.read()).done) return true;
				})();
				return { id: c.body.token.id as string, ended };
			};
			const timeout = (p: Promise<boolean>) => Promise.race([p, new Promise<boolean>((r) => setTimeout(() => r(false), 2000))]);
			const a = await open();
			expect((await srv.call("DELETE", `/api/v1/access/tokens/${a.id}`)).status).toBe(204);
			expect(await timeout(a.ended)).toBe(true);
			const b = await open();
			expect((await srv.call("PUT", `/api/v1/access/tokens/${b.id}`, { body: { lan: true } })).status).toBe(200);
			expect(await timeout(b.ended)).toBe(true);
		} finally {
			await srv.close();
		}
	});

	test("liste rouge insensible à la casse et aux espaces", async () => {
		for (const name of ["V_EJECT", "V_Self_Destruct", "%20v_eject"]) {
			expect(await statusOf("POST", `/api/v1/actions/${name}/trigger`, secrets.pilot)).toEqual({ status: 403, body: { error: "forbidden", reason: "dangerous_action" } });
		}
	});
});
