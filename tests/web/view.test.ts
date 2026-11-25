import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { defaultLayout, MAX_VIEWS, parseViewInput, readSections, ViewStore } from "../../src/web/view.js";

const input = (): any => ({ name: "Vue", sections: JSON.parse(JSON.stringify(defaultLayout("fr").sections)) });
const dirs: string[] = [];
const tmp = () => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "sc-view-"));
	dirs.push(d);
	return d;
};
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("parseViewInput", () => {
	test("la disposition par défaut est valide et inchangée", () => {
		expect(parseViewInput(input(), "fr")).toEqual({ name: "Vue", sections: defaultLayout("fr").sections });
		expect(defaultLayout("fr").sections.map((s) => s.title)).toEqual(["Survie", "Vol", "Commandes du vaisseau"]);
		expect(defaultLayout("en").sections.map((s) => s.title)).toEqual(["Survival", "Flight", "Ship controls"]);
	});

	test.each([
		["type de case inconnu", (v: any) => (v.sections[0].items[0].kind = "rocket")],
		["constante inconnue", (v: any) => (v.sections[0].items[0] = { id: "x", kind: "vital", ref: "mana", size: 1 })],
		["nom d'action invalide", (v: any) => v.sections[0].items.push({ id: "x", kind: "action", ref: "../x", size: 1 })],
		["taille 5", (v: any) => (v.sections[0].items[0].size = 5)],
		["taille 2,5", (v: any) => (v.sections[0].items[0].size = 2.5)],
		["largeur inconnue", (v: any) => (v.sections[0].width = "quarter")],
		["ids de section en double", (v: any) => (v.sections[1].id = v.sections[0].id)],
		["ids de case en double", (v: any) => (v.sections[1].items[0].id = v.sections[0].items[0].id)],
		["id invalide", (v: any) => (v.sections[0].id = "a b")],
		["21 sections", (v: any) => (v.sections = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: "x", width: "half", items: [] })))],
		["41 cases", (v: any) => (v.sections[0].items = Array.from({ length: 41 }, (_, i) => ({ id: `i${i}`, kind: "annunciators", size: 1 })))],
		["sections pas un tableau", (v: any) => (v.sections = "x")],
		["nom pas un texte", (v: any) => (v.name = 3)],
	])("refus : %s", (_name, mutate) => {
		const v = input();
		mutate(v);
		expect(parseViewInput(v, "fr")).toBeUndefined();
	});

	test("refus : pas un objet", () => {
		expect(parseViewInput(null, "fr")).toBeUndefined();
		expect(parseViewInput([], "fr")).toBeUndefined();
	});

	test("sections absentes → aucune (création) ; nom tronqué à 24, vide → Vue / View", () => {
		expect(parseViewInput({ name: "Vol" }, "fr")).toEqual({ name: "Vol", sections: [] });
		expect(parseViewInput({ name: "x".repeat(50) }, "fr")!.name).toHaveLength(24);
		expect(parseViewInput({ name: "   " }, "fr")!.name).toBe("Vue");
		expect(parseViewInput({}, "en")!.name).toBe("View");
	});

	test("titre de section tronqué à 40, vide → « Section »", () => {
		const v = input();
		v.sections[0].title = "x".repeat(200);
		v.sections[1].title = "   ";
		const p = parseViewInput(v, "fr")!;
		expect(p.sections[0].title).toHaveLength(40);
		expect(p.sections[1].title).toBe("Section");
	});

	test("encart vaisseau : accepté sans ref (ref ignorée), tailles 1 et 2", () => {
		const v = input();
		v.sections[0].items.push({ id: "card", kind: "ship_card", ref: "x", size: 2 });
		v.sections[0].items.push({ id: "card1", kind: "ship_card", size: 1 });
		const p = parseViewInput(v, "fr")!;
		expect(p.sections[0].items.at(-2)).toEqual({ id: "card", kind: "ship_card", size: 2 });
		expect(p.sections[0].items.at(-1)).toEqual({ id: "card1", kind: "ship_card", size: 1 });
	});

	test("build 13273298 : encarts sans ref ni nom (≥ 1×), nouvelles infos, styles chiffre / ligne", () => {
		const v = input();
		for (const kind of ["quantum_card", "who_card", "mission_card", "perf_card"]) v.sections[0].items.push({ id: kind, kind, ref: "x", size: 0.5, label: "x" });
		v.sections[0].items.push({ id: "qt", kind: "ship_info", ref: "qt_eta", size: 1 });
		v.sections[0].items.push({ id: "cs", kind: "character_info", ref: "crime_stat", size: 1, display: { style: "number" } });
		v.sections[0].items.push({ id: "fps", kind: "game_info", ref: "fps", size: 0.5, display: { style: "line" } });
		v.sections[0].items.push({ id: "bad", kind: "game_info", ref: "fps", size: 1, display: { style: "ring" } });
		const p = parseViewInput(v, "fr")!;
		const items = p.sections[0].items;
		for (const kind of ["quantum_card", "who_card", "mission_card", "perf_card"]) expect(items.find((i) => i.id === kind)).toEqual({ id: kind, kind, size: 1 });
		expect(items.find((i) => i.id === "qt")).toEqual({ id: "qt", kind: "ship_info", ref: "qt_eta", size: 1 });
		expect(items.find((i) => i.id === "cs")?.display).toEqual({ style: "number" });
		expect(items.find((i) => i.id === "fps")).toEqual({ id: "fps", kind: "game_info", ref: "fps", size: 0.5, display: { style: "line" } });
		expect(items.find((i) => i.id === "bad")).not.toHaveProperty("display");
		const w = input();
		w.sections[0].items.push({ id: "x", kind: "game_info", ref: "cpu_temp", size: 1 });
		expect(parseViewInput(w, "fr")).toBeUndefined();
	});

	test("morse : message enregistré (texte obligatoire, 60 max) et morse libre (sans texte) ; réglages bornés", () => {
		const v = input();
		const ok = { light: "ship_lights", unitMs: 400, repeat: 2 };
		v.sections[0].items.push({ id: "m1", kind: "morse", ref: "x", size: 1, settings: { text: "  sos  ", ...ok } });
		v.sections[0].items.push({ id: "m2", kind: "morse_free", size: 2, settings: { text: "ignoré", light: "flashlight", unitMs: 100, repeat: 10 } });
		const p = parseViewInput(v, "fr")!;
		expect(p.sections[0].items.at(-2)).toEqual({ id: "m1", kind: "morse", size: 1, settings: { text: "sos", ...ok } });
		expect(p.sections[0].items.at(-1)).toEqual({ id: "m2", kind: "morse_free", size: 2, settings: { light: "flashlight", unitMs: 100, repeat: 10 } });
		for (const settings of [
			undefined,
			{ ...ok },
			{ text: "   ", ...ok },
			{ text: "x".repeat(61), ...ok },
			{ text: "SOS", ...ok, light: "laser" },
			{ text: "SOS", ...ok, unitMs: 50 },
			{ text: "SOS", ...ok, unitMs: 400.5 },
			{ text: "SOS", ...ok, repeat: 11 },
		]) {
			const bad = input();
			bad.sections[0].items.push({ id: "m", kind: "morse", size: 1, settings });
			expect(parseViewInput(bad, "fr"), JSON.stringify(settings)).toBeUndefined();
		}
		const badFree = input();
		badFree.sections[0].items.push({ id: "m", kind: "morse_free", size: 1 });
		expect(parseViewInput(badFree, "fr")).toBeUndefined();
	});

	test("action normale acceptée, ref ignorée pour les voyants", () => {
		const v = input();
		v.sections[0].items.push({ id: "e1", kind: "action", ref: "emote_wave", size: 2 });
		v.sections[0].items.push({ id: "a1", kind: "annunciators", ref: "nimporte", size: 1 });
		const p = parseViewInput(v, "fr")!;
		expect(p.sections[0].items.at(-2)).toEqual({ id: "e1", kind: "action", ref: "emote_wave", size: 2 });
		expect(p.sections[0].items.at(-1)).toEqual({ id: "a1", kind: "annunciators", size: 1 });
	});
});

