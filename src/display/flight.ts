// SPDX-License-Identifier: MPL-2.0
import type { Lang } from "../catalog/labels.js";
import type { ShipSections } from "./countermeasures.js";

/**
 * Vol du vaisseau (section `vehicle`, `state.flight`) et identité du modèle. Captures en vol de l'Arrow :
 * `g_meter.max` est le pic enregistré (pas une limite), l'altitude au niveau de la mer est souvent invalide (ignorée),
 * l'hydrogène n'est pas envoyé par tous les vaisseaux.
 */
export type FlightReading =
	| { available: false }
	| {
			available: true;
			/** Inconnu sans `flight.state` (véhicule terrestre…). */
			landed?: boolean;
			/** `false` sans `flight.instruments` : vitesse, altitude et G sont alors inconnus. */
			instruments: boolean;
			/** m/s */
			speed: number;
			/** m/s, positive en montée. */
			verticalSpeed: number;
			/** m ; absente quand le jeu envoie sa valeur « hors de portée » (≈ 3,4e38). */
			radarAltitude?: number;
			/** G subis. */
			g: number;
			/** Absent si le vaisseau n'envoie pas de boost. `reserve` de 0 à 1. */
			boost?: { engaged: boolean; critical: boolean; reserve: number };
			/** De 0 à 1 ; absent si le jeu ne l'envoie pas (ex. Prospector). */
			hydrogen?: number;
	  };

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : undefined);
/** proto3 : 0 n'est pas transmis. */
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/** Le jeu envoie le plus grand flottant (≈ 3,4e38) quand une altitude ne s'applique pas. */
export const validAltitude = (x: unknown): number | undefined => {
	const v = num(x);
	return v < 1e7 ? v : undefined;
};

/** Même règle que les instruments : section `vehicle` fraîche, perso assis (`actor` absente = assis). */
export function readFlight(s: ShipSections): FlightReading {
	const state = obj(s.vehicle?.state);
	if (!state) return { available: false };
	if (s.actor && obj(s.actor.state)?.locomotion !== "ACTOR_LOCOMOTION_STATE_SEATED") return { available: false };
	const flight = obj(state.flight);
	const instrSection = obj(flight?.instruments);
	const instr = instrSection ?? {};
	const boost = obj(instr.boost);
	const flightState = obj(flight?.state);
	const reading: FlightReading = {
		available: true,
		landed: flightState ? flightState.is_landed === true : undefined,
		instruments: instrSection !== undefined,
		speed: num(instr.speed),
		verticalSpeed: num(instr.vertical_speed_indicator),
		radarAltitude: validAltitude(instr.radar_altitude),
		g: num(obj(instr.g_meter)?.current),
		// Champ simple (pas `optional`) : un réservoir vide (0, non transmis) et un vaisseau qui ne l'envoie pas
		// sont indiscernables ; les deux s'affichent « — ».
		hydrogen: typeof instr.hydrogen_fuel === "number" && Number.isFinite(instr.hydrogen_fuel) ? instr.hydrogen_fuel : undefined,
	};
	if (boost) reading.boost = { engaged: boost.engaged === true, critical: boost.critical === true, reserve: num(boost.reserves) };
	return reading;
}

/** Code constructeur (préfixe de `class_name`) → nom court, nom complet. */
const MANUFACTURERS: Record<string, [string, string]> = {
	AEGS: ["Aegis", "Aegis Dynamics"],
	ANVL: ["Anvil", "Anvil Aerospace"],
	AOPA: ["Aopoa", "Aopoa"],
	ARGO: ["Argo", "Argo Astronautics"],
	BANU: ["Banu", "Banu"],
	CNOU: ["C.O.", "Consolidated Outland"],
	CRUS: ["Crusader", "Crusader Industries"],
	DRAK: ["Drake", "Drake Interplanetary"],
	ESPR: ["Esperia", "Esperia"],
	GAMA: ["Gatac", "Gatac Manufacture"],
	GRIN: ["Greycat", "Greycat Industrial"],
	KRIG: ["Kruger", "Kruger Intergalactic"],
	MISC: ["MISC", "Musashi Industrial & Starflight Concern"],
	MRAI: ["Mirai", "Mirai"],
	ORIG: ["Origin", "Origin Jumpworks"],
	RSI: ["RSI", "Roberts Space Industries"],
	TMBL: ["Tumbril", "Tumbril Land Systems"],
	VNCL: ["Vanduul", "Vanduul"],
	XIAN: ["Aopoa", "Aopoa"],
	XNAA: ["Aopoa", "Aopoa"],
};

const TYPES: Record<string, "spaceship" | "ground" | "gravlev" | "boat"> = {
	VEHICLE_TYPE_SPACESHIP: "spaceship",
	VEHICLE_TYPE_GROUND: "ground",
	VEHICLE_TYPE_GRAVLEV: "gravlev",
	VEHICLE_TYPE_BOAT: "boat",
};
type ShipType = "spaceship" | "ground" | "gravlev" | "boat" | "unknown";
const TYPE_LABELS: Record<Lang, Record<ShipType, string>> = {
	fr: { spaceship: "Vaisseau spatial", ground: "Véhicule terrestre", gravlev: "Véhicule à gravité", boat: "Bateau", unknown: "Véhicule" },
	en: { spaceship: "Spaceship", ground: "Ground vehicle", gravlev: "Grav-lev vehicle", boat: "Boat", unknown: "Vehicle" },
};

export type ShipModel = { code: string; manufacturer: string; manufacturerShort: string; name: string; type: ShipType; typeLabel: string };

/** Modèle du vaisseau depuis `vehicle.state` : `ANVL_Arrow` → Anvil Aerospace, « Arrow ». `null` sans `class_name`. */
export function shipModel(state: Obj | undefined, lang: Lang): ShipModel | null {
	const raw = typeof state?.class_name === "string" ? state.class_name : "";
	const parts = raw.split("_").filter(Boolean);
	if (!parts.length) return null;
	const code = parts.length > 1 ? parts[0]! : "";
	const known = MANUFACTURERS[code.toUpperCase()];
	const type: ShipType = TYPES[String(state?.type)] ?? "unknown";
	const typeLabel = TYPE_LABELS[lang][type];
	return {
		code,
		// Sans code constructeur, le type en tient lieu (« Vaisseau spatial »).
		manufacturer: known?.[1] ?? (code || typeLabel),
		manufacturerShort: known?.[0] ?? (code || typeLabel),
		name: (parts.length > 1 ? parts.slice(1) : parts).join(" "),
		type,
		typeLabel,
	};
}
