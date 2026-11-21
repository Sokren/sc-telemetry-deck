import type { Lang } from "../catalog/labels.js";
import type { CmReading, CmType, CountermeasureTracker, ShipSections } from "./countermeasures.js";
import { COLORS, type DisplayView } from "./format.js";
import en from "./labels.en.json" with { type: "json" };
import fr from "./labels.fr.json" with { type: "json" };
import { readFlight, shipModel } from "./flight.js";
import type { Level } from "./values.js";
import { readWeapons } from "./weapons.js";

/** Données du vaisseau affichables par « Ship Display », dans l'ordre de la liste (et de la rotation des molettes). */
export const SHIP_DISPLAY_VALUES = [
	"countermeasures",
	"decoys",
	"noise",
	"weapons",
	"weapon_group",
	"gimbals",
	"ship",
	"speed",
	"vertical_speed",
	"radar_altitude",
	"g_force",
	"boost",
	"hydrogen",
] as const;

export type ShipDisplayValueId = (typeof SHIP_DISPLAY_VALUES)[number];

export function isShipDisplayValueId(x: unknown): x is ShipDisplayValueId {
	return typeof x === "string" && (SHIP_DISPLAY_VALUES as readonly string[]).includes(x);
}

type Table = {
	values: Record<string, { short: string; long: string }>;
	gimbals: { locked: string; free: string };
	allWeapons: string;
	flight: { flying: string; landed: string };
};
const TABLES = { fr, en } as Record<Lang, Table>;

type Available = Extract<CmReading, { available: true }>;

/** Mots « Fixes / Libres » des cardans, aussi utilisés par l'appli web. */
export const gimbalsWord = (locked: boolean, lang: Lang): string => TABLES[lang].gimbals[locked ? "locked" : "free"];

/** Groupe d'armes : son nom, sinon son numéro tel qu'en jeu (0 = toutes les armes, puis 1, 2…). */
export const groupText = (group: { index: number; name?: string }, lang: Lang): string =>
	group.name ?? (group.index === 0 ? TABLES[lang].allWeapons : String(group.index));

/** Au-delà, un texte ne tient plus sur une touche de 144 px (taille 28 en gras) : raccourci avec « … ». */
const KEY_MAX = 9;
const fit = (text: string): string => ([...text].length > KEY_MAX ? `${[...text].slice(0, KEY_MAX - 1).join("").trimEnd()}…` : text);

const level = (percent: number): Level => (percent >= 50 ? "ok" : percent >= 25 ? "warn" : "bad");
const decimal = (n: number, lang: Lang) => (lang === "fr" ? n.toFixed(1).replace(".", ",") : n.toFixed(1));
/** Vitesse verticale signée, arrondie : « +11 », « −16 » (vrai signe moins), « 0 ». */
const signed = (v: number) => {
	const r = Math.round(v);
	return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : "0";
};

/** Nom du vaisseau sur une touche : taille selon la longueur, raccourci au-delà de 12 caractères. */
function shipName(name: string): { text: string; size: number } {
	const n = [...name].length;
	if (n <= 6) return { text: name, size: 36 };
	if (n <= 8) return { text: name, size: 30 };
	if (n <= 10) return { text: name, size: 24 };
	if (n <= 12) return { text: name, size: 20 };
	return { text: `${[...name].slice(0, 11).join("").trimEnd()}…`, size: 20 };
}

type FlightId = "ship" | "speed" | "vertical_speed" | "radar_altitude" | "g_force" | "boost" | "hydrogen";

