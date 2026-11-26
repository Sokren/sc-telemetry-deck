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
export const ITEM_STYLES = ["card", "ring", "arc", "bar", "vbar", "segments", "vsegments", "number", "line", "tape", "switch", "slide", "hold"] as const;
export type ItemStyle = (typeof ITEM_STYLES)[number];
/** Habillages d'une vue (`standard` = le défaut, jamais enregistré). */
export const VIEW_LOOKS = ["standard", "hud", "cockpit"] as const;
/** Habillage enregistré (le défaut `standard` ne l'est jamais). */
export type SavedLook = Exclude<(typeof VIEW_LOOKS)[number], "standard">;
export type ViewLook = (typeof VIEW_LOOKS)[number];
/** Types de case qui acceptent un style. */
export const STYLED_KINDS: readonly ItemKind[] = ["vital", "instrument", "character_info", "ship_info", "ship_function", "action"];
const GAUGE_STYLES = ["ring", "arc", "bar", "vbar", "segments", "vsegments", "number", "line"] as const;

/**
 * Styles permis (hors carte, le défaut) pour un type de case : jauges sur les valeurs, chiffre seulement sur les infos
 * (du texte), règle sur le cap, interrupteur sur une fonction vaisseau, glisser / maintenir sur une action ; aucun
 * sur le voyant boost.
 */
export function stylesAllowed(kind: ItemKind, ref?: unknown): readonly Exclude<ItemStyle, "card">[] {
	switch (kind) {
		case "vital":
			return GAUGE_STYLES;
		case "instrument":
			return ref === "heading" ? [...GAUGE_STYLES, "tape"] : GAUGE_STYLES;
		case "character_info":
			return ["number", "line"];
		case "ship_info":
			return ref === "boost" ? [] : ["number", "line"];
		case "ship_function":
			return ["switch"];
		case "action":
			return ["slide", "hold"];
		default:
			return [];
	}
}
/** Échelle du solde : `full` tous les chiffres, `k` en milliers, `m` en millions ; absent = compact automatique. */
export const MONEY_LENGTHS = ["full", "k", "m"] as const;
/** Réglages d'affichage d'une case : style (jauges, chiffre) et échelle du solde. */
export type ItemDisplay = { style?: Exclude<ItemStyle, "card">; length?: (typeof MONEY_LENGTHS)[number] };

/**
 * Largeur d'une case, comptée en cases 1× : un emplacement = 0.25. Une section pleine largeur fait 16 emplacements
 * (size 4), une demi-section ou un tiers 8 (size 2) ; une case plus large que sa section en prend toute la largeur.
 */
export const ITEM_SIZES = [0.25, 0.5, 1, 1.5, 2, 3, 4] as const;
export type ItemSize = (typeof ITEM_SIZES)[number];
export const MAX_LABEL = 24;
/** Cases sans nom affiché modifiable (message morse, encart « Mon vaisseau »). */
const NO_LABEL: readonly ItemKind[] = ["morse", "morse_free", "ship_card"];
/** Cases jamais plus petites que 1× (illisibles en S). */
const MIN_SIZE_1: readonly ItemKind[] = ["annunciators", "ship_card"];

export type ViewItem = {
	id: string;
	kind: ItemKind;
	ref?: string;
	size: ItemSize;
	/**
	 * Colonne de départ (1 à 16, comptée en emplacements) : la case commence là, en laissant vides les emplacements
	 * d'avant sur sa ligne. Absente = juste après la case précédente.
	 */
	col?: number;
	settings?: MorseItemSettings;
	label?: string;
	display?: ItemDisplay;
};
/** Largeur d'une section : pleine, demie ou tiers d'écran. */
export const SECTION_WIDTHS = ["full", "half", "third"] as const;
export type SectionWidth = (typeof SECTION_WIDTHS)[number];
/** `tall` (seulement s'il est vrai) : section haute, sur deux lignes de la grille (grand écran). */
export type ViewSection = { id: string; title: string; width: SectionWidth; tall?: true; items: ViewItem[] };
export type Layout = { sections: ViewSection[] };
export type ViewInput = { name: string; sections: ViewSection[]; look?: SavedLook };
/** `plugin` : dossier du plugin qui a créé la vue (il peut la modifier ou la supprimer) ; absent = vue du joueur. */
export type NamedView = { id: string; plugin?: string } & ViewInput;

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
	ship_info: ["name", "master_mode", "landed", "boost"],
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
function parseDisplay(kind: ItemKind, ref: unknown, x: unknown): ItemDisplay | undefined {
	const o = obj(x);
	if (!o) return undefined;
	const display: ItemDisplay = {};
	const style = o.style;
	if ((stylesAllowed(kind, ref) as readonly unknown[]).includes(style)) display.style = style as ItemDisplay["style"];
	if (kind === "vital" && ref === "balance" && (MONEY_LENGTHS as readonly unknown[]).includes(o.length)) display.length = o.length as ItemDisplay["length"];
	return Object.keys(display).length ? display : undefined;
}

