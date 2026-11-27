// SPDX-License-Identifier: MPL-2.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const CODE = /\.(ts|js|mjs|cjs|py|cs)$/;
const SKIP = new Set(["node_modules", "bin", "obj", "__pycache__"]);

/** Fichiers de code du projet (hors tests, dépendances et fichiers construits). */
function codeFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return SKIP.has(e.name) ? [] : codeFiles(p);
		return CODE.test(e.name) ? [p] : [];
	});
}

describe("en-têtes de licence", () => {
	test("chaque fichier de code porte la ligne SPDX MPL-2.0 en tête", () => {
		const files = [
			...["src", "scripts", "tools", "examples"].flatMap((d) => codeFiles(path.join(root, d))),
			...fs.readdirSync(root).filter((f) => CODE.test(f)).map((f) => path.join(root, f)),
		];
		expect(files.length).toBeGreaterThan(100);
		const missing = files
			.filter((f) => !fs.readFileSync(f, "utf-8").split(/\r?\n/, 3).some((l) => l.includes("SPDX-License-Identifier: MPL-2.0")))
			.map((f) => path.relative(root, f));
		expect(missing).toEqual([]);
	});
});
