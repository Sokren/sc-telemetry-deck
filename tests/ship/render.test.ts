import { describe, expect, test } from "vitest";
import { isDangerState, SHIP_FUNCTION_IDS } from "../../src/ship/functions.js";
import en from "../../src/ship/labels.en.json" with { type: "json" };
import fr from "../../src/ship/labels.fr.json" with { type: "json" };
import { SHIP_COLORS, renderShipKey, renderStatefulKey, shipFunctionName, toShipView, type ShipView } from "../../src/ship/render.js";

const svgOf = (uri: string) => {
	expect(uri.startsWith("data:image/svg+xml;charset=utf8,")).toBe(true);
	return decodeURIComponent(uri.slice("data:image/svg+xml;charset=utf8,".length));
};

describe("libellés", () => {
	test("chaque fonction a nom, libellé court (≤ 12) et mots on/off, en français et en anglais", () => {
		for (const table of [fr, en]) {
			for (const id of SHIP_FUNCTION_IDS) {
				const l = (table.functions as Record<string, { name: string; label: string; on: string; off: string }>)[id];
				expect(l, id).toBeDefined();
				expect(l.name.length).toBeGreaterThan(0);
				expect([...l.label].length, `${id} : ${l.label}`).toBeLessThanOrEqual(12);
				expect(l.on.length * l.off.length).toBeGreaterThan(0);
			}
		}
	});

	test("nom complet pour la liste du panneau", () => {
		expect(shipFunctionName("doors_locked", "fr")).toBe("Verrous des portes (verrouiller / déverrouiller)");
		expect(shipFunctionName("gear", "en")).toBe("Landing gear");
	});
});

describe("toShipView", () => {
	test("mots d'état selon la fonction et la langue", () => {
		expect(toShipView("gear", "on", "fr")).toEqual({ id: "gear", label: "Train", word: "SORTI", tone: "on" });
		expect(toShipView("gear", "off", "en")).toMatchObject({ word: "UP", tone: "off" });
		expect(toShipView("master_nav", "off", "fr")).toMatchObject({ word: "SCM", tone: "off" });
		expect(toShipView("decoupled", "off", "en")).toMatchObject({ word: "COUPLED" });
		expect(toShipView("lights", "on", "fr")).toMatchObject({ word: "ON", tone: "on" });
	});

	test("en mouvement → « … » ; indisponible ou inconnu → « — »", () => {
		expect(toShipView("gear", "moving-on", "fr")).toMatchObject({ word: "…", tone: "moving" });
		expect(toShipView("gear", "moving-off", "fr")).toMatchObject({ word: "…", tone: "moving" });
		expect(toShipView("gear", "unknown", "fr")).toMatchObject({ word: "—", tone: "none" });
		expect(toShipView("transform", "unavailable", "en")).toMatchObject({ word: "—", tone: "none" });
	});
});

describe("renderShipKey", () => {
	const on: ShipView = { id: "gear", label: "Train", word: "SORTI", tone: "on" };
	const moving: ShipView = { ...on, word: "…", tone: "moving" };
	const none: ShipView = { ...on, word: "—", tone: "none" };

	test("style A (texte) : libellé et mot d'état dans sa couleur", () => {
		const svg = svgOf(renderShipKey(on, "text"));
		expect(svg).toContain('viewBox="0 0 144 144"');
		expect(svg).toContain(">Train<");
		expect(svg).toContain(">SORTI<");
		expect(svg).toContain(`fill="${SHIP_COLORS.on}"`);
	});

	test("style B (voyant) : cercle de la couleur de l'état", () => {
		const svg = svgOf(renderShipKey(moving, "led"));
		expect(svg).toMatch(new RegExp(`<circle[^>]*fill="${SHIP_COLORS.moving}"`));
		expect(svg).toContain(">Train<");
	});

	test("style C (fond) : fond vert si on, orange si en mouvement, sombre sinon", () => {
		expect(svgOf(renderShipKey(on, "fill"))).toContain(`fill="${SHIP_COLORS.onFill}"`);
		expect(svgOf(renderShipKey(moving, "fill"))).toContain(`fill="${SHIP_COLORS.movingFill}"`);
		const off = svgOf(renderShipKey({ ...on, word: "RENTRÉ", tone: "off" }, "fill"));
		expect(off).toContain(`fill="${SHIP_COLORS.background}"`);
		expect(off).not.toContain(SHIP_COLORS.onFill);
	});

	test("indisponible : aucune couleur on / en mouvement, quel que soit le style", () => {
		for (const style of ["text", "led", "fill"] as const) {
			const svg = svgOf(renderShipKey(none, style));
			for (const c of [SHIP_COLORS.on, SHIP_COLORS.moving, SHIP_COLORS.onFill, SHIP_COLORS.movingFill]) expect(svg).not.toContain(c);
		}
	});

	test("« — » visible dans les trois styles quand l'état est inconnu", () => {
		for (const style of ["text", "led", "fill"] as const) expect(svgOf(renderShipKey(none, style)), style).toContain(">—<");
	});

	test("style B : voyant éteint gris visible (distinct de « pas de données »)", () => {
		const svg = svgOf(renderShipKey({ ...on, word: "RENTRÉ", tone: "off" }, "led"));
		expect(svg).toMatch(new RegExp(`<circle[^>]*fill="${SHIP_COLORS.off}"`));
		expect(svg).not.toContain(">—<");
	});

	test("une icône par fonction, rendu stable, texte échappé", () => {
		const icons = new Set(SHIP_FUNCTION_IDS.map((id) => svgOf(renderShipKey({ ...on, id }, "text"))));
		expect(icons.size).toBe(SHIP_FUNCTION_IDS.length);
		expect(renderShipKey(on, "led")).toBe(renderShipKey({ ...on }, "led"));
		expect(svgOf(renderShipKey({ ...on, label: "<a&b>" }, "text"))).toContain("&lt;a&amp;b&gt;");
	});
});

