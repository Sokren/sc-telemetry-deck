import crypto from "node:crypto";
import { describe, expect, test } from "vitest";
import { AccessStore, isStopped, levelAllows, mayTriggerDangerous, MAX_TOKENS, parseAccess, type AccessToken } from "../../src/web/access.js";
import type { WebSettings } from "../../src/web/config.js";

const settings = (): WebSettings => ({ port: 8743, lan: false, token: "x".repeat(32) });
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

describe("jetons externes : création et recherche", () => {
	test("jeton sct_ext_, nom nettoyé, seule l'empreinte enregistrée", () => {
		let saved = 0;
		const s = settings();
		const store = new AccessStore(s, () => saved++);
		const r = store.create({ name: " VoiceAttack ", level: "pilot", lan: false });
		if (typeof r === "string") throw new Error(r);
		expect(r.secret.startsWith("sct_ext_")).toBe(true);
		expect(r.secret).toHaveLength(51);
		expect(r.token).toMatchObject({ name: "VoiceAttack", level: "pilot", lan: false, last4: r.secret.slice(-4), hash: sha(r.secret) });
		expect(JSON.stringify(s)).not.toContain(r.secret);
		expect(s.access).toHaveLength(1);
		expect(saved).toBe(1);
		expect(store.find(r.secret)?.id).toBe(r.token.id);
		expect(store.find(`${r.secret}x`)).toBeUndefined();
		expect(store.find("")).toBeUndefined();
	});

	test.each([
		["nom vide", { name: "  ", level: "read", lan: false }],
		["nom de 33 caractères", { name: "x".repeat(33), level: "read", lan: false }],
		["niveau inconnu", { name: "a", level: "admin", lan: false }],
		["réseau local pas booléen", { name: "a", level: "read", lan: "yes" }],
	])("refus : %s", (_n, input) => {
		expect(new AccessStore(settings(), () => {}).create(input)).toBe("invalid");
	});

	test("au plus 20 jetons", () => {
		const store = new AccessStore(settings(), () => {});
		for (let i = 0; i < MAX_TOKENS; i++) expect(typeof store.create({ name: `t${i}`, level: "read", lan: false })).toBe("object");
		expect(store.create({ name: "trop", level: "read", lan: false })).toBe("too_many");
	});

	test("nom déjà pris (sans tenir compte des majuscules ni des espaces autour) : refusé à la création et à la modification", () => {
		const store = new AccessStore(settings(), () => {});
		const a = store.create({ name: "Overlay", level: "read", lan: false });
		const b = store.create({ name: "Bot", level: "read", lan: false });
		if (typeof a !== "object" || typeof b !== "object") throw new Error("création");
		expect(store.create({ name: "  overlay ", level: "pilot", lan: false })).toBe("name_taken");
		expect(store.update(b.token.id, { name: "OVERLAY" })).toBe("name_taken");
		expect(store.update(a.token.id, { name: "overlay", level: "pilot" })).toMatchObject({ name: "overlay", level: "pilot" });
		expect(store.list()).toHaveLength(2);
	});

	test("modification et révocation", () => {
		const s = settings();
		const store = new AccessStore(s, () => {});
		const r = store.create({ name: "a", level: "read", lan: false });
		if (typeof r === "string") throw new Error(r);
		expect(store.update(r.token.id, { level: "pilot_full", lan: true })).toMatchObject({ level: "pilot_full", lan: true, name: "a" });
		expect(store.update(r.token.id, { level: "god" })).toBe("invalid");
		expect(store.update("nope", { lan: true })).toBe("unknown");
		expect(store.remove(r.token.id)).toBe(true);
		expect(store.remove(r.token.id)).toBe(false);
		expect(store.find(r.secret)).toBeUndefined();
		expect(s.access).toBeUndefined();
	});
});

describe("jetons externes : renouvellement", () => {
	test("nouveau secret, même id, nom, niveau et réseau local ; l'ancien ne marche plus", () => {
		let saved = 0;
		const s = settings();
		const store = new AccessStore(s, () => saved++);
		const r = store.create({ name: "VA", level: "pilot", lan: true });
		if (typeof r === "string") throw new Error(r);
		const n = store.renew(r.token.id);
		if (typeof n === "string") throw new Error(n);
		expect(n.secret).not.toBe(r.secret);
		expect(n.secret).toHaveLength(51);
		expect(n.token).toMatchObject({ id: r.token.id, name: "VA", level: "pilot", lan: true, last4: n.secret.slice(-4), hash: sha(n.secret) });
		expect(store.find(r.secret)).toBeUndefined();
		expect(store.find(n.secret)?.id).toBe(r.token.id);
		expect(s.access).toHaveLength(1);
		expect(saved).toBe(2);
		expect(store.renew("nope")).toBe("unknown");
	});
});

