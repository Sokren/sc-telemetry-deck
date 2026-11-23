import fs from "node:fs";
import type { Lang } from "../catalog/labels.js";
import { DISPLAY_VALUES } from "../display/values.js";
import { morseLight, type MorseLight } from "../morse/lights.js";
import { SHIP_FUNCTION_IDS } from "../ship/functions.js";
import { INSTRUMENTS } from "./panels.js";

/** « Ma vue » : vues nommées (un onglet chacune), faites de sections contenant des cases, enregistrées dans `view.json`. */
export const ITEM_KINDS = [
	"vital",
	"instrument",
	"annunciators",
	"ship_info",
	"character_info",
	"ship_function",
	"action",
	"ship_card",
	"morse",
	"morse_free",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * Réglages d'une case morse : `morse` = message enregistré (`text`), `morse_free` = message tapé sur le moment (pas de
 * `text` enregistré). Mêmes bornes que la touche Morse Code.
 */
export type MorseItemSettings = { text?: string; light: MorseLight; unitMs: number; repeat: number };

/** Styles d'affichage d'une case de valeur (`card` = carte, le défaut, jamais enregistré). */
export const ITEM_STYLES = ["card", "ring", "arc", "bar", "vbar", "segments", "vsegments", "number"] as const;
export type ItemStyle = (typeof ITEM_STYLES)[number];
/** Habillages d'une vue (`standard` = le défaut, jamais enregistré). */
export const VIEW_LOOKS = ["standard", "hud"] as const;
export type ViewLook = (typeof VIEW_LOOKS)[number];
/** Types de case qui acceptent un style. */
export const STYLED_KINDS: readonly ItemKind[] = ["vital", "instrument", "character_info", "ship_info"];
export type ItemDisplay = { style: Exclude<ItemStyle, "card"> };

export type ViewItem = { id: string; kind: ItemKind; ref?: string; size: 1 | 2; settings?: MorseItemSettings; display?: ItemDisplay };
export type ViewSection = { id: string; title: string; width: "half" | "full"; items: ViewItem[] };
export type Layout = { sections: ViewSection[] };
export type ViewInput = { name: string; sections: ViewSection[]; look?: "hud" };
export type NamedView = { id: string } & ViewInput;

export const MAX_VIEWS = 10;
export const MAX_SECTIONS = 20;
export const MAX_ITEMS = 40;
export const MAX_TITLE = 40;
export const MAX_NAME = 24;
export const MAIN_ID = "main";
export const MAX_MORSE_TEXT = 60;

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const ACTION = /^[a-z0-9_]{1,64}$/;

/** Valeurs permises de `ref` pour les types fermés (`annunciators` n'en a pas, `action` est vérifié à part). */
const REFS: Partial<Record<ItemKind, readonly string[]>> = {
	vital: DISPLAY_VALUES,
	instrument: INSTRUMENTS,
	ship_info: ["name", "master_mode", "landed"],
	character_info: ["position", "role", "seat"],
	ship_function: SHIP_FUNCTION_IDS,
};

const TITLES: Record<Lang, [string, string, string]> = {
	fr: ["Survie", "Vol", "Commandes du vaisseau"],
	en: ["Survival", "Flight", "Ship controls"],
};
const DEFAULT_NAME: Record<Lang, string> = { fr: "Ma vue", en: "My view" };
const EMPTY_NAME: Record<Lang, string> = { fr: "Vue", en: "View" };

/** Disposition de la vue du premier lancement, titres dans la langue de la page. */
export function defaultLayout(lang: Lang): Layout {
	const [survival, flight, controls] = TITLES[lang];
	return {
		sections: [
			{
				id: "survival",
				title: survival,
				width: "half",
				items: [
					{ id: "oxygen", kind: "vital", ref: "oxygen", size: 1 },
					{ id: "health", kind: "vital", ref: "health", size: 1 },
					{ id: "hunger", kind: "vital", ref: "hunger", size: 1 },
					{ id: "body_temperature", kind: "vital", ref: "body_temperature", size: 1 },
				],
			},
			{
				id: "flight",
				title: flight,
				width: "half",
				items: [
					{ id: "speed", kind: "instrument", ref: "speed", size: 2 },
					{ id: "hydrogen", kind: "instrument", ref: "hydrogen", size: 1 },
					{ id: "quantum", kind: "instrument", ref: "quantum", size: 1 },
				],
			},
			{
				id: "controls",
				title: controls,
				width: "full",
				items: [
					{ id: "gear", kind: "ship_function", ref: "gear", size: 1 },
					{ id: "lights", kind: "ship_function", ref: "lights", size: 1 },
					{ id: "annunciators", kind: "annunciators", size: 2 },
				],
			},
		],
	};
}

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : undefined);

