import { describe, expect, test } from "vitest";
// @ts-expect-error module JS de la page, sans types
import { localizeNumber, moneyText } from "../../src/web/static/numbers.js";

const NN = " "; // espace fine insécable (milliers en français)

describe("format des nombres indépendant de la langue", () => {
	test("page en anglais, nombres à la française", () => {
		expect(localizeNumber("36.5", "en", "fr")).toBe("36,5");
		expect(localizeNumber("12,345,678", "en", "fr")).toBe(`12${NN}345${NN}678`);
		expect(localizeNumber("15.0M", "en", "fr")).toBe("15,0M");
		expect(localizeNumber("−12.5", "en", "fr")).toBe("−12,5");
	});
	test("page en français, nombres à l'anglaise", () => {
		expect(localizeNumber("36,5", "fr", "en")).toBe("36.5");
		expect(localizeNumber(`12${NN}345,5`, "fr", "en")).toBe("12,345.5");
		expect(localizeNumber("15,0 M", "fr", "en")).toBe("15.0 M");
	});
	test("selon la langue, même format ou texte qui n'est pas un nombre : inchangé", () => {
		expect(localizeNumber("36.5", "en", "auto")).toBe("36.5");
		expect(localizeNumber("36.5", "en", "en")).toBe("36.5");
		expect(localizeNumber("3 / 4", "en", "fr")).toBe("3 / 4");
		expect(localizeNumber("Avenger Titan", "en", "fr")).toBe("Avenger Titan");
		expect(localizeNumber("—", "en", "fr")).toBe("—");
	});
});

describe("solde : échelle au choix, tronqué", () => {
	test("auto : texte compact de l'appli (null = à garder)", () => {
		expect(moneyText("15021736", undefined, "fr")).toBeNull();
	});
	test("complet, milliers, millions", () => {
		expect(moneyText("15021736", "full", "fr")).toBe(`15${NN}021${NN}736`);
		expect(moneyText("15021736", "full", "en")).toBe("15,021,736");
		expect(moneyText("15021736", "k", "fr")).toBe(`15${NN}021 k`);
		expect(moneyText("15021736", "k", "en")).toBe("15,021k");
		expect(moneyText("15029736", "m", "fr")).toBe("15,02 M");
		expect(moneyText("15029736", "m", "en")).toBe("15.02M");
		expect(moneyText("abc", "full", "fr")).toBeNull();
	});
});