describe("ViewStore", () => {
	test("premier lancement : une vue « main » dont le nom suit la langue", () => {
		const s = new ViewStore();
		expect(s.list("fr")).toEqual([{ id: "main", name: "Ma vue", sections: defaultLayout("fr").sections }]);
		expect(s.list("en")[0]).toMatchObject({ id: "main", name: "My view" });
		expect(s.list("en")[0].sections[0].title).toBe("Survival");
	});

	test("création jusqu'à 10 vues, ids uniques et valides", () => {
		const s = new ViewStore();
		const ids = new Set<string>(["main"]);
		for (let i = 1; i < MAX_VIEWS; i++) {
			const v = s.create({ name: `Vue ${i}`, sections: [] }, "fr");
			if (typeof v === "string") throw new Error(v);
			expect(v.id).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
			ids.add(v.id);
		}
		expect(ids.size).toBe(MAX_VIEWS);
		expect(s.create({ name: "Trop", sections: [] }, "fr")).toBe("too_many");
		expect(s.list("fr")).toHaveLength(MAX_VIEWS);
	});

	test("modification d'une vue sans toucher les autres", () => {
		const s = new ViewStore();
		const b = s.create({ name: "B", sections: [] }, "fr") as any;
		expect(s.update("main", { name: "A", sections: [] }, "fr")).toMatchObject({ id: "main", name: "A", sections: [] });
		expect(s.update(b.id, { name: "B2", sections: input().sections }, "fr")).toMatchObject({ name: "B2" });
		expect(s.list("fr").map((v) => v.name)).toEqual(["A", "B2"]);
		expect(s.list("fr")[0].sections).toEqual([]);
		expect(s.update("nope", { name: "x", sections: [] }, "fr")).toBe("unknown");
	});

	test("suppression : inconnue, dernière vue refusée", () => {
		const s = new ViewStore();
		expect(s.remove("main", "fr")).toBe("last");
		expect(s.remove("nope", "fr")).toBe("unknown");
		const b = s.create({ name: "B", sections: [] }, "fr") as any;
		expect(s.remove("main", "fr")).toBe(true);
		expect(s.list("fr").map((v) => v.id)).toEqual([b.id]);
	});

	test("nom de « main » figé dans la langue de la page qui enregistre la première fois", () => {
		const file = path.join(tmp(), "view.json");
		const s = new ViewStore(file);
		s.create({ name: "X", sections: [] }, "fr");
		expect(s.list("en")[0].name).toBe("Ma vue");
		expect(s.list("en")[0].sections[0].title).toBe("Survie");
		expect(JSON.parse(fs.readFileSync(file, "utf-8")).version).toBe(2);
	});

	test("enregistre et relit le fichier", () => {
		const file = path.join(tmp(), "view.json");
		const s = new ViewStore(file);
		const b = s.create({ name: "Vol", sections: [] }, "fr") as any;
		s.update("main", { name: "Mes jauges", sections: [] }, "fr");
		expect(new ViewStore(file).list("en")).toEqual([
			{ id: "main", name: "Mes jauges", sections: [] },
			{ id: b.id, name: "Vol", sections: [] },
		]);
	});

	test("ancien format (une seule vue, version 1) : devient la vue « main »", () => {
		const file = path.join(tmp(), "view.json");
		const sections = input().sections;
		sections[0].title = "Mes jauges";
		fs.writeFileSync(file, JSON.stringify({ version: 1, sections }));
		const s = new ViewStore(file);
		expect(s.list("fr")).toEqual([{ id: "main", name: "Ma vue", sections }]);
		expect(s.list("en")[0].name).toBe("My view");
		s.create({ name: "B", sections: [] }, "en");
		expect(new ViewStore(file).list("fr")[0]).toEqual({ id: "main", name: "My view", sections });
	});

	test("fichier illisible : vue par défaut, ancien fichier gardé en .bak", () => {
		const file = path.join(tmp(), "view.json");
		fs.writeFileSync(file, "{ pas du json");
		expect(new ViewStore(file).list("fr")[0].sections).toEqual(defaultLayout("fr").sections);
		expect(fs.readFileSync(`${file}.bak`, "utf-8")).toBe("{ pas du json");
	});

	test("case devenue invalide (mise à jour de l'appli) : seule cette case est retirée, les vues restent, ancien fichier en .bak", () => {
		const file = path.join(tmp(), "view.json");
		const a = { id: "main", name: "A", sections: input().sections };
		const b = { id: "vb", name: "B", sections: input().sections.map((s: any) => ({ ...s, id: `b${s.id}`, items: s.items.map((i: any) => ({ ...i, id: `b${i.id}` })) })) };
		b.sections[0].items[0].ref = "constante_retiree";
		b.sections[1].items.push({ id: "boom", kind: "action", ref: "../boom", size: 1 });
		fs.writeFileSync(file, JSON.stringify({ version: 2, views: [a, b, { id: "a b", name: "id invalide", sections: [] }] }));
		const views = new ViewStore(file).list("fr");
		expect(views.map((v) => v.name)).toEqual(["A", "B"]);
		expect(views[0].sections).toEqual(a.sections);
		expect(views[1].sections[0].items).toHaveLength(a.sections[0].items.length - 1);
		expect(views[1].sections[1].items).toHaveLength(a.sections[1].items.length);
		expect(fs.existsSync(`${file}.bak`)).toBe(true);
	});

	test("ancien format avec une case devenue invalide : le reste est gardé", () => {
		const file = path.join(tmp(), "view.json");
		const sections = input().sections;
		sections[0].items[0].kind = "rocket";
		fs.writeFileSync(file, JSON.stringify({ version: 1, sections }));
		const s = new ViewStore(file).list("fr")[0];
		expect(s.sections).toHaveLength(3);
		expect(s.sections[0].items).toHaveLength(sections[0].items.length - 1);
	});

	test("fichier sans dérive : pas de .bak", () => {
		const file = path.join(tmp(), "view.json");
		new ViewStore(file).create({ name: "B", sections: input().sections }, "fr");
		new ViewStore(file);
		expect(fs.existsSync(`${file}.bak`)).toBe(false);
	});

	test("fichier version 2 sans aucune vue valide : .bak", () => {
		const file = path.join(tmp(), "view.json");
		fs.writeFileSync(file, JSON.stringify({ version: 2, views: [{ id: "a b", name: "A", sections: [] }, "x"] }));
		expect(new ViewStore(file).list("fr")[0].id).toBe("main");
		expect(fs.existsSync(`${file}.bak`)).toBe(true);
	});

	test("onChange prévenu à chaque création, modification et suppression", () => {
		const s = new ViewStore();
		let n = 0;
		const off = s.onChange(() => n++);
		const b = s.create({ name: "B", sections: [] }, "fr") as any;
		s.update(b.id, { name: "C", sections: [] }, "fr");
		s.remove(b.id, "fr");
		s.update("nope", { name: "x", sections: [] }, "fr");
		off();
		s.create({ name: "D", sections: [] }, "fr");
		expect(n).toBe(3);
	});
});