const intIn = (x: unknown, min: number, max: number): number | undefined =>
	typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : undefined;

/** Réglages morse ; `withText` : message enregistré obligatoire (1 à 60 caractères, sans espaces autour). */
function parseMorseSettings(x: unknown, withText: boolean): MorseItemSettings | undefined {
	const o = obj(x);
	if (!o) return undefined;
	if (o.light !== "flashlight" && o.light !== "ship_lights") return undefined;
	const unitMs = intIn(o.unitMs, 100, 2000);
	const repeat = intIn(o.repeat, 1, 10);
	if (unitMs === undefined || repeat === undefined) return undefined;
	const settings: MorseItemSettings = { light: morseLight(o.light), unitMs, repeat };
	if (!withText) return settings;
	const text = typeof o.text === "string" ? o.text.trim() : "";
	if (!text || text.length > MAX_MORSE_TEXT) return undefined;
	return { text, ...settings };
}

/** Style d'une case : connu, autre que la carte, sur un type qui l'accepte ; sinon rien (la case reste valide). */
function parseDisplay(kind: ItemKind, x: unknown): ItemDisplay | undefined {
	const style = obj(x)?.style;
	if (!STYLED_KINDS.includes(kind) || style === "card" || !(ITEM_STYLES as readonly unknown[]).includes(style)) return undefined;
	return { style: style as ItemDisplay["style"] };
}

/** `look` normalisé : seul `hud` est gardé (le défaut et les valeurs inconnues sont omis). */
const lookOf = (x: unknown): { look?: "hud" } => (x === "hud" ? { look: "hud" } : {});

function parseItem(x: unknown): ViewItem | undefined {
	const o = obj(x);
	if (!o || typeof o.id !== "string" || !ID.test(o.id)) return undefined;
	if (!(ITEM_KINDS as readonly unknown[]).includes(o.kind)) return undefined;
	if (o.size !== 1 && o.size !== 2) return undefined;
	const kind = o.kind as ItemKind;
	// Cases sans `ref` : voyants, encart « Mon vaisseau ».
	if (kind === "annunciators" || kind === "ship_card") return { id: o.id, kind, size: o.size };
	if (kind === "morse" || kind === "morse_free") {
		const settings = parseMorseSettings(o.settings, kind === "morse");
		return settings ? { id: o.id, kind, size: o.size, settings } : undefined;
	}
	if (typeof o.ref !== "string") return undefined;
	if (kind === "action") {
		if (!ACTION.test(o.ref)) return undefined;
	} else if (!REFS[kind]?.includes(o.ref)) return undefined;
	const display = parseDisplay(kind, o.display);
	return { id: o.id, kind, ref: o.ref, size: o.size, ...(display ? { display } : {}) };
}

function parseSection(x: unknown): ViewSection | undefined {
	const o = obj(x);
	if (!o || typeof o.id !== "string" || !ID.test(o.id)) return undefined;
	if (o.width !== "half" && o.width !== "full") return undefined;
	if (!Array.isArray(o.items) || o.items.length > MAX_ITEMS) return undefined;
	const items = o.items.map(parseItem);
	if (items.some((i) => !i)) return undefined;
	const title = (typeof o.title === "string" ? o.title.trim() : "").slice(0, MAX_TITLE).trim() || "Section";
	return { id: o.id, title, width: o.width, items: items as ViewItem[] };
}

/** Sections validées (ids de sections et de cases uniques dans la vue), ou `undefined`. */
function parseSections(x: unknown): ViewSection[] | undefined {
	if (!Array.isArray(x) || x.length > MAX_SECTIONS) return undefined;
	const parsed = x.map(parseSection);
	if (parsed.some((s) => !s)) return undefined;
	const sections = parsed as ViewSection[];
	const sectionIds = sections.map((s) => s.id);
	const itemIds = sections.flatMap((s) => s.items.map((i) => i.id));
	if (new Set(sectionIds).size !== sectionIds.length || new Set(itemIds).size !== itemIds.length) return undefined;
	return sections;
}

