import { describe, expect, test } from "vitest";
// @ts-expect-error module JS de la page, sans types
import { confirmModeFor, widthStep, setTall, SLIDE_DONE, slideProgress, uniqueName, sectionSlots, sizeSlots, slotAt, fitCol, sizeStep } from "../../src/web/static/view.js";

describe("Ma vue : largeur des sections", () => {
	test("plus large / plus étroite : tiers ↔ demie ↔ pleine", () => {
		expect(widthStep("third", 1)).toBe("half");
		expect(widthStep("half", 1)).toBe("full");
		expect(widthStep("full", -1)).toBe("half");
		expect(widthStep("half", -1)).toBe("third");
	});
	test("rien au-delà des bornes (pas de retour au début)", () => {
		expect(widthStep("full", 1)).toBeUndefined();
		expect(widthStep("third", -1)).toBeUndefined();
	});
});

describe("Ma vue : confirmation des actions", () => {
	const hold = new Set(["v_eject"]);
	test("glisser : seuil d'envoi, borné", () => {
		expect(slideProgress(-5, 100)).toBe(0);
		expect(slideProgress(97, 100)).toBeLessThan(SLIDE_DONE);
		expect(slideProgress(99, 100)).toBeGreaterThanOrEqual(SLIDE_DONE);
		expect(slideProgress(150, 100)).toBe(1);
		expect(slideProgress(10, 0)).toBe(0);
	});
	test("mode : le style choisi, sinon maintenir pour l'éjection, sinon un appui", () => {
		expect(confirmModeFor("v_eject", undefined, hold)).toBe("hold");
		expect(confirmModeFor("v_eject", "slide", hold)).toBe("slide");
		expect(confirmModeFor("v_eject", "card", hold)).toBe("hold");
		expect(confirmModeFor("v_self_destruct", "slide", hold)).toBe("slide");
		expect(confirmModeFor("v_lights", "hold", hold)).toBe("hold");
		expect(confirmModeFor("v_lights", undefined, new Set())).toBe("press");
	});
});

describe("Ma vue : nom d'une vue créée depuis un modèle", () => {
	test("libre → tel quel ; pris → suffixe 2, 3… ; 24 caractères au plus", () => {
		expect(uniqueName("Xeneon Edge – pilote", [])).toBe("Xeneon Edge – pilote");
		expect(uniqueName("Xeneon Edge – pilote", ["Xeneon Edge – pilote"])).toBe("Xeneon Edge – pilote 2");
		expect(uniqueName("Xeneon Edge – pilote", ["Xeneon Edge – pilote", "Xeneon Edge – pilote 2"])).toBe("Xeneon Edge – pilote 3");
		const long = "A".repeat(24);
		expect(uniqueName(long, [long])).toBe(`${"A".repeat(22)} 2`);
	});
});

describe("Ma vue : section haute", () => {
	test("clés dans l'ordre de l'appli, tall seulement si vrai", () => {
		const s: any = { id: "a", items: [], title: "A", width: "third" };
		setTall(s, true);
		expect(Object.keys(s)).toEqual(["id", "title", "width", "tall", "items"]);
		setTall(s, false);
		expect(s).toEqual({ id: "a", title: "A", width: "third", items: [] });
	});
});

describe("largeur affichée en emplacements entiers (jamais de fractions)", () => {
	test("¼ = 1, ½ = 2, 1 = 4, 1½ = 6, 2 = 8, 4 = 16", () => {
		expect([0.25, 0.5, 1, 1.5, 2, 3, 4].map(sizeSlots)).toEqual([1, 2, 4, 6, 8, 12, 16]);
	});
	test("emplacements d'une section : 16 en pleine largeur, 8 en demi ou tiers", () => {
		expect(["full", "half", "third"].map(sectionSlots)).toEqual([16, 8, 8]);
	});
});

describe("placement libre : colonne sous le pointeur", () => {
	// Grille de 16 colonnes de 90 px, espacées de 10 px (1600 px), à partir de x = 100.
	const grid = { left: 100, width: 1590, gap: 10 };
	test("colonne visée (1 à 16)", () => {
		expect(slotAt(100, grid, 16)).toBe(1);
		expect(slotAt(205, grid, 16)).toBe(2);
		expect(slotAt(195, grid, 16)).toBe(1);
		expect(slotAt(1685, grid, 16)).toBe(16);
		expect(slotAt(20, grid, 16)).toBe(1);
		expect(slotAt(5000, grid, 16)).toBe(16);
	});
	test("une case ne dépasse jamais la ligne : colonne ramenée à gauche", () => {
		expect(fitCol(15, 4, 16)).toBe(13);
		expect(fitCol(3, 4, 16)).toBe(3);
		expect(fitCol(12, 4, 8)).toBe(5);
		expect(fitCol(undefined, 4, 16)).toBeUndefined();
	});
});

describe("taille : plus grand / plus petit", () => {
	const full = { width: "full" };
	const third = { width: "third" };
	const v = (size: number) => ({ kind: "vital", size });
	test("taille voisine dans les deux sens", () => {
		expect(sizeStep(v(1), full, 1)).toBe(1.5);
		expect(sizeStep(v(1), full, -1)).toBe(0.5);
		expect(sizeStep(v(2), full, 1)).toBe(3);
	});
	test("rien au-delà des bornes (pas de retour au début)", () => {
		expect(sizeStep(v(0.25), full, -1)).toBeUndefined();
		expect(sizeStep(v(4), full, 1)).toBeUndefined();
		expect(sizeStep(v(2), third, 1)).toBeUndefined();
		expect(sizeStep({ kind: "annunciators", size: 1 }, full, -1)).toBeUndefined();
	});
	test("case trop large pour sa section : plus petit la ramène dans la section", () => {
		expect(sizeStep(v(3), third, -1)).toBe(2);
		expect(sizeStep(v(3), third, 1)).toBeUndefined();
	});
});