/** `look` normalisé : seul `hud` est gardé (le défaut et les valeurs inconnues sont omis). */
const lookOf = (x: unknown): { look?: SavedLook } => (x === "hud" || x === "cockpit" ? { look: x } : {});

/** Nom affiché : 1 à 24 caractères (un emoji compte pour un), espaces autour retirés ; sinon rien. */
function parseLabel(kind: ItemKind, x: unknown): { label?: string } {
	if (NO_LABEL.includes(kind) || typeof x !== "string") return {};
	const label = [...x.trim()].slice(0, MAX_LABEL).join("").trim();
	return label ? { label } : {};
}

/** Clés optionnelles d'une case, dans l'ordre enregistré (après `size` / `settings`). */
function extras(kind: ItemKind, o: Obj): { label?: string; display?: ItemDisplay } {
	const display = parseDisplay(kind, o.ref, o.display);
	return { ...parseLabel(kind, o.label), ...(display ? { display } : {}) };
}

/** Colonne de départ gardée si c'est un entier de 1 à 16 (ligne pleine), sinon ignorée. */
const colOf = (x: unknown): { col?: number } => (Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 16 ? { col: x as number } : {});

function parseItem(x: unknown): ViewItem | undefined {
	const o = obj(x);
	if (!o || typeof o.id !== "string" || !ID.test(o.id)) return undefined;
	if (!(ITEM_KINDS as readonly unknown[]).includes(o.kind)) return undefined;
	if (!(ITEM_SIZES as readonly unknown[]).includes(o.size)) return undefined;
	const kind = o.kind as ItemKind;
	const size = ((o.size as number) < 1 && MIN_SIZE_1.includes(kind) ? 1 : o.size) as ItemSize;
	const col = colOf(o.col);
	// Cases sans `ref` : voyants, encart « Mon vaisseau ».
	if (kind === "annunciators" || kind === "ship_card") return { id: o.id, kind, size, ...col, ...extras(kind, o) };
	if (kind === "morse" || kind === "morse_free") {
		const settings = parseMorseSettings(o.settings, kind === "morse");
		return settings ? { id: o.id, kind, size, ...col, settings } : undefined;
	}
	if (typeof o.ref !== "string") return undefined;
	if (kind === "action") {
		if (!ACTION.test(o.ref)) return undefined;
	} else if (!REFS[kind]?.includes(o.ref)) return undefined;
	return { id: o.id, kind, ref: o.ref, size, ...col, ...extras(kind, o) };
}

function parseSection(x: unknown): ViewSection | undefined {
	const o = obj(x);
	if (!o || typeof o.id !== "string" || !ID.test(o.id)) return undefined;
	if (!(SECTION_WIDTHS as readonly unknown[]).includes(o.width)) return undefined;
	if (!Array.isArray(o.items) || o.items.length > MAX_ITEMS) return undefined;
	const items = o.items.map(parseItem);
	if (items.some((i) => !i)) return undefined;
	const title = (typeof o.title === "string" ? o.title.trim() : "").slice(0, MAX_TITLE).trim() || "Section";
	return { id: o.id, title, width: o.width as SectionWidth, ...(o.tall === true ? { tall: true as const } : {}), items: items as ViewItem[] };
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
		const plugin = typeof vo.plugin === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(vo.plugin) ? { plugin: vo.plugin } : {};
		views.push({ id: vo.id, ...plugin, name, sections: looseSections(vo.sections), ...lookOf(vo.look) });
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

	/** `plugin` : la vue appartient à ce plugin. */
	create(input: ViewInput, lang: Lang, plugin?: string): NamedView | "too_many" {
		const views = this.#materialize(lang);
		if (views.length >= MAX_VIEWS) return "too_many";
		const view: NamedView = { id: this.#newId(views), ...(plugin ? { plugin } : {}), ...input };
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
		const i = views.findIndex((v) => v.id === id);
		// Le propriétaire reste celui d'origine, quel que soit celui qui modifie.
		const owner = views[i].plugin;
		const view: NamedView = { id, ...(owner ? { plugin: owner } : {}), ...input };
		views[i] = view;
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
