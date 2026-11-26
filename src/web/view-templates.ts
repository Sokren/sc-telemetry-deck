import type { Lang } from "../catalog/labels.js";
import type { ItemDisplay, ItemKind, ItemSize, ViewInput, ViewItem, ViewSection } from "./view.js";

/**
 * Modèles de vues proposés au « + » d'une nouvelle vue. Un modèle n'est qu'un point de départ : la vue créée est une
 * vue « Ma vue » normale, modifiable comme les autres. Textes en français et en anglais selon la langue de la page.
 */
export type TemplateId = "xeneon_pilot" | "instrument_panel";
export type ViewTemplate = {
	id: TemplateId;
	/** Taille d'écran conseillée (px). */
	size: { width: number; height: number };
	build(lang: Lang): ViewInput;
};
export type TemplateSummary = {
	id: TemplateId;
	name: string;
	description: string;
	size: { width: number; height: number };
	view: ViewInput;
};

type Text = Record<Lang, string>;

const item = (id: string, kind: ItemKind, ref: string | undefined, size: ItemSize, style?: ItemDisplay["style"], col?: number): ViewItem => ({
	id,
	kind,
	...(ref !== undefined ? { ref } : {}),
	size,
	...(col !== undefined ? { col } : {}),
	...(style ? { display: { style } } : {}),
});
const section = (id: string, title: string, width: ViewSection["width"], items: ViewItem[], tall = false): ViewSection => ({
	id,
	title,
	width,
	...(tall ? { tall: true as const } : {}),
	items,
});

const XENEON_TEXT = {
	name: { fr: "Xeneon Edge – pilote", en: "Xeneon Edge – pilot" },
	description: {
		fr: "Poste de pilotage pour écran tactile large (Corsair Xeneon Edge) : vol, énergie, quantique, atterrissage et personnage.",
		en: "Pilot station for a wide touch screen (Corsair Xeneon Edge): flight, power, quantum, landing and character.",
	},
	ship: { fr: "Vaisseau", en: "Ship" },
	flight: { fr: "Vol · IFCS", en: "Flight · IFCS" },
	energy: { fr: "Quantique · Énergie", en: "Quantum · Power" },
	aux: { fr: "Atterrissage · Aux", en: "Landing · Aux" },
	character: { fr: "Personnage", en: "Character" },
} satisfies Record<string, Text>;

/** Poste de pilotage 2560×720. */
function xeneonPilot(lang: Lang): ViewInput {
	const t = (k: keyof typeof XENEON_TEXT) => XENEON_TEXT[k][lang];
	return {
		name: t("name"),
		look: "cockpit",
		// Comme la maquette : barre Vaisseau en haut ; Vol et Quantique · Énergie en sections hautes ; Aux et
		// Personnage empilés dans la 3e colonne. Une ligne pleine = 4×, une ligne de tiers = 2×.
		sections: [
			section("ship", t("ship"), "full", [
				item("ship_name", "ship_info", "name", 0.5),
				item("decoys", "instrument", "decoys", 0.5, "line"),
				item("noise", "instrument", "noise", 0.5, "line"),
				item("heading", "instrument", "heading", 1, "tape"),
				item("boost_light", "ship_info", "boost", 0.5),
				item("annunciators", "annunciators", undefined, 1),
			]),
			section("flight", t("flight"), "third", [
				item("flight_ready", "action", "v_flightready", 2),
				// SCM / NAV centré (colonnes 3 à 6 sur 8) ; la suite repart en colonne 1.
				item("master_nav", "ship_function", "master_nav", 1, "switch", 3),
				item("decoupled", "ship_function", "decoupled", 0.5, undefined, 1),
				item("gsafe", "ship_function", "gsafe", 0.5),
				item("proximity", "ship_function", "proximity", 0.5),
				item("esp", "ship_function", "esp", 0.5),
				item("speed", "instrument", "speed", 0.5, "number"),
				item("radar_altitude", "instrument", "radar_altitude", 0.5, "number"),
				item("vertical_speed", "instrument", "vertical_speed", 0.5, "number"),
				item("g_force", "instrument", "g_force", 0.5, "number"),
			], true),
			section("energy", t("energy"), "third", [
				item("power_main", "ship_function", "power_main", 0.5),
				item("power_weapons", "ship_function", "power_weapons", 0.5),
				item("power_engines", "ship_function", "power_engines", 0.5),
				item("power_shields", "ship_function", "power_shields", 0.5),
				item("shields", "instrument", "shields", 2, "bar"),
				item("hull", "instrument", "hull", 2, "bar"),
				item("hydrogen", "instrument", "hydrogen", 2, "bar"),
				item("quantum", "instrument", "quantum", 2, "bar"),
				item("boost", "instrument", "boost", 2, "bar"),
				item("quantum_drive", "action", "v_toggle_qdrive_engagement", 2),
			], true),
			section("aux", t("aux"), "third", [
				item("gear", "ship_function", "gear", 0.5),
				item("vtol", "ship_function", "vtol", 0.5),
				item("atc", "action", "v_atc_request", 0.5),
				item("docking", "action", "v_toggle_docking_request", 0.5),
				item("lights", "ship_function", "lights", 0.5),
				item("night_vision", "ship_function", "night_vision", 0.5),
				item("ping", "action", "v_invoke_ping", 1),
				item("self_destruct", "action", "v_self_destruct", 1, "slide"),
				// Un vide (colonnes 5 et 6) entre l'autodestruction et l'éjection.
				item("eject", "action", "v_eject", 0.5, "hold", 7),
			]),
			section("character", t("character"), "third", [
				item("health", "vital", "health", 1, "bar"),
				item("oxygen", "vital", "oxygen", 1, "bar"),
				item("hunger", "vital", "hunger", 1, "bar"),
				item("thirst", "vital", "thirst", 1, "bar"),
				item("body_temperature", "vital", "body_temperature", 0.5, "number"),
				item("external_temperature", "vital", "external_temperature", 0.5, "number"),
				item("heart_rate", "vital", "heart_rate", 0.5, "number"),
				item("breathable", "vital", "breathable", 0.5),
			]),
		],
	};
}