describe("readSections", () => {
	const item = (id: string, kind: string, ref?: string) => ({ id, kind, ...(ref ? { ref } : {}), size: 1 });
	test("garde les cases valides et rapporte chaque case retirée avec sa raison", () => {
		const r = readSections([
			{ id: "def", title: "Défense", width: "half", items: [item("a", "shield_faces"), item("b", "vital", "oxygen")] },
			{ id: "vol", title: "Vol", width: "half", items: [item("c", "instrument", "g_load"), { id: "d", kind: "instrument", ref: "speed" }] },
		]);
		expect(r.sections.map((s) => s.items.map((i) => i.id))).toEqual([["b"], []]);
		expect(r.skipped).toEqual([
			{ section: "Défense", kind: "shield_faces", reason: "unknown_kind" },
			{ section: "Vol", kind: "instrument", ref: "g_load", reason: "unknown_ref" },
			{ section: "Vol", kind: "instrument", ref: "speed", reason: "invalid_item" },
		]);
	});

	test("id de case en double → duplicate_id, 41e case → too_many_items, 21e section → too_many_sections", () => {
		const dup = readSections([
			{ id: "s1", title: "A", width: "half", items: [item("x", "vital", "oxygen")] },
			{ id: "s2", title: "B", width: "half", items: [item("x", "vital", "health")] },
		]);
		expect(dup.skipped).toEqual([{ section: "B", kind: "vital", ref: "health", reason: "duplicate_id" }]);
		const many = readSections([
			{ id: "s", title: "S", width: "full", items: Array.from({ length: 41 }, (_, i) => item(`i${i}`, "vital", "oxygen")) },
		]);
		expect(many.sections[0].items).toHaveLength(40);
		expect(many.skipped).toEqual([{ section: "S", kind: "vital", ref: "oxygen", reason: "too_many_items" }]);
		const secs = readSections(Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: `T${i}`, width: "half", items: [] })));
		expect(secs.sections).toHaveLength(20);
		expect(secs.skipped).toEqual([{ section: "T20", reason: "too_many_sections" }]);
	});

	test("section illisible → invalid_section", () => {
		expect(readSections([{ id: "s", title: "S", width: "quarter", items: [] }, 3]).skipped).toEqual([
			{ section: "S", reason: "invalid_section" },
			{ reason: "invalid_section" },
		]);
	});

	test("section en tiers relue telle quelle", () => {
		const v = parseViewInput({ name: "X", sections: [{ id: "a", title: "A", width: "third", items: [] }] }, "fr");
		expect(v?.sections[0].width).toBe("third");
		expect(readSections([{ id: "a", title: "A", width: "third", items: [] }]).skipped).toEqual([]);
	});

	test("largeur inconnue → vue refusée", () => {
		expect(parseViewInput({ name: "X", sections: [{ id: "a", title: "A", width: "quarter", items: [] }] }, "fr")).toBeUndefined();
	});

	test("ancienne vue (demi / plein, styles existants) relue identique", () => {
		const old = {
			name: "Ancienne",
			look: "hud" as const,
			sections: [
				...defaultLayout("fr").sections,
				{
					id: "styles",
					title: "Styles",
					width: "half" as const,
					items: (["ring", "arc", "bar", "vbar", "segments", "vsegments", "number"] as const).map((style, i) => ({
						id: `s${i}`,
						kind: "vital" as const,
						ref: "health",
						size: 1 as const,
						display: { style },
					})),
				},
			],
		};
		expect(parseViewInput(old, "fr")).toEqual(old);
	});

	test("nouvelle valeur : voyant boost", () => {
		const r = readSections([{ id: "s", title: "S", width: "half", items: [item("b", "ship_info", "boost")] }]);
		expect(r.skipped).toEqual([]);
		expect(r.sections[0].items.map((i) => i.ref)).toEqual(["boost"]);
	});

	test("une action dangereuse est gardée", () => {
		const r = readSections([{ id: "s", title: "S", width: "half", items: [item("e", "action", "v_eject")] }]);
		expect(r.sections[0].items).toHaveLength(1);
		expect(r.skipped).toEqual([]);
	});

	test("même résultat que l'ancienne lecture du fichier", () => {
		expect(readSections(defaultLayout("fr").sections)).toEqual({ sections: defaultLayout("fr").sections, skipped: [] });
	});
});