/** Corps de création / modification d'une vue, normalisé (nom ≤ 24, vide → « Vue » / « View »), ou `undefined`. Sans `sections` : vue vide. */
export function parseViewInput(x: unknown, lang: Lang): ViewInput | undefined {
	const o = obj(x);
	if (!o || (o.name !== undefined && typeof o.name !== "string")) return undefined;
	const sections = o.sections === undefined ? [] : parseSections(o.sections);
	if (!sections) return undefined;
	return { name: normalizeViewName(o.name, lang), sections, ...lookOf(o.look) };
}

/** Nom de vue normalisé : ≤ 24 caractères sans espaces autour ; vide ou absent → « Vue » / « View ». */
export function normalizeViewName(x: unknown, lang: Lang): string {
	return (typeof x === "string" ? x : "").trim().slice(0, MAX_NAME).trim() || EMPTY_NAME[lang];
}

export type SkipReason =
	| "unknown_kind"
	| "unknown_ref"
	| "invalid_item"
	| "duplicate_id"
	| "too_many_items"
	| "too_many_sections"
	| "invalid_section";
/** Case ou section retirée à la lecture tolérante ; `section` = titre de la section quand il est lisible. */
export type Skipped = { section?: string; kind?: string; ref?: string; reason: SkipReason };

/** Pourquoi `parseItem` refuse une case (appelé seulement quand elle est refusée). */
function itemProblem(o: Obj | undefined): SkipReason {
	if (!o) return "invalid_item";
	if (!(ITEM_KINDS as readonly unknown[]).includes(o.kind)) return "unknown_kind";
	const kind = o.kind as ItemKind;
	if (typeof o.ref === "string" && (kind === "action" ? !ACTION.test(o.ref) : !!REFS[kind] && !REFS[kind]!.includes(o.ref))) return "unknown_ref";
	return "invalid_item";
}

/**
 * Sections lues avec tolérance : une case ou une section invalide (type ou constante inconnus de cette version,
 * constante retirée après une mise à jour) est retirée et rapportée, le reste est gardé.
 */
export function readSections(x: unknown): { sections: ViewSection[]; skipped: Skipped[] } {
	const sections: ViewSection[] = [];
	const skipped: Skipped[] = [];
	if (!Array.isArray(x)) return { sections, skipped };
	const sectionIds = new Set<string>();
	const itemIds = new Set<string>();
	for (const raw of x) {
		const o = obj(raw);
		const title = typeof o?.title === "string" && o.title.trim() ? o.title.trim().slice(0, MAX_TITLE).trim() : undefined;
		const where = title ? { section: title } : {};
		if (sections.length >= MAX_SECTIONS) {
			skipped.push({ ...where, reason: "too_many_sections" });
			continue;
		}
		const section = o && parseSection({ ...o, items: [] });
		if (!section) {
			skipped.push({ ...where, reason: "invalid_section" });
			continue;
		}
		if (sectionIds.has(section.id)) {
			skipped.push({ ...where, reason: "duplicate_id" });
			continue;
		}
		sectionIds.add(section.id);
		for (const rawItem of Array.isArray(o!.items) ? o!.items : []) {
			const io = obj(rawItem);
			const what = {
				...where,
				...(typeof io?.kind === "string" ? { kind: io.kind } : {}),
				...(typeof io?.ref === "string" ? { ref: io.ref } : {}),
			};
			const item = parseItem(rawItem);
			if (!item) skipped.push({ ...what, reason: itemProblem(io) });
			else if (itemIds.has(item.id)) skipped.push({ ...what, reason: "duplicate_id" });
			else if (section.items.length >= MAX_ITEMS) skipped.push({ ...what, reason: "too_many_items" });
			else {
				itemIds.add(item.id);
				section.items.push(item);
			}
		}
		sections.push(section);
	}
	return { sections, skipped };
}

const looseSections = (x: unknown): ViewSection[] => readSections(x).sections;

/**
 * Contenu d'un `view.json` : version 2 (liste de vues) ou version 1 (une seule vue sans nom → ses sections).
 * `lossy` : quelque chose a été retiré (l'ancien fichier est alors gardé en `.bak`). `undefined` : illisible.
 */
