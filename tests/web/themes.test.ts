import fs from "node:fs";
import { describe, expect, test } from "vitest";
// @ts-expect-error module JS de la page, sans types
import { applyTheme, readTheme, saveTheme, themeAccent, THEMES } from "../../src/web/static/themes.js";

const memory = (init?: string) => {
	const m = new Map<string, string>(init === undefined ? [] : [["sctd-theme", init]]);
	return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const fakeRoot = () => {
	const props = new Map<string, string>();
	return {
		dataset: {} as Record<string, string>,
		style: { setProperty: (k: string, v: string) => void props.set(k, v), removeProperty: (k: string) => void props.delete(k) },
		props,
	};
};

describe("thèmes de la page", () => {
	test("réglage absent, illisible ou inconnu → thème par défaut, sans accent", () => {
		expect(readTheme(memory())).toEqual({ id: "current", accent: "" });
		expect(readTheme(memory("{pas du json"))).toEqual({ id: "current", accent: "" });
		expect(readTheme(memory('{"id":"rose","accent":"red"}'))).toEqual({ id: "current", accent: "" });
	});

	test("enregistré puis relu ; accent normalisé en minuscules", () => {
		const s = memory();
		saveTheme({ id: "amber", accent: "#AABBCC" }, s);
		expect(readTheme(s)).toEqual({ id: "amber", accent: "#aabbcc" });
	});

	test("appliquer : palette par data-theme, accent seulement s'il est choisi", () => {
		const root = fakeRoot();
		applyTheme({ id: "green", accent: "#123456" }, root);
		expect(root.dataset.theme).toBe("green");
		expect(root.props.get("--accent")).toBe("#123456");
		applyTheme({ id: "current", accent: "" }, root);
		expect(root.dataset.theme).toBeUndefined();
		expect(root.props.has("--accent")).toBe(false);
	});

	test("chaque thème a sa palette dans style.css et le script de démarrage le connaît", () => {
		const css = fs.readFileSync(new URL("../../src/web/static/style.css", import.meta.url), "utf-8");
		const boot = fs.readFileSync(new URL("../../src/web/static/theme-boot.js", import.meta.url), "utf-8");
		for (const { id } of THEMES.filter((t: { id: string }) => t.id !== "current")) {
			expect(css).toContain(`:root[data-theme="${id}"]`);
			expect(boot).toContain(`"${id}"`);
		}
		expect(themeAccent("light")).toBe("#0b6bcb");
	});
});
