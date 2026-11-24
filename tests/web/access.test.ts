import crypto from "node:crypto";
import { describe, expect, test } from "vitest";
import { AccessStore, levelAllows, mayTriggerDangerous, MAX_TOKENS, parseAccess, type AccessToken } from "../../src/web/access.js";
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
		for (let i = 0; i < 101; i++) store.record(r.token.id, { at: `t${i}`, method: "GET", path: "/p", status: i % 10 === 0 ? 403 : 200 });
		const log = store.log(r.token.id);
		expect(log.entries).toHaveLength(100);
		expect(log.entries.at(-1)?.at).toBe("t100");
		expect(log.entries[0].at).toBe("t1");
		expect(log.refused).toBe(11);
		expect(log.lastUsed).toBe("t100");
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