describe("styles par type (cap, interrupteur, glisser, maintenir)", () => {
	const one = (it: unknown) => parseViewInput({ name: "A", sections: [{ id: "s", title: "S", width: "half", items: [it] }] }, "fr")?.sections[0].items[0];
	const it = (kind: string, ref: string, style: string) => ({ id: "x", kind, ref, size: 1, display: { style } });
	test.each([
		["instrument", "heading", "tape"],
		["ship_function", "master_nav", "switch"],
		["ship_function", "lights", "switch"],
		["action", "v_self_destruct", "slide"],
		["action", "v_eject", "hold"],
		["action", "v_flightready", "slide"],
		["action", "v_lights", "hold"],
	])("%s %s + %s → gardé", (kind, ref, style) => expect(one(it(kind, ref, style))?.display).toEqual({ style }));
	test.each([
		["instrument", "speed", "tape"],
		["ship_function", "gear", "ring"],
		["action", "v_eject", "tape"],
		["action", "v_eject", "card"],
		["vital", "health", "switch"],
		["ship_info", "boost", "number"],
	])("%s %s + %s → style ignoré, case gardée", (kind, ref, style) => {
		const r = one(it(kind, ref, style));
		expect(r).toBeDefined();
		expect(r?.display).toBeUndefined();
	});
	test("ligne (nom à gauche, valeur à droite) : sur toutes les valeurs, pas sur un bouton", () => {
		expect(one(it("instrument", "decoys", "line"))?.display).toEqual({ style: "line" });
		expect(one(it("vital", "health", "line"))?.display).toEqual({ style: "line" });
		expect(one(it("ship_info", "name", "line"))?.display).toEqual({ style: "line" });
		expect(one(it("ship_function", "gear", "line"))?.display).toBeUndefined();
	});
	test("les jauges existantes restent permises sur le cap", () => expect(one(it("instrument", "heading", "number"))?.display).toEqual({ style: "number" }));
});

