import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// @ts-expect-error module JS de la page, sans types
import { holdToPress, HOLD_MS } from "../../src/web/static/hold.js";

/** Élément minimal : écouteurs, classes, variables CSS (pas de DOM dans les tests). */
function fakeElement() {
	const listeners = new Map<string, ((e: object) => void)[]>();
	const classes = new Set<string>();
	const vars = new Map<string, string>();
	return {
		listeners,
		vars,
		classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), has: (c: string) => classes.has(c) },
		style: { setProperty: (k: string, v: string) => vars.set(k, v), removeProperty: (k: string) => vars.delete(k) },
		dataset: {} as Record<string, string>,
		setAttribute() {},
		append() {},
		addEventListener(type: string, fn: (e: object) => void) {
			listeners.set(type, [...(listeners.get(type) ?? []), fn]);
		},
		fire(type: string, e: object = {}) {
			for (const fn of listeners.get(type) ?? []) fn({ button: 0, preventDefault() {}, ...e });
		},
	};
}

describe("appui maintenu", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
		vi.stubGlobal("document", { createElement: () => fakeElement() });
		// Images d'animation toutes les 16 ms (Node n'a pas requestAnimationFrame).
		vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 16));
		vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	test("la progression (--hold) avance pendant l'appui, puis l'action part au bout de HOLD_MS", () => {
		const el = fakeElement();
		const done = vi.fn();
		holdToPress(el, done);
		el.fire("pointerdown");
		vi.advanceTimersByTime(HOLD_MS / 2);
		expect(Number(el.vars.get("--hold"))).toBeGreaterThan(0.4);
		expect(done).not.toHaveBeenCalled();
		vi.advanceTimersByTime(HOLD_MS / 2 + 20);
		expect(done).toHaveBeenCalledTimes(1);
	});

	test("relâcher avant la fin annule et remet la case à zéro", () => {
		const el = fakeElement();
		const done = vi.fn();
		holdToPress(el, done);
		el.fire("pointerdown");
		vi.advanceTimersByTime(HOLD_MS / 3);
		el.fire("pointerup");
		vi.advanceTimersByTime(HOLD_MS);
		expect(done).not.toHaveBeenCalled();
		expect(el.vars.has("--hold")).toBe(false);
	});
});
