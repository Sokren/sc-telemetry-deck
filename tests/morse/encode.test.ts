import { describe, expect, test } from "vitest";
import { codeGlyphs, normalizeText, progressAt, progressLines, toSigns, toToggleTimes } from "../../src/morse/encode.js";

describe("normalizeText", () => {
	test("majuscules, espaces réduits et rognés", () => {
		expect(normalizeText("  a  b ")).toBe("A B");
	});
	test("accents retirés", () => {
		expect(normalizeText("été")).toBe("ETE");
		expect(normalizeText("Ça")).toBe("CA");
	});
	test("caractères non gérés retirés", () => {
		expect(normalizeText("S.O.S !")).toBe("SOS");
		expect(normalizeText("?!")).toBe("");
	});
});

describe("toToggleTimes", () => {
	test("SOS, unité 100 ms", () => {
		expect(toToggleTimes("SOS", 100, 1)).toEqual([
			0, 100, 200, 300, 400, 500, // S
			800, 1100, 1200, 1500, 1600, 1900, // O
			2200, 2300, 2400, 2500, 2600, 2700, // S
		]);
	});
	test("7 unités entre deux mots", () => {
		expect(toToggleTimes("E E", 100, 1)).toEqual([0, 100, 800, 900]);
	});
	test("7 unités entre deux répétitions", () => {
		expect(toToggleTimes("E", 100, 2)).toEqual([0, 100, 800, 900]);
	});
	test("texte normalisé avant encodage", () => {
		expect(toToggleTimes("é", 100, 1)).toEqual([0, 100]);
	});
	test("rien à émettre → []", () => {
		expect(toToggleTimes("?!", 100, 1)).toEqual([]);
		expect(toToggleTimes("", 100, 3)).toEqual([]);
	});
});

describe("progression", () => {
	const signs = toSigns("ET E", 2); // E · T − ␣ E · ␣(2e tour) E · T − ␣ E ·
	test("un signe par paire de bascules, mêmes positions que toToggleTimes", () => {
		expect(signs.length * 2).toBe(toToggleTimes("ET E", 100, 2).length);
		expect(signs.map((s) => s.letter).join("")).toBe("ETEETE");
		expect(signs.map((s) => s.wordStart)).toEqual([true, false, true, true, false, true]);
	});
	test("bascule paire = signe allumé, impaire = entre deux signes", () => {
		expect(progressAt(signs, 0, 2)).toEqual({ letter: "E", code: ".", sign: 0, round: 1, rounds: 2, wordGap: false });
		expect(progressAt(signs, 1, 2)).toMatchObject({ letter: "E", sign: -1, wordGap: false }); // T suit dans le même mot
		expect(progressAt(signs, 2, 2)).toMatchObject({ letter: "T", code: "-", sign: 0 });
	});
	test("pause entre deux mots et entre deux tours", () => {
		expect(progressAt(signs, 3, 2)).toMatchObject({ letter: "T", wordGap: true });
		expect(progressAt(signs, 5, 2)).toMatchObject({ round: 1, wordGap: true });
		expect(progressAt(signs, 6, 2)).toMatchObject({ letter: "E", round: 2, wordGap: false });
		expect(progressAt(signs, 11, 2)).toMatchObject({ round: 2, wordGap: false }); // dernier signe : rien après
	});
	test("hors des signes → undefined", () => {
		expect(progressAt(signs, -1, 2)).toBeUndefined();
		expect(progressAt(signs, 12, 2)).toBeUndefined();
	});
	test("code lisible, signe allumé en gros", () => {
		expect(codeGlyphs({ code: ".-..", sign: -1 })).toBe("·−··");
		expect(codeGlyphs({ code: ".-..", sign: 1 })).toBe("·▬··");
		expect(codeGlyphs({ code: ".-..", sign: 2 })).toBe("·−●·");
		expect(progressLines({ letter: "L", code: ".-..", sign: 0, round: 1, rounds: 1, wordGap: false })).toEqual(["L", "●−··"]);
		expect(progressLines({ letter: "L", code: ".-..", sign: -1, round: 1, rounds: 1, wordGap: true })).toEqual(["␣", ""]);
	});
});
