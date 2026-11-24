import { describe, expect, test } from "vitest";
// @ts-expect-error module JS de la page, sans types
import { gaugeModel, gaugeText, litSegments, STYLES, stylesFor, tapeOffset, unwrapHeading } from "../../src/web/static/gauges.js";

describe("jauges : styles permis", () => {
	test("9 styles pour une jauge ou une donnée encore inconnue", () => {
		expect(STYLES).toEqual(["card", "ring", "arc", "bar", "vbar", "segments", "vsegments", "number", "line"]);
		expect(stylesFor("vital", true)).toHaveLength(9);
		expect(stylesFor("instrument", null)).toHaveLength(9);
	});
	test("valeur sans maximum : carte, chiffre ou ligne ; bouton : carte seulement", () => {
		expect(stylesFor("vital", false)).toEqual(["card", "number", "line"]);
		expect(stylesFor("ship_info", false)).toEqual(["card", "number", "line"]);
		expect(stylesFor("ship_function", true)).toEqual(["card", "switch"]);
	});
	test("règle seulement sur le cap ; glisser / maintenir sur une action ; rien sur le voyant boost", () => {
		expect(stylesFor("instrument", true, "heading")).toContain("tape");
		expect(stylesFor("instrument", true, "speed")).not.toContain("tape");
		expect(stylesFor("action", null)).toEqual(["card", "slide", "hold"]);
		expect(stylesFor("ship_info", false, "boost")).toEqual(["card"]);
	});
	test("règle de cap sans fin : on passe 359 → 0 par le plus court, sans repartir en arrière", () => {
		expect(unwrapHeading(359, 1)).toBe(361);
		expect(unwrapHeading(1, 359)).toBe(-1);
		expect(unwrapHeading(721, 2)).toBe(722);
		expect(unwrapHeading(90, 100)).toBe(100);
		expect(unwrapHeading(null, 42)).toBe(42);
	});
	test("règle de cap : décalage", () => {
		expect(tapeOffset(0, 6)).toBe(-0);
		expect(tapeOffset(370, 6)).toBe(-60);
		expect(tapeOffset(-10, 6)).toBe(-2100);
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