describe("jetons externes : stop", () => {
	test("stop sans limite, stop pour une durée, reprise ; gardé dans settings.json", () => {
		const s = settings();
		const store = new AccessStore(s, () => {});
		const r = store.create({ name: "VA", level: "pilot", lan: false });
		if (typeof r === "string") throw new Error(r);
		expect(isStopped(r.token)).toBe(false);
		const off = store.stop(r.token.id);
		if (typeof off === "string") throw new Error(off);
		expect(off.stopped).toEqual({ until: null });
		expect(isStopped(off)).toBe(true);
		const now = Date.parse("2026-11-25T10:00:00.000Z");
		const tmp = store.stop(r.token.id, 15, now);
		if (typeof tmp === "string") throw new Error(tmp);
		expect(tmp.stopped).toEqual({ until: "2026-11-25T10:15:00.000Z" });
		expect(isStopped(tmp, now + 14 * 60_000)).toBe(true);
		expect(isStopped(tmp, now + 15 * 60_000)).toBe(false);
		expect(parseAccess(JSON.parse(JSON.stringify(s.access)))[0].stopped).toEqual({ until: "2026-11-25T10:15:00.000Z" });
		const on = store.start(r.token.id);
		if (typeof on === "string") throw new Error(on);
		expect(on).not.toHaveProperty("stopped");
		expect(store.stop(r.token.id, 0)).toBe("invalid");
		expect(store.stop(r.token.id, 1441)).toBe("invalid");
		expect(store.stop(r.token.id, 1.5)).toBe("invalid");
		expect(store.stop("nope")).toBe("unknown");
		expect(store.start("nope")).toBe("unknown");
	});
});

describe("jetons externes : niveaux", () => {
	test("Lecture ⊂ Pilotage ⊂ Pilotage complet", () => {
		expect(levelAllows("read", "read")).toBe(true);
		expect(levelAllows("read", "pilot")).toBe(false);
		expect(levelAllows("pilot", "pilot")).toBe(true);
		expect(levelAllows("pilot_full", "pilot")).toBe(true);
	});
	test("actions protégées : jeton principal et Pilotage complet seulement", () => {
		const tok = (level: AccessToken["level"]): AccessToken => ({ id: "i", name: "n", level, lan: false, hash: "h", last4: "abcd", created: "c" });
		expect(mayTriggerDangerous({ kind: "main" })).toBe(true);
		expect(mayTriggerDangerous({ kind: "external", token: tok("pilot") })).toBe(false);
		expect(mayTriggerDangerous({ kind: "external", token: tok("read") })).toBe(false);
		expect(mayTriggerDangerous({ kind: "external", token: tok("pilot_full") })).toBe(true);
	});
});

describe("jetons externes : journal en mémoire", () => {
	test("100 dernières entrées, refus comptés, dernière utilisation", () => {
		const store = new AccessStore(settings(), () => {});
		const r = store.create({ name: "a", level: "read", lan: false });
		if (typeof r === "string") throw new Error(r);
		expect(store.log(r.token.id)).toEqual({ entries: [], refused: 0, lastUsed: null });
		for (let i = 0; i < 101; i++) store.record(r.token.id, { at: `t${String(i).padStart(3, "0")}`, method: "GET", path: "/p", status: i % 10 === 1 ? 403 : 200 });
		const log = store.log(r.token.id);
		expect(log.entries).toHaveLength(100);
		expect(log.entries.at(-1)?.at).toBe("t100");
		expect(log.entries[0].at).toBe("t001");
		expect(log.refused).toBe(10);
		expect(log.lastUsed).toBe("t100");
	});

	test("un appel en alerte (403, 400, 5xx) reste visible même chassé par 100 appels normaux ; 404 ne compte pas", () => {
		const store = new AccessStore(settings(), () => {});
		const r = store.create({ name: "a", level: "read", lan: false });
		if (typeof r === "string") throw new Error(r);
		const at = (i: number) => `2026-11-25T10:00:${String(i).padStart(3, "0")}Z`;
		store.record(r.token.id, { at: at(0), method: "GET", path: "/api/v1/access/tokens", status: 403 });
		store.record(r.token.id, { at: at(1), method: "GET", path: "/api/v1/telemetry/{section}", status: 404 });
		store.record(r.token.id, { at: at(2), method: "POST", path: "/api/v1/actions/{name}/trigger", status: 502 });
		for (let i = 3; i < 203; i++) store.record(r.token.id, { at: at(i), method: "GET", path: "/api/v1/status", status: 200 });
		const log = store.log(r.token.id);
		expect(log.entries.map((e) => e.status).slice(0, 3)).toEqual([403, 502, 200]);
		expect(log.entries).toHaveLength(102);
		expect(log.entries.some((e) => e.status === 404)).toBe(false);
		expect(log.lastUsed).toBe(at(202));
	});
});

describe("jetons externes : lecture de settings.json", () => {
	test("entrées invalides ignorées", () => {
		const ok = { id: "abc", name: "VA", level: "pilot", lan: false, hash: "a".repeat(64), last4: "wxyz", created: "2026-11-24T10:00:00.000Z" };
		expect(parseAccess([ok, { id: "x" }, { ...ok, id: "def", level: "god" }, "zzz", { ...ok, id: "ghi", hash: "court" }])).toEqual([ok]);
		expect(parseAccess(undefined)).toEqual([]);
		expect(parseAccess({})).toEqual([]);
	});
});