const INSTRUMENT_TEXT = {
	name: { fr: "Instrument de bord", en: "Instrument panel" },
	description: {
		fr: "Vue intégrée « Instrument de bord » pour tablette : saut quantique, vaisseau, fonctions, personnage, mission et performances.",
		en: "Built-in « Instrument panel » view for a tablet: quantum travel, ship, functions, character, mission and performance.",
	},
	quantum: { fr: "Saut quantique", en: "Quantum travel" },
	ship: { fr: "Vaisseau", en: "Ship" },
	functions: { fr: "Fonctions", en: "Functions" },
	character: { fr: "Personnage", en: "Character" },
	mission: { fr: "Mission suivie", en: "Tracked mission" },
	perf: { fr: "Performances", en: "Performance" },
} satisfies Record<string, Text>;

/**
 * Vue de l'onglet fixe « Instrument de bord » (tablette 1280×800), habillage `instrument`. Une demi-section = 8
 * emplacements (taille 2), une pleine = 16 (taille 4). Pas de portes : le jeu n'envoie pas leur état.
 */
function instrumentPanel(lang: Lang): ViewInput {
	const t = (k: keyof typeof INSTRUMENT_TEXT) => INSTRUMENT_TEXT[k][lang];
	return {
		name: t("name"),
		look: "instrument",
		sections: [
			section("quantum", t("quantum"), "half", [item("quantum_card", "quantum_card", undefined, 2)]),
			section("ship", t("ship"), "half", [
				item("shields", "instrument", "shields", 1, "segments"),
				item("hull", "instrument", "hull", 1, "segments"),
				item("hydrogen", "instrument", "hydrogen", 1, "segments"),
				item("quantum", "instrument", "quantum", 1, "segments"),
				item("speed", "instrument", "speed", 0.5, "number"),
				item("radar_altitude", "instrument", "radar_altitude", 0.5, "number"),
				item("boost", "instrument", "boost", 1, "segments"),
				item("master_nav", "ship_function", "master_nav", 0.5, "switch"),
			]),
			section("functions", t("functions"), "full", [
				item("gear", "ship_function", "gear", 0.5),
				item("lights", "ship_function", "lights", 0.5),
				item("vtol", "ship_function", "vtol", 0.5),
				item("decoupled", "ship_function", "decoupled", 0.5),
				item("power_engines", "ship_function", "power_engines", 0.5),
				item("power_main", "ship_function", "power_main", 0.5),
				item("eject", "action", "v_eject", 1, "hold"),
			]),
			section("character", t("character"), "half", [
				item("health", "vital", "health", 1, "segments"),
				item("oxygen", "vital", "oxygen", 1, "segments"),
				item("hunger", "vital", "hunger", 1, "segments"),
				item("thirst", "vital", "thirst", 1, "segments"),
				item("crime_stat", "character_info", "crime_stat", 0.5),
				item("location", "character_info", "location", 1.5),
			]),
			section("mission", t("mission"), "half", [item("mission_card", "mission_card", undefined, 2)]),
			section("perf", t("perf"), "full", [
				item("fps", "game_info", "fps", 0.5, "line"),
				item("ping", "game_info", "ping", 0.5, "line"),
				item("gpu", "game_info", "gpu", 1, "line"),
				item("vram", "game_info", "vram", 1, "line"),
				item("shard", "game_info", "shard", 1, "line"),
			]),
		],
	};
}

export const VIEW_TEMPLATES: readonly ViewTemplate[] = [
	{ id: "xeneon_pilot", size: { width: 2560, height: 720 }, build: xeneonPilot },
	{ id: "instrument_panel", size: { width: 1280, height: 800 }, build: instrumentPanel },
];

const DESCRIPTIONS: Record<TemplateId, { name: Text; description: Text }> = {
	xeneon_pilot: { name: XENEON_TEXT.name, description: XENEON_TEXT.description },
	instrument_panel: { name: INSTRUMENT_TEXT.name, description: INSTRUMENT_TEXT.description },
};

export function templateById(id: unknown): ViewTemplate | undefined {
	return VIEW_TEMPLATES.find((t) => t.id === id);
}

/** Ce que l'API renvoie pour un modèle : nom, description, taille conseillée et contenu de la vue créée. */
export function templateSummary(t: ViewTemplate, lang: Lang): TemplateSummary {
	const d = DESCRIPTIONS[t.id];
	return { id: t.id, name: d.name[lang], description: d.description[lang], size: t.size, view: t.build(lang) };
}