describe("habillage cockpit et sections hautes", () => {
	const sec = (extra: object) => ({ id: "a", title: "A", width: "third", items: [], ...extra });
	test("look cockpit gardé ; inconnu retiré", () => {
		expect(parseViewInput({ name: "X", sections: [], look: "cockpit" }, "fr")?.look).toBe("cockpit");
		expect(parseViewInput({ name: "X", sections: [], look: "neon" }, "fr")).toEqual({ name: "X", sections: [] });
	});
	test("section haute : tall: true gardé, autre valeur retirée", () => {
		expect(parseViewInput({ name: "X", sections: [sec({ tall: true })] }, "fr")?.sections[0]).toEqual(sec({ tall: true }));
		expect(parseViewInput({ name: "X", sections: [sec({ tall: "yes" })] }, "fr")?.sections[0]).toEqual(sec({}));
		expect(readSections([sec({ tall: true })]).sections[0].tall).toBe(true);
	});
});

describe("ViewStore.createMany", () => {
	test("crée tout en une écriture", () => {
		const file = path.join(tmp(), "view.json");
		const s = new ViewStore(file);
		let calls = 0;
		s.onChange(() => calls++);
		const created = s.createMany([input(), input(), input()], "fr");
		expect(Array.isArray(created) && created.length).toBe(3);
		expect(calls).toBe(1);
		expect(new ViewStore(file).list("fr")).toHaveLength(4);
	});

	test("refuse tout si ça dépasse 10", () => {
		const s = new ViewStore();
		for (let i = 0; i < MAX_VIEWS - 1; i++) s.create(input(), "fr");
		expect(s.list("fr")).toHaveLength(MAX_VIEWS);
		const t = new ViewStore();
		for (let i = 0; i < MAX_VIEWS - 2; i++) t.create(input(), "fr");
		expect(t.createMany([input(), input()], "fr")).toEqual({ free: 1 });
		expect(t.list("fr")).toHaveLength(MAX_VIEWS - 1);
	});
});

