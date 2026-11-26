import { describe, expect, test } from "vitest";
// @ts-expect-error module JS de la page, sans types
import { idMap } from "../../src/web/static/plugins.js";

describe("fenêtre Plugins : tables par id", () => {
	test("un plugin « __proto__ » ou « constructor » sans journal n'a pas d'entrée (la fenêtre restait vide)", () => {
		const logs = idMap();
		expect(logs["__proto__"]).toBeUndefined();
		expect(logs["constructor"]).toBeUndefined();
		logs["__proto__"] = { calls: { entries: [] }, output: [] };
		expect(Object.keys(logs)).toEqual(["__proto__"]);
	});

	test("« vu » relu depuis le stockage : __proto__ reste une entrée, une valeur invalide donne une table vide", () => {
		expect(idMap(JSON.parse('{"__proto__": "2026-11-25T10:00:00Z", "a": "x"}'))["__proto__"]).toBe("2026-11-25T10:00:00Z");
		expect(Object.keys(idMap([1, 2]))).toEqual([]);
		expect(Object.keys(idMap(null))).toEqual([]);
	});
});

describe("journaux : rouge = alerte", () => {
	test("même règle dans la page et dans l'appli : 400, 401, 403 et 5xx ; 404 et 409 restent neutres", async () => {
		// @ts-expect-error module JS de la page, sans types
		const { isAlert } = await import("../../src/web/static/access.js");
		const { isAlertStatus } = await import("../../src/web/access.js");
		for (const s of [200, 201, 204, 400, 401, 403, 404, 409, 422, 500, 502, 503]) expect(isAlert(s)).toBe(isAlertStatus(s));
		expect([200, 400, 401, 403, 404, 409, 502].filter(isAlert)).toEqual([400, 401, 403, 502]);
	});
});
