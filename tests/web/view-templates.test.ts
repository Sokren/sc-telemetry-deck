import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { parseViewInput } from "../../src/web/view.js";
import { buildExport, encodeCode, readImport } from "../../src/web/view-export.js";
import { VERSION } from "../../src/web/server-core.js";
import { templateById, templateSummary, VIEW_TEMPLATES } from "../../src/web/view-templates.js";

describe("modèles de vues", () => {
	test.each(VIEW_TEMPLATES.flatMap((t) => (["fr", "en"] as const).map((lang) => [t.id, lang, t] as const)))(
		"%s (%s) : valide, rien de perdu à la lecture",
		(_id, lang, t) => {
			const view = t.build(lang);
			expect(parseViewInput(view, lang)).toEqual(view);
		},
	);

	test("Xeneon : titres traduits, sections en tiers, nouveaux styles", () => {
		const t = templateById("xeneon_pilot")!;
		const fr = t.build("fr");
		const en = t.build("en");
		expect(fr.sections.map((s) => s.title)).toEqual(["Vaisseau", "Vol · IFCS", "Quantique · Énergie", "Atterrissage · Aux", "Personnage"]);
		expect(en.sections.map((s) => s.title)).toEqual(["Ship", "Flight · IFCS", "Quantum · Power", "Landing · Aux", "Character"]);
		expect(fr.sections.map((s) => s.width)).toEqual(["full", "third", "third", "third", "third"]);
		expect(fr.sections.map((s) => !!s.tall)).toEqual([false, true, true, false, false]);
		const styleOf = (id: string) => fr.sections.flatMap((s) => s.items).find((i) => i.id === id)?.display?.style;
		expect([styleOf("heading"), styleOf("master_nav"), styleOf("self_destruct"), styleOf("eject")]).toEqual(["tape", "switch", "slide", "hold"]);
		expect(fr.look).toBe("cockpit");
		const items = (id: string) => fr.sections.find((s) => s.id === id)!.items;
		const find = (sec: string, id: string) => items(sec).find((i) => i.id === id)!;
		// Leurres et bruit sur une ligne (nom + nombre restant) ; NAV centré ; un vide avant l'éjection.
		expect([find("ship", "decoys").display?.style, find("ship", "noise").display?.style]).toEqual(["line", "line"]);
		expect([find("flight", "master_nav").size, find("flight", "master_nav").col]).toEqual([1, 3]);
		expect(find("aux", "eject").col).toBe(7);
		expect(fr.sections.flatMap((s) => s.items).some((i) => (i.kind as string) === "spacer")).toBe(false);
	});

	test("Instrument de bord : habillage, sections, pas de portes, éjection maintenue", () => {
		const fr = templateById("instrument_panel")!.build("fr");
		const en = templateById("instrument_panel")!.build("en");
		expect(fr.look).toBe("instrument");
		expect(fr.name).toBe("Instrument de bord");
		expect(en.name).toBe("Instrument panel");
		expect(fr.sections.map((s) => s.id)).toEqual(["quantum", "ship", "functions", "character", "mission", "perf"]);
		expect(en.sections.map((s) => s.title)).toEqual(["Quantum travel", "Ship", "Functions", "Character", "Tracked mission", "Performance"]);
		expect(fr.sections.map((s) => s.title)).toEqual(["Saut quantique", "Vaisseau", "Fonctions", "Personnage", "Mission suivie", "Performances"]);
		const all = fr.sections.flatMap((s) => s.items);
		expect(all.some((i) => i.ref?.startsWith("doors"))).toBe(false);
		expect(all.find((i) => i.ref === "v_eject")?.display?.style).toBe("hold");
		// Mode maître : interrupteur NAV / SCM dans la section Vaisseau (plus l'info en lecture seule).
		const ship = fr.sections.find((s) => s.id === "ship")!.items;
		expect(ship.find((i) => i.ref === "master_nav")).toMatchObject({ kind: "ship_function", display: { style: "switch" } });
		expect(all.some((i) => i.kind === "ship_info" && i.ref === "master_mode")).toBe(false);
		expect(templateSummary(templateById("instrument_panel")!, "fr")).toMatchObject({ name: "Instrument de bord", size: { width: 1280, height: 800 } });
	});

	test("résumé pour l'API ; modèle inconnu", () => {
		expect(templateSummary(templateById("xeneon_pilot")!, "en")).toMatchObject({
			id: "xeneon_pilot",
			name: "Xeneon Edge – pilot",
			size: { width: 2560, height: 720 },
		});
		expect(templateById("nope")).toBeUndefined();
		expect(templateById(undefined)).toBeUndefined();
	});
});

describe("fichiers à importer (docs/vues)", () => {
	const dir = new URL("../../docs/vues/", import.meta.url);
	const hint = "fichiers périmés : lancer npm run templates:export";
	// npm run templates:export : réécrit les fichiers depuis le code avant de les vérifier.
	if (process.env.SCTD_WRITE_TEMPLATES === "1") {
		fs.mkdirSync(dir, { recursive: true });
		for (const lang of ["fr", "en"] as const) {
			const doc = buildExport([{ id: "x", ...templateById("xeneon_pilot")!.build(lang) }], VERSION, new Date("2026-11-24T00:00:00.000Z"));
			fs.writeFileSync(new URL(`xeneon-edge-pilote.${lang}.json`, dir), `${JSON.stringify(doc, null, "	")}
`);
			fs.writeFileSync(new URL(`xeneon-edge-pilote.${lang}.code.txt`, dir), `${encodeCode(doc)}
`);
		}
	}
	test.each(["fr", "en"] as const)("xeneon-edge-pilote (%s) : .json et code identiques au modèle", (lang) => {
		const view = templateById("xeneon_pilot")!.build(lang);
		const doc = JSON.parse(fs.readFileSync(new URL(`xeneon-edge-pilote.${lang}.json`, dir), "utf-8"));
		const fromJson = readImport(doc, lang);
		expect("views" in fromJson && fromJson.views, hint).toEqual([view]);
		expect("views" in fromJson && fromJson.skipped).toEqual([]);
		const code = fs.readFileSync(new URL(`xeneon-edge-pilote.${lang}.code.txt`, dir), "utf-8").trim();
		const fromCode = readImport({ code }, lang);
		expect("views" in fromCode && fromCode.views, hint).toEqual([view]);
	});
});
