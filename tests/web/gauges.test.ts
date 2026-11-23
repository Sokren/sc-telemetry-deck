import { describe, expect, test } from "vitest";
// @ts-expect-error module JS de la page, sans types
import { gaugeModel, gaugeText, litSegments, STYLES, stylesFor } from "../../src/web/static/gauges.js";

describe("jauges : styles permis", () => {
	test("8 styles pour une jauge ou une donnée encore inconnue", () => {
		expect(STYLES).toEqual(["card", "ring", "arc", "bar", "vbar", "segments", "vsegments", "number"]);
		expect(stylesFor("vital", true)).toHaveLength(8);
		expect(stylesFor("instrument", null)).toHaveLength(8);
	});
	test("valeur sans maximum : carte ou chiffre ; bouton : carte seulement", () => {
		expect(stylesFor("vital", false)).toEqual(["card", "number"]);
		expect(stylesFor("ship_info", false)).toEqual(["card", "number"]);
		expect(stylesFor("ship_function", true)).toEqual(["card"]);
	});
});

describe("jauges : segments allumés", () => {
	test.each([
		[0, 0],
		[1, 1],
		[10, 1],
		[11, 2],
		[100, 10],
		[150, 10],
		[null, 0],
	])("%s %% → %s", (pct, lit) => expect(litSegments(pct)).toBe(lit));
});

describe("jauges : modèle", () => {
	test("pourcentage reçu", () => {
		expect(gaugeModel({ text: "82", unit: "%", percent: 82, level: "ok" })).toEqual({ pct: 82, text: "82", level: "ok" });
	});
	test("pas de pourcentage : « — »", () => {
		expect(gaugeModel({ text: "—", unit: "", level: "none" })).toEqual({ pct: null, text: "—", level: "none" });
	});
	test("bornes et valeurs invalides", () => {
		expect(gaugeModel({ text: "0", unit: "%", percent: -5, level: "bad" }).pct).toBe(0);
		expect(gaugeModel({ text: "x", unit: "", percent: Number.NaN, level: "none" }).pct).toBeNull();
		expect(gaugeModel({ text: "x", unit: "", percent: 140, level: "ok" }).pct).toBe(100);
	});
});

describe("jauges : texte affiché", () => {
	test("pourcentage : nombre seul ; valeur sans pourcentage : jamais cachée", () => {
		expect(gaugeText({ text: "82", unit: "%", percent: 82, level: "ok" })).toBe("82");
		expect(gaugeText({ text: "212", unit: "m/s", level: "none" })).toBe("212 m/s");
		expect(gaugeText({ text: "—", unit: "", level: "none" })).toBe("—");
	});
});