describe("style des cases et habillage", () => {
	const sec = (items: any[]) => ({ id: "s", title: "S", width: "half", items });
	const health = (display: unknown) => ({ id: "h", kind: "vital", ref: "health", size: 1, display });

	test("style connu gardé, clés en trop retirées", () => {
		const v = parseViewInput({ name: "A", sections: [sec([health({ style: "ring", color: "x" })])] }, "fr");
		expect(v?.sections[0].items[0]).toEqual({ id: "h", kind: "vital", ref: "health", size: 1, display: { style: "ring" } });
	});

	test.each([
		["style inconnu", health({ style: "hologram" })],
		["style carte (défaut)", health({ style: "card" })],
		["display pas un objet", health("ring")],
		["style graphique sur une info (nom du vaisseau)", { id: "h", kind: "ship_info", ref: "name", size: 1, display: { style: "ring" } }],
		["display sur un bouton", { id: "h", kind: "ship_function", ref: "gear", size: 1, display: { style: "ring" } }],
	])("%s : display retiré sans refuser la vue", (_n, item) => {
		const v = parseViewInput({ name: "A", sections: [sec([item])] }, "fr");
		expect(v).toBeDefined();
		expect(v!.sections[0].items[0]).not.toHaveProperty("display");
	});

	test("habillage HUD gardé ; standard ou valeur inconnue → absent", () => {
		expect(parseViewInput({ name: "A", sections: [], look: "hud" }, "fr")).toEqual({ name: "A", sections: [], look: "hud" });
		for (const look of ["standard", "neon", 1]) expect(parseViewInput({ name: "A", sections: [], look }, "fr")).not.toHaveProperty("look");
	});

	test("info perso / vaisseau : chiffre accepté", () => {
		const v = parseViewInput({ name: "A", sections: [sec([{ id: "n", kind: "ship_info", ref: "name", size: 1, display: { style: "number" } }])] }, "fr");
		expect(v!.sections[0].items[0]).toHaveProperty("display", { style: "number" });
	});

	test("aller-retour identique (ordre des clés)", () => {
		const v = { name: "A", sections: [sec([health({ style: "vsegments" }), { id: "s2", kind: "instrument", ref: "speed", size: 2, display: { style: "number" } }])], look: "hud" };
		expect(JSON.stringify(parseViewInput(v, "fr"))).toBe(JSON.stringify(v));
	});

	test("ViewStore : relu depuis le fichier à l'identique, sans .bak", () => {
		const file = path.join(tmp(), "view.json");
		const s = new ViewStore(file);
		const created = s.create({ name: "HUD", sections: [sec([health({ style: "arc" })])] as any, look: "hud" }, "fr");
		const again = new ViewStore(file);
		expect(again.list("fr")).toEqual(s.list("fr"));
		expect(again.list("fr").find((v) => v.id === (created as any).id)).toMatchObject({ look: "hud" });
		expect(fs.existsSync(`${file}.bak`)).toBe(false);
	});

	test("readSections : case au style inconnu gardée, rien d'ignoré", () => {
		const r = readSections([sec([health({ style: "hologram" })])]);
		expect(r.skipped).toEqual([]);
		expect(r.sections[0].items[0]).toEqual({ id: "h", kind: "vital", ref: "health", size: 1 });
	});
});

