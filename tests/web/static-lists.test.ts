import fs from "node:fs";
import { describe, expect, test } from "vitest";
import assets from "../../src/web/sea-assets.json" with { type: "json" };

// Les fichiers de la page sont copiés d'après des listes écrites à la main (construction, exécutable) : un fichier
// oublié casse la page construite (module introuvable) sans qu'aucun autre test ne le voie.
const staticDir = new URL("../../src/web/static/", import.meta.url);
const shipped = fs.readdirSync(staticDir).filter((f) => !f.endsWith(".d.ts"));

describe("fichiers de la page", () => {
	test("tous copiés par la construction (rollup.web.config.mjs)", () => {
		const config = fs.readFileSync(new URL("../../rollup.web.config.mjs", import.meta.url), "utf-8");
		for (const f of shipped) expect(config, f).toContain(`"${f}"`);
	});
	test("tous intégrés à l'exécutable (sea-assets.json)", () => {
		for (const f of shipped) expect(assets as unknown as string[], f).toContain(`static/${f}`);
	});
});