/** Valeurs de vol et identité du vaisseau (section `vehicle`). */
function flightView(id: FlightId, s: ShipSections, lang: Lang): DisplayView {
	const table = TABLES[lang];
	const { short, long } = table.values[id];
	const gauge = id === "boost" || id === "hydrogen";
	const none: DisplayView = gauge ? { short, long, text: "—", unit: "", bar: 0, color: COLORS.none } : { short, long, text: "—", unit: "", color: COLORS.none };
	const f = readFlight(s);
	if (!f.available) return none;
	const plain = (text: string, unit: string): DisplayView => ({ short, long, text, unit, color: COLORS.none });
	switch (id) {
		case "ship": {
			const model = shipModel(s.vehicle?.state as Record<string, unknown> | undefined, lang);
			if (!model) return none;
			const { text, size } = shipName(model.name);
			// Molette : constructeur court (le nom complet ne tient pas sur l'écran tactile).
			const unit = f.landed === undefined ? "" : f.landed ? table.flight.landed : table.flight.flying;
			return { short: model.manufacturerShort, long: model.manufacturerShort, text, unit, color: COLORS.none, size };
		}
		case "speed":
			return f.instruments ? plain(String(Math.round(f.speed)), "m/s") : none;
		case "vertical_speed":
			return f.instruments ? plain(signed(f.verticalSpeed), "m/s") : none;
		case "radar_altitude":
			return !f.instruments || f.radarAltitude === undefined ? none : plain(String(Math.round(f.radarAltitude)), "m");
		case "g_force":
			return f.instruments ? plain(decimal(f.g, lang), "G") : none;
		case "boost": {
			if (!f.boost) return none;
			const percent = Math.min(100, Math.max(0, f.boost.reserve * 100));
			const color = COLORS[f.boost.critical ? "bad" : level(percent)];
			return { short: f.boost.engaged ? `${short} ▲` : short, long, text: String(Math.round(percent)), unit: "%", bar: percent, color };
		}
		case "hydrogen": {
			if (f.hydrogen === undefined) return none;
			const percent = Math.min(100, Math.max(0, f.hydrogen * 100));
			return { short, long, text: String(Math.round(percent)), unit: "%", bar: percent, color: COLORS[level(percent)] };
		}
	}
}

/** Ce qu'affichent une touche ou une molette « Ship Display » (même forme que « Actor Display »). */
export function shipView(id: ShipDisplayValueId, s: ShipSections, tracker: CountermeasureTracker, lang: Lang): DisplayView {
	if (id === "ship" || id === "speed" || id === "vertical_speed" || id === "radar_altitude" || id === "g_force" || id === "boost" || id === "hydrogen") {
		return flightView(id, s, lang);
	}
	const labels = TABLES[lang].values;
	if (id === "weapons" || id === "weapon_group" || id === "gimbals") {
		const { short, long } = labels[id];
		const w = readWeapons(s);
		const none = id === "weapons" ? { short, long, text: "—", unit: "", bar: 0, color: COLORS.none } : { short, long, text: "—", unit: "", color: COLORS.none };
		// Sans arme (siège passager, vaisseau désarmé) : rien à montrer, ni groupe ni cardans.
		if (!w.available || !w.total) return none;
		if (id === "weapon_group") return { short, long, text: fit(groupText(w.group, lang)), unit: "", color: COLORS.none };
		if (id === "gimbals") return { short, long, text: gimbalsWord(w.gimbalsLocked, lang), unit: "", color: COLORS.none };
		return { short, long, text: `${w.ready} / ${w.total}`, unit: "", bar: w.percent, color: COLORS[w.level] };
	}
	const types: CmType[] = id === "decoys" ? ["decoy"] : id === "noise" ? ["noise"] : ["decoy", "noise"];
	const present = types.map((type) => ({ type, r: tracker.read(type, s) })).filter((x): x is { type: CmType; r: Available } => x.r.available);
	// Vaisseau avec un seul type : son propre libellé, pour savoir lequel est affiché.
	const { short, long } = id === "countermeasures" && present.length === 1 ? labels[present[0].type === "decoy" ? "decoys" : "noise"] : labels[id];
	const readings = present.map((x) => x.r);
	if (!readings.length) return { short, long, text: "—", unit: "", bar: 0, color: COLORS.none };
	// Jauge et couleur : la contre-mesure la plus entamée.
	const lowest = readings.reduce((a, b) => (b.percent < a.percent ? b : a));
	return { short, long, text: readings.map((r) => String(r.amount)).join(" / "), unit: "", bar: lowest.percent, color: COLORS[lowest.level] };
}