describe("nom affiché et taille S", () => {
	const sec = (items: any[]) => ({ id: "s", title: "S", width: "half", items });
	const one = (item: any) => parseViewInput({ name: "A", sections: [sec([item])] }, "fr")?.sections[0].items[0];

	test("nom gardé (emoji, autre langue), espaces retirés, ordre des clés", () => {
		const item = one({ id: "h", kind: "vital", ref: "hunger", size: 1, display: { style: "ring" }, label: "  🍖 Голод  " });
		expect(JSON.stringify(item)).toBe(JSON.stringify({ id: "h", kind: "vital", ref: "hunger", size: 1, label: "🍖 Голод", display: { style: "ring" } }));
	});
	test("nom vide, pas un texte ou trop long → absent (24 caractères max, emoji = 1)", () => {
		expect(one({ id: "h", kind: "vital", ref: "health", size: 1, label: "   " })).not.toHaveProperty("label");
		expect(one({ id: "h", kind: "vital", ref: "health", size: 1, label: 3 })).not.toHaveProperty("label");
		expect(one({ id: "h", kind: "vital", ref: "health", size: 1, label: "🍖".repeat(24) })).toHaveProperty("label", "🍖".repeat(24));
		expect(one({ id: "h", kind: "vital", ref: "health", size: 1, label: "x".repeat(25) })).toHaveProperty("label", "x".repeat(24));
	});
	test("nom sur un bouton gardé ; ignoré sur morse et Mon vaisseau", () => {
		expect(one({ id: "g", kind: "ship_function", ref: "gear", size: 1, label: "🛬" })).toHaveProperty("label", "🛬");
		expect(one({ id: "c", kind: "ship_card", size: 2, label: "x" })).not.toHaveProperty("label");
	});
	test("taille S acceptée ; ramenée à 1 pour voyants et Mon vaisseau ; 3 refusée", () => {
		expect(one({ id: "h", kind: "vital", ref: "health", size: 0.5 })).toHaveProperty("size", 0.5);
		expect(one({ id: "a", kind: "annunciators", size: 0.5 })).toHaveProperty("size", 1);
		expect(one({ id: "h", kind: "vital", ref: "health", size: 5 })).toBeUndefined();
	});
	test("taille ¼ acceptée (boutons, valeurs, case vide) ; ramenée à 1 pour voyants et Mon vaisseau", () => {
		expect(one({ id: "h", kind: "vital", ref: "health", size: 0.25 })).toHaveProperty("size", 0.25);
		expect(one({ id: "g", kind: "ship_function", ref: "gear", size: 0.25 })).toHaveProperty("size", 0.25);
		expect(one({ id: "a", kind: "annunciators", size: 0.25 })).toHaveProperty("size", 1);
		expect(one({ id: "h", kind: "vital", ref: "health", size: 0.75 })).toBeUndefined();
	});
	test("emplacements : 1, 2, 3, 4, 6, 8 (size 0.5 à 4) acceptés", () => {
		for (const size of [0.5, 1, 1.5, 2, 3, 4]) expect(one({ id: "h", kind: "vital", ref: "health", size })).toHaveProperty("size", size);
	});
	test("vue ancienne (sans label, look, display ni S) : inchangée", () => {
		const v = input();
		expect(parseViewInput(v, "fr")).toEqual(v);
	});
});

