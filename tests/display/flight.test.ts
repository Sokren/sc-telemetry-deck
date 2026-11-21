import { describe, expect, test } from "vitest";
import { readFlight, shipModel } from "../../src/display/flight.js";

const SEATED = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_SEATED" } };
const ON_FOOT = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } };
/** Frame de l'Arrow en vol (capture du 2026-11-21). */
const arrow = (instruments: Record<string, unknown>, state: Record<string, unknown> = {}) => ({
	state: {
		name: "ANVL_Arrow_1",
		class_name: "ANVL_Arrow",
		type: "VEHICLE_TYPE_SPACESHIP",
		flight: { state: { gear: "VEHICLE_COMPONENT_DEPLOYMENT_STATE_RETRACTED" }, instruments },
		...state,
	},
});

describe("readFlight", () => {
	test("en vol, boost engagé (capture) : vitesse, vitesse verticale, altitude radar, G, boost, hydrogène", () => {
		const r = readFlight({
			vehicle: arrow({
				speed: 72.4,
				vertical_speed_indicator: -16.15,
				radar_altitude: 10.2,
				g_meter: { current: 11.63, max: 92.06 },
				boost: { engaged: true, output: 1, reserves: 0.97826827 },
				hydrogen_fuel: 0.99,
				altitude: 3.4028235e38,
			}),
			actor: SEATED,
		});
		expect(r).toMatchObject({ available: true, landed: false, speed: 72.4, verticalSpeed: -16.15, radarAltitude: 10.2, g: 11.63, hydrogen: 0.99 });
		if (!r.available) throw new Error("indisponible");
		expect(r.boost).toEqual({ engaged: true, critical: false, reserve: 0.97826827 });
	});

	test("posé (champs à zéro absents en proto3) : 0, boost plein, hydrogène absent → undefined", () => {
		const r = readFlight({ vehicle: arrow({ boost: { reserves: 1 }, radar_altitude: 2.36 }, { flight: { state: { is_landed: true }, instruments: { boost: { reserves: 1 }, radar_altitude: 2.36 } } }), actor: SEATED });
		expect(r).toMatchObject({ available: true, landed: true, speed: 0, verticalSpeed: 0, radarAltitude: 2.36, g: 0, hydrogen: undefined });
		if (!r.available) throw new Error("indisponible");
		expect(r.boost).toEqual({ engaged: false, critical: false, reserve: 1 });
	});

	test("boost absent (véhicule sans boost) → undefined ; critique lu", () => {
		const r = readFlight({ vehicle: arrow({ speed: 3 }), actor: SEATED });
		expect(r.available && r.boost).toBeUndefined();
		const c = readFlight({ vehicle: arrow({ boost: { critical: true, reserves: 0.1 } }) });
		expect(c.available && c.boost).toEqual({ engaged: false, critical: true, reserve: 0.1 });
	});

	test("section vehicle absente, ou perso à pied → indisponible ; actor absente → considéré assis", () => {
		expect(readFlight({ actor: SEATED })).toEqual({ available: false });
		expect(readFlight({ vehicle: arrow({ speed: 5 }), actor: ON_FOOT })).toEqual({ available: false });
		expect(readFlight({ vehicle: arrow({ speed: 5 }) })).toMatchObject({ available: true, speed: 5 });
	});

	test("valeurs non numériques ignorées", () => {
		expect(readFlight({ vehicle: arrow({ speed: "vite", g_meter: { current: Number.NaN } }) })).toMatchObject({ speed: 0, g: 0 });
	});
});

describe("altitude radar invalide", () => {
	test("valeur géante envoyée hors de portée (Lightning F8C) → absente", () => {
		const r = readFlight({ vehicle: arrow({ radar_altitude: 3.4028234663852886e38 }) });
		expect(r.available && r.radarAltitude).toBeUndefined();
	});
});

describe("véhicule sans données de vol", () => {
	test("pas de flight (véhicule terrestre…) : état et instruments inconnus", () => {
		const r = readFlight({ vehicle: { state: { class_name: "TMBL_Cyclone", type: "VEHICLE_TYPE_GROUND" } } });
		expect(r).toMatchObject({ available: true, landed: undefined, instruments: false });
	});
	test("flight sans state : posé / en vol inconnu", () => {
		const r = readFlight({ vehicle: { state: { class_name: "ANVL_Arrow", flight: { instruments: { speed: 3 } } } } });
		expect(r).toMatchObject({ landed: undefined, instruments: true, speed: 3 });
	});
});

describe("shipModel", () => {
	test("Arrow : code, constructeur, nom, type", () => {
		expect(shipModel(arrow({}).state, "fr")).toEqual({
			code: "ANVL",
			manufacturer: "Anvil Aerospace",
			manufacturerShort: "Anvil",
			name: "Arrow",
			type: "spaceship",
			typeLabel: "Vaisseau spatial",
		});
		expect(shipModel(arrow({}).state, "en")?.typeLabel).toBe("Spaceship");
	});

	test("nom en plusieurs mots ; constructeur inconnu → son code ; type inconnu", () => {
		expect(shipModel({ class_name: "AEGS_Avenger_Titan", type: "VEHICLE_TYPE_GROUND" }, "fr")).toMatchObject({
			manufacturer: "Aegis Dynamics",
			manufacturerShort: "Aegis",
			name: "Avenger Titan",
			type: "ground",
			typeLabel: "Véhicule terrestre",
		});
		expect(shipModel({ class_name: "ZZZZ_Mystere" }, "en")).toMatchObject({ code: "ZZZZ", manufacturer: "ZZZZ", manufacturerShort: "ZZZZ", name: "Mystere", type: "unknown" });
		expect(shipModel({ class_name: "MISC_Prospector" }, "fr")).toMatchObject({ manufacturerShort: "MISC", name: "Prospector" });
		expect(shipModel({}, "fr")).toBeNull();
		// Sans code constructeur : le type sert de constructeur.
		expect(shipModel({ class_name: "Mystere", type: "VEHICLE_TYPE_SPACESHIP" }, "fr")).toMatchObject({ code: "", manufacturer: "Vaisseau spatial", manufacturerShort: "Vaisseau spatial", name: "Mystere" });
	});
});
