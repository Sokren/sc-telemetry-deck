import type { Lang } from "../catalog/labels.js";
import { COLORS, percentText, type DisplayView } from "./format.js";
import { clockText, readGame, readQuantum, readWhereabouts } from "./situation.js";

/**
 * Touches et molettes « Ship Display » / « Actor Display » pour les données du build 13273298 (saut quantique ; mode,
 * lieu, CrimeStat, armistice, mission ; FPS, ping). Même forme que les autres valeurs (`DisplayView`).
 */

type Obj = Record<string, unknown>;

/** Valeurs ajoutées à « Ship Display ». */
export const SHIP_SITUATION_VALUES = ["quantum", "quantum_distance", "quantum_calibration"] as const;
export type ShipSituationId = (typeof SHIP_SITUATION_VALUES)[number];
/** Valeurs ajoutées à « Actor Display ». */
export const ACTOR_SITUATION_VALUES = ["mode", "location", "crime_stat", "armistice", "mission", "fps", "ping"] as const;
export type ActorSituationId = (typeof ACTOR_SITUATION_VALUES)[number];
export type SituationId = ShipSituationId | ActorSituationId;

const LABELS: Record<Lang, Record<SituationId, { short: string; long: string }>> = {
	fr: {
		quantum: { short: "Saut QT", long: "Saut quantique (état, temps restant)" },
		quantum_distance: { short: "Dist. QT", long: "Saut quantique : distance restante" },
		quantum_calibration: { short: "Calibrage", long: "Saut quantique : calibrage" },
		mode: { short: "Mode", long: "Mode du perso (vol, minage…)" },
		location: { short: "Lieu", long: "Lieu" },
		crime_stat: { short: "CrimeStat", long: "CrimeStat" },
		armistice: { short: "Armistice", long: "Zone d'armistice" },
		mission: { short: "Mission", long: "Mission suivie (objectifs)" },
		fps: { short: "FPS", long: "FPS du jeu" },
		ping: { short: "Ping", long: "Ping" },
	},
	en: {
		quantum: { short: "QT", long: "Quantum travel (state, time left)" },
		quantum_distance: { short: "QT dist.", long: "Quantum travel: distance left" },
		quantum_calibration: { short: "Calib.", long: "Quantum travel: calibration" },
		mode: { short: "Mode", long: "Character mode (flight, mining…)" },
		location: { short: "Location", long: "Location" },
		crime_stat: { short: "CrimeStat", long: "CrimeStat" },
		armistice: { short: "Armistice", long: "Armistice zone" },
		mission: { short: "Mission", long: "Tracked mission (objectives)" },
		fps: { short: "FPS", long: "Game FPS" },
		ping: { short: "Ping", long: "Ping" },
	},
};
const WORDS = {
	fr: { yes: "Oui", no: "Non", ready: "Prêt", off: "Éteint", cooldown: "Refroid." },
	en: { yes: "Yes", no: "No", ready: "Ready", off: "Off", cooldown: "Cooldown" },
};

/** Au-delà, un texte ne tient plus sur une touche (comme ship-values) : raccourci avec « … ». */
const KEY_MAX = 9;
const fit = (text: string, max = KEY_MAX): string => ([...text].length > max ? `${[...text].slice(0, max - 1).join("").trimEnd()}…` : text);

export const isShipSituationId = (x: unknown): x is ShipSituationId => (SHIP_SITUATION_VALUES as readonly unknown[]).includes(x);
export const isActorSituationId = (x: unknown): x is ActorSituationId => (ACTOR_SITUATION_VALUES as readonly unknown[]).includes(x);

/**
 * Ce qu'affiche une touche pour une donnée du build 13273298. « — » quand le jeu ne l'envoie pas (version d'avant,
 * hors vaisseau, pas de mission…).
 */
export function situationView(id: SituationId, s: { vehicle?: Obj; actor?: Obj; game?: Obj }, lang: Lang): DisplayView {
	const { short, long } = LABELS[lang][id];
	const words = WORDS[lang];
	// Sur une touche, la couleur passe par la barre : CrimeStat (rouge, 1 à 5) et armistice (vert) en ont une.
	const gauge = id === "quantum_calibration" || id === "mission" || id === "crime_stat" || id === "armistice";
	const none: DisplayView = gauge ? { short, long, text: "—", unit: "", bar: 0, color: COLORS.none } : { short, long, text: "—", unit: "", color: COLORS.none };
	const plain = (text: string, unit = "", color = COLORS.none): DisplayView => ({ short, long, text: fit(text), unit, color });
	switch (id) {
		case "quantum":
		case "quantum_distance":
		case "quantum_calibration": {
			const q = readQuantum(s.vehicle, s.actor, lang);
			if (!q) return none;
			if (id === "quantum_calibration") return { short, long, text: percentText(q.calibration), unit: "%", bar: q.calibration, color: COLORS[q.calibration >= 100 ? "ok" : "warn"] };
			if (id === "quantum_distance") {
				if (q.distanceM === null) return none;
				const [value, unit] = q.distanceText.split(" ");
				return plain(value, unit);
			}
			// Destination en petit sous la valeur.
			const dest = q.destination ? fit(q.destination, 12) : "";
			switch (q.state) {
				case "traveling":
					return plain(q.etaSeconds === null ? q.label : clockText(q.etaSeconds), dest, COLORS.ok);
				case "aligning":
					return plain(`${percentText(q.calibration)} %`, dest, COLORS.warn);
				case "idle":
					return plain(words.ready, dest);
				case "cooldown":
					return plain(words.cooldown, dest);
				case "off":
					return plain(words.off);
				default:
					return none;
			}
		}
		case "mode":
		case "location":
		case "crime_stat":
		case "armistice":
		case "mission": {
			if (!s.actor) return none;
			const w = readWhereabouts(s.actor, lang);
			if (id === "mode") return w.mode === "unknown" ? none : plain(w.modeLabel);
			if (id === "location") return w.place ? plain(w.place, w.location.length > 1 ? fit(w.location[w.location.length - 2], 12) : "") : none;
			if (id === "crime_stat") {
				if (w.crimeStat === null) return none;
				return { ...plain(String(w.crimeStat), "", w.crimeStat > 0 ? COLORS.bad : COLORS.none), bar: (Math.min(5, w.crimeStat) / 5) * 100 };
			}
			if (id === "armistice") {
				if (w.armistice === null) return none;
				return { ...plain(w.armistice ? words.yes : words.no, "", w.armistice ? COLORS.ok : COLORS.none), bar: w.armistice ? 100 : 0 };
			}
			const m = w.mission;
			if (!m?.total) return none;
			const percent = (m.done / m.total) * 100;
			return { short, long, text: `${m.done}/${m.total}`, unit: "", bar: percent, color: COLORS.ok };
		}
		case "fps":
		case "ping": {
			const p = readGame(s.game, lang)?.perf;
			if (!p) return none;
			if (id === "fps") return plain(String(Math.round(p.fps)));
			return p.pingMs === null ? none : plain(String(Math.round(p.pingMs)), "ms");
		}
	}
}