describe("longueur du solde", () => {
	const sec = (items: any[]) => ({ id: "s", title: "S", width: "half", items });
	const one = (item: any) => parseViewInput({ name: "A", sections: [sec([item])] }, "fr")?.sections[0].items[0];
	test("solde : longueur complète gardée, seule ou avec un style", () => {
		expect(one({ id: "m", kind: "vital", ref: "balance", size: 1, display: { length: "full" } })).toHaveProperty("display", { length: "full" });
		expect(JSON.stringify(one({ id: "m", kind: "vital", ref: "balance", size: 1, display: { length: "full", style: "number" } })?.display)).toBe('{"style":"number","length":"full"}');
	});
	test("longueur ignorée hors solde, ou valeur inconnue", () => {
		expect(one({ id: "h", kind: "vital", ref: "health", size: 1, display: { length: "full" } })).not.toHaveProperty("display");
		expect(one({ id: "m", kind: "vital", ref: "balance", size: 1, display: { length: "compact" } })).not.toHaveProperty("display");
	});
	test("échelles du solde : k et m gardées", () => {
		expect(one({ id: "m", kind: "vital", ref: "balance", size: 1, display: { length: "k" } })).toHaveProperty("display", { length: "k" });
		expect(one({ id: "m", kind: "vital", ref: "balance", size: 1, display: { length: "m" } })).toHaveProperty("display", { length: "m" });
	});
});

describe("placement libre : colonne de départ", () => {
	const one = (it: object) =>
		parseViewInput({ name: "V", sections: [{ id: "s", title: "S", width: "full", items: [{ id: "a", kind: "ship_function", ref: "gear", size: 1, ...it }] }] }, "fr")?.sections[0]!.items[0];
	test("colonne 1 à 16 gardée, juste après la taille", () => {
		expect(one({ col: 7 })).toEqual({ id: "a", kind: "ship_function", ref: "gear", size: 1, col: 7 });
		expect(Object.keys(one({ label: "x", col: 16 })!)).toEqual(["id", "kind", "ref", "size", "col", "label"]);
	});
	test("colonne invalide ignorée, case gardée", () => {
		for (const col of [0, 17, 2.5, "3", null]) expect(one({ col })).toEqual({ id: "a", kind: "ship_function", ref: "gear", size: 1 });
	});
	test("case vide (version de test) : retirée à la lecture tolérante", () => {
		const r = readSections([{ id: "s", title: "S", width: "full", items: [{ id: "v", kind: "spacer", size: 1 }] }]);
		expect(r.sections[0]!.items).toEqual([]);
		expect(r.skipped).toEqual([{ section: "S", kind: "spacer", reason: "unknown_kind" }]);
	});
});
