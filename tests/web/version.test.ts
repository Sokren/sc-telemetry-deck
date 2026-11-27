import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { VERSION } from "../../src/web/server-core.js";

const manifest = JSON.parse(
	fs.readFileSync(fileURLToPath(new URL("../../com.sokren.sc-telemetry.sdPlugin/manifest.json", import.meta.url)), "utf-8"),
);

describe("numéro de version", () => {
	// Deux numéros tenus à la main : celui de l'appli web et celui du plugin Stream Deck. Une release qui n'en
	// change qu'un échoue ici (0.4.0-beta.1 ↔ 0.4.0.0).
	test("l'appli web et le plugin Stream Deck portent le même numéro", () => {
		const base = VERSION.split("-")[0];
		expect(manifest.Version).toBe(`${base}.0`);
	});

	test("forme X.Y.Z, avec une préversion facultative (-beta.N, -rc.N)", () => {
		expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/);
	});
});