describe("état dangereux (portes ouvertes, verrous ouverts)", () => {
	test("seulement portes / verrous ouverts ; fermé, verrouillé ou autre fonction : non", () => {
		expect(isDangerState("doors_closed", "off")).toBe(true);
		expect(isDangerState("doors_closed", "moving-off")).toBe(true);
		expect(isDangerState("doors_locked", "off")).toBe(true);
		expect(isDangerState("doors_closed", "on")).toBe(false);
		expect(isDangerState("doors_locked", "on")).toBe(false);
		expect(isDangerState("doors_closed", "unknown")).toBe(false);
		expect(isDangerState("power_main", "off")).toBe(false);
	});

	test("touche : contour rouge, ⚠ et mot en rouge ; sans danger, rien de rouge", () => {
		const open = toShipView("doors_closed", "off", "fr");
		const red = svgOf(renderShipKey(open, "text", true));
		expect(red).toContain(`stroke="${SHIP_COLORS.danger}"`);
		expect(red).toContain("⚠");
		expect(red).toContain(`fill="${SHIP_COLORS.danger}" text-anchor="middle">OUVERTES`);
		const plain = svgOf(renderShipKey(open, "text"));
		expect(plain).not.toContain(SHIP_COLORS.danger);
		expect(svgOf(renderShipKey(open, "fill", true))).toContain(`fill="${SHIP_COLORS.dangerFill}"`);
	});
});

describe("renderStatefulKey (Ship Action)", () => {
	const view = (id: ShipView["id"], tone: ShipView["tone"], word = "ON"): ShipView => ({ id, label: "Lbl", word, tone });

	test("libellé en bas ; null → aucun libellé", () => {
		const a = svgOf(renderStatefulKey(view("lights", "on"), "text", { state: "on", label: "Phares" }));
		expect(a).toContain(">Phares<");
		expect(a).toContain(">ON<");
		const b = svgOf(renderStatefulKey(view("lights", "on"), "text", { state: "on", label: null }));
		expect(b).not.toContain(">Lbl<");
		expect(b).not.toContain(">Phares<");
	});

	test("le pictogramme change de forme avec l'état (phares, verrous, VTOL)", () => {
		for (const id of ["lights", "doors_locked", "vtol", "night_vision"] as const) {
			const on = svgOf(renderStatefulKey(view(id, "on"), "text", { state: "on", label: "x" }));
			const off = svgOf(renderStatefulKey(view(id, "off", "OFF"), "text", { state: "off", label: "x" }));
			expect(on.replace(/>ON</, ""), id).not.toBe(off.replace(/>OFF</, ""));
		}
	});

	test("le train garde son glyphe d'origine", () => {
		const svg = svgOf(renderStatefulKey(view("gear", "on", "SORTI"), "text", { state: "on", label: "Train" }));
		expect(svg).toContain('d="M12 4v11M7 10l5 5 5-5M5 20h14"');
	});

	test("VTOL en mouvement : le moteur pivote selon la phase", () => {
		const a = svgOf(renderStatefulKey(view("vtol", "moving", "…"), "text", { state: "moving-on", label: "x", phase: 0 }));
		const b = svgOf(renderStatefulKey(view("vtol", "moving", "…"), "text", { state: "moving-on", label: "x", phase: 0.25 }));
		expect(a).toContain("rotate(0.0 12 12)");
		expect(b).toContain("rotate(45.0 12 12)");
	});

	test("danger : contour rouge et ⚠ ; style B : voyant", () => {
		const d = svgOf(renderStatefulKey(view("doors_closed", "off", "OUVERTES"), "text", { state: "off", label: "x", danger: true }));
		expect(d).toContain(SHIP_COLORS.danger);
		expect(d).toContain("⚠");
		const led = svgOf(renderStatefulKey(view("lights", "on"), "led", { state: "on", label: "x" }));
		expect(led).toContain('cx="124"');
		expect(led).not.toContain(">ON<");
	});
});