function parseFile(x: unknown): ({ views: NamedView[] } | { legacy: ViewSection[] }) & { lossy: boolean } | undefined {
	const o = obj(x);
	if (o?.version === 1 && Array.isArray(o.sections)) {
		const legacy = looseSections(o.sections);
		return { legacy, lossy: JSON.stringify(legacy) !== JSON.stringify(o.sections) };
	}
	if (o?.version !== 2 || !Array.isArray(o.views)) return undefined;
	const views: NamedView[] = [];
	for (const v of o.views) {
		const vo = obj(v);
		if (!vo || typeof vo.id !== "string" || !ID.test(vo.id) || typeof vo.name !== "string" || views.length >= MAX_VIEWS) continue;
		if (views.some((w) => w.id === vo.id)) continue;
		const name = vo.name.trim().slice(0, MAX_NAME).trim() || EMPTY_NAME.fr;
		views.push({ id: vo.id, name, sections: looseSections(vo.sections), ...lookOf(vo.look) });
	}
	if (!views.length) return undefined;
	return { views, lossy: JSON.stringify(views) !== JSON.stringify(o.views) };
}

/**
 * Vues enregistrées dans un fichier (ou en mémoire sans fichier). Tant que rien n'est écrit en version 2,
 * la vue `main` porte le nom par défaut dans la langue de la page ; la première écriture le fige.
 * Fichier illisible → `.bak` + vue par défaut.
 */
export class ViewStore {
	#views: NamedView[] | undefined;
	#legacy: ViewSection[] | undefined;
	readonly #listeners = new Set<() => void>();

	constructor(private readonly file?: string) {
		if (!file || !fs.existsSync(file)) return;
		const text = fs.readFileSync(file, "utf-8");
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = undefined;
		}
		const content = parseFile(parsed);
		if (!content || content.lossy) fs.writeFileSync(`${file}.bak`, text);
		if (!content) return;
		if ("views" in content) this.#views = content.views;
		else this.#legacy = content.legacy;
	}

	/** Vues dans l'ordre de création. */
	list(lang: Lang): NamedView[] {
		return this.#views ?? [this.#initial(lang)];
	}

	create(input: ViewInput, lang: Lang): NamedView | "too_many" {
		const views = this.#materialize(lang);
		if (views.length >= MAX_VIEWS) return "too_many";
		const view = { id: this.#newId(views), ...input };
		views.push(view);
		this.#save();
		return view;
	}

	/** Plusieurs vues créées d'un coup (import) ; refus total s'il n'y a pas la place, avec le nombre de places libres. */
	createMany(inputs: ViewInput[], lang: Lang): NamedView[] | { free: number } {
		const free = MAX_VIEWS - this.list(lang).length;
		if (inputs.length > free) return { free: Math.max(0, free) };
		const views = this.#materialize(lang);
		const created = inputs.map((input) => {
			const view = { id: this.#newId(views), ...input };
			views.push(view);
			return view;
		});
		this.#save();
		return created;
	}

	update(id: string, input: ViewInput, lang: Lang): NamedView | "unknown" {
		if (!this.list(lang).some((v) => v.id === id)) return "unknown";
		const views = this.#materialize(lang);
		const view = { id, ...input };
		views[views.findIndex((v) => v.id === id)] = view;
		this.#save();
		return view;
	}

	remove(id: string, lang: Lang): true | "unknown" | "last" {
		const current = this.list(lang);
		if (!current.some((v) => v.id === id)) return "unknown";
		if (current.length === 1) return "last";
		const views = this.#materialize(lang);
		views.splice(views.findIndex((v) => v.id === id), 1);
		this.#save();
		return true;
	}

	onChange(fn: () => void): () => void {
		this.#listeners.add(fn);
		return () => this.#listeners.delete(fn);
	}

	#initial(lang: Lang): NamedView {
		return { id: MAIN_ID, name: DEFAULT_NAME[lang], sections: this.#legacy ?? defaultLayout(lang).sections };
	}

	/** Fige la liste (nom et titres par défaut dans la langue de cette requête) avant une écriture. */
	#materialize(lang: Lang): NamedView[] {
		this.#views ??= [this.#initial(lang)];
		this.#legacy = undefined;
		return this.#views;
	}

	#newId(views: NamedView[]): string {
		const taken = new Set(views.map((v) => v.id));
		for (;;) {
			const id = `v${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
			if (!taken.has(id)) return id;
		}
	}

	#save(): void {
		if (this.file) fs.writeFileSync(this.file, `${JSON.stringify({ version: 2, views: this.#views }, null, "\t")}\n`);
		for (const fn of this.#listeners) fn();
	}
}
