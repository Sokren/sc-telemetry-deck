import { describe, expect, test } from "vitest";
import { CountermeasureTracker } from "../../src/display/countermeasures.js";
import { COLORS } from "../../src/display/format.js";
import { isShipDisplayValueId, SHIP_DISPLAY_VALUES, shipView } from "../../src/display/ship-values.js";

const SEATED = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_SEATED" } };
const vehicle = { state: { class_name: "MISC_Prospector" } };
const cm = (decoy?: number, noise?: number) => ({
	weapons: {
		countermeasures: [
			...(decoy === undefined ? [] : [{ type: "COUNTERMEASURE_TYPE_DECOY", amount: decoy }]),
			...(noise === undefined ? [] : [{ type: "COUNTERMEASURE_TYPE_NOISE", amount: noise }]),
		],
	},
	vehicle,
	actor: SEATED,
});

describe("shipView", () => {
	test("liste des valeurs : contre-mesures, leurres, brouilleurs", () => {
		expect(SHIP_DISPLAY_VALUES).toEqual(["countermeasures", "decoys", "noise", "weapons", "weapon_group", "gimbals", "ship", "shields", "hull", "speed", "vertical_speed", "radar_altitude", "g_force", "boost", "hydrogen"]);
		expect(isShipDisplayValueId("decoys")).toBe(true);
		expect(isShipDisplayValueId("oxygen")).toBe(false);
	});

	test("les deux : « 45 / 3 », barre et couleur du plus bas pourcentage", () => {
		const t = new CountermeasureTracker();
		t.observe(cm(48, 5));
		const v = shipView("countermeasures", cm(45, 1), t, "fr");
		expect(v).toMatchObject({ short: "C-mesures", text: "45 / 1", unit: "", bar: 20, color: COLORS.bad });
	});

	test("leurres seuls, brouilleurs seuls", () => {
		const t = new CountermeasureTracker();
		t.observe(cm(48, 5));
		expect(shipView("decoys", cm(24, 5), t, "en")).toMatchObject({ short: "Decoys", long: "Decoys", text: "24", bar: 50, color: COLORS.ok });
		expect(shipView("noise", cm(24, 2), t, "fr")).toMatchObject({ short: "Brouill.", text: "2", bar: 40, color: COLORS.warn });
	});

	test("un seul type sur le vaisseau : « contre-mesures » n'affiche que lui", () => {
		const t = new CountermeasureTracker();
		expect(shipView("countermeasures", cm(24), t, "fr")).toMatchObject({ short: "Leurres", long: "Leurres", text: "24", bar: 100, color: COLORS.ok });
		expect(shipView("countermeasures", cm(undefined, 3), t, "en")).toMatchObject({ short: "Noise", text: "3" });
		expect(shipView("noise", cm(24), t, "fr")).toMatchObject({ text: "—", bar: 0, color: COLORS.none });
	});

	test("rien de lisible (jeu fermé, à pied) → « — », barre vide", () => {
		const t = new CountermeasureTracker();
		for (const id of ["countermeasures", "decoys", "noise", "weapons"] as const) expect(shipView(id, {}, t, "en")).toMatchObject({ text: "—", unit: "", bar: 0, color: COLORS.none });
		expect(shipView("countermeasures", { weapons: { countermeasures: [] }, actor: SEATED }, t, "fr").text).toBe("—");
	});

	test("libellés longs FR / EN", () => {
		const t = new CountermeasureTracker();
		expect(shipView("countermeasures", {}, t, "fr").long).toBe("Contre-mesures (leurres / brouilleurs)");
		expect(shipView("countermeasures", {}, t, "en").long).toBe("Countermeasures (decoys / noise)");
	});

	describe("armes", () => {
		const gun = (ready: boolean) => ({ name: "KLWE_LaserRepeater_S1_1", is_powered: true, ...(ready ? { ready_to_fire: true } : {}) });
		const at = (weapons: Record<string, unknown>) => ({ weapons, vehicle, actor: SEATED });
		const t = new CountermeasureTracker();

		test("armes prêtes : « 1 / 2 », barre 50 %, orange ; « 2 / 2 » vert ; sans arme « — »", () => {
			expect(shipView("weapons", at({ weapons: [gun(true), gun(false)] }), t, "fr")).toMatchObject({ short: "Armes", text: "1 / 2", bar: 50, color: COLORS.warn });
			expect(shipView("weapons", at({ weapons: [gun(true), gun(true)] }), t, "en")).toMatchObject({ short: "Weapons", text: "2 / 2", bar: 100, color: COLORS.ok });
			expect(shipView("weapons", at({}), t, "fr")).toMatchObject({ text: "—", bar: 0, color: COLORS.none });
		});

		test("groupe : nom, sinon numéro à partir de 1, sans jauge", () => {
			const named = shipView("weapon_group", at({ preset_index: 2, preset_name: "Missiles", weapons: [gun(true)] }), t, "fr");
			expect(named).toMatchObject({ short: "Groupe", text: "Missiles" });
			expect(named.bar).toBeUndefined();
			// Groupe 0 = « tous » dans le jeu, puis 1, 2… (confirmé en jeu).
			expect(shipView("weapon_group", at({ weapons: [gun(true)] }), t, "en")).toMatchObject({ short: "Group", text: "All" });
			expect(shipView("weapon_group", at({ weapons: [gun(true)] }), t, "fr").text).toBe("Toutes");
			expect(shipView("weapon_group", at({ preset_index: 1, weapons: [gun(true)] }), t, "fr").text).toBe("1");
			expect(shipView("weapon_group", at({ preset_index: 3, weapons: [gun(true)] }), t, "en").text).toBe("3");
		});

		test("cardans : fixes / libres, sans jauge", () => {
			const armed = (locked: boolean) => at({ ...(locked ? { settings: { gimbals_locked: true } } : {}), weapons: [gun(true)] });
			expect(shipView("gimbals", armed(true), t, "fr")).toMatchObject({ short: "Cardans", text: "Fixes" });
			expect(shipView("gimbals", armed(false), t, "fr").text).toBe("Libres");
			expect(shipView("gimbals", armed(true), t, "en").text).toBe("Locked");
			expect(shipView("gimbals", armed(false), t, "en")).toMatchObject({ short: "Gimbals", text: "Free" });
			expect(shipView("gimbals", {}, t, "fr")).toMatchObject({ text: "—" });
			expect(shipView("gimbals", {}, t, "fr").bar).toBeUndefined();
		});
	});

	test("vaisseau sans arme (siège passager…) : groupe et cardans « — » aussi ; nom de groupe long raccourci", () => {
		const t = new CountermeasureTracker();
		const at = (weapons: Record<string, unknown>) => ({ weapons, vehicle, actor: SEATED });
		expect(shipView("weapon_group", at({ settings: { gimbals_locked: true } }), t, "fr").text).toBe("—");
		expect(shipView("gimbals", at({ settings: { gimbals_locked: true } }), t, "fr").text).toBe("—");
		const gun = { name: "x", ready_to_fire: true };
		expect(shipView("weapon_group", at({ preset_name: "Missiles anti-vaisseaux", weapons: [gun] }), t, "fr").text).toBe("Missiles…");
		expect(shipView("weapon_group", at({ preset_name: "Missiles", weapons: [gun] }), t, "fr").text).toBe("Missiles");
	});

	describe("vol et vaisseau (captures de l'Arrow)", () => {
		const t = new CountermeasureTracker();
		const fly = (instruments: Record<string, unknown>, landed = false, cls = "ANVL_Arrow") => ({
			vehicle: { state: { class_name: cls, type: "VEHICLE_TYPE_SPACESHIP", flight: { state: landed ? { is_landed: true } : {}, instruments } } },
			actor: SEATED,
		});

		test("vaisseau : constructeur court, nom, état", () => {
			expect(shipView("ship", fly({}), t, "fr")).toMatchObject({ short: "Anvil", long: "Anvil", text: "Arrow", unit: "En vol" });
			expect(shipView("ship", fly({}, true), t, "en")).toMatchObject({ short: "Anvil", text: "Arrow", unit: "Landed" });
			expect(shipView("ship", fly({}, true, "MISC_Prospector"), t, "fr")).toMatchObject({ short: "MISC", text: "Prospector", unit: "Posé" });
			const long = shipView("ship", fly({}, false, "AEGS_Avenger_Titan_Renegade"), t, "fr");
			expect(long.text).toBe("Avenger Tit…");
			expect(long.size).toBeLessThanOrEqual(22);
			expect(shipView("ship", {}, t, "fr")).toMatchObject({ short: "Vaisseau", text: "—", unit: "" });
		});

		test("vitesse, vitesse verticale signée, altitude radar, G", () => {
			const s = fly({ speed: 99.45, vertical_speed_indicator: -16.15, radar_altitude: 28.76, g_meter: { current: 6.39, max: 92 } });
			expect(shipView("speed", s, t, "fr")).toMatchObject({ short: "Vitesse", text: "99", unit: "m/s" });
			expect(shipView("vertical_speed", s, t, "fr")).toMatchObject({ text: "−16", unit: "m/s" });
			expect(shipView("vertical_speed", fly({ vertical_speed_indicator: 11.28 }), t, "en").text).toBe("+11");
			expect(shipView("vertical_speed", fly({ vertical_speed_indicator: 0.2 }), t, "en").text).toBe("0");
			expect(shipView("radar_altitude", s, t, "en")).toMatchObject({ text: "29", unit: "m" });
			expect(shipView("radar_altitude", fly({ radar_altitude: 3.4e38 }), t, "en")).toMatchObject({ text: "—" });
			const g = shipView("g_force", s, t, "fr");
			expect(g).toMatchObject({ text: "6,4", unit: "G" });
			expect(g.bar).toBeUndefined();
			expect(shipView("g_force", s, t, "en").text).toBe("6.4");
		});

		test("boost : réserve en %, engagé dans le libellé, critique en rouge ; absent → « — »", () => {
			expect(shipView("boost", fly({ boost: { reserves: 1 } }), t, "fr")).toMatchObject({ short: "Boost", text: "100", unit: "%", bar: 100, color: COLORS.ok });
			const on = shipView("boost", fly({ boost: { engaged: true, output: 1, reserves: 0.97826827 } }), t, "fr");
			// 97,8 % : tronqué comme dans le jeu.
			expect(on).toMatchObject({ short: "Boost ▲", text: "97", color: COLORS.ok });
			expect(shipView("boost", fly({ boost: { reserves: 0.4 } }), t, "fr").color).toBe(COLORS.warn);
			expect(shipView("boost", fly({ boost: { critical: true, reserves: 0.9 } }), t, "fr").color).toBe(COLORS.bad);
			expect(shipView("boost", fly({}), t, "fr")).toMatchObject({ text: "—", bar: 0 });
		});

		test("hydrogène : % avec jauge, « — » si le vaisseau ne l'envoie pas", () => {
			expect(shipView("hydrogen", fly({ hydrogen_fuel: 0.99 }), t, "fr")).toMatchObject({ text: "99", unit: "%", bar: 99, color: COLORS.ok });
			expect(shipView("hydrogen", fly({}), t, "fr")).toMatchObject({ text: "—", bar: 0, color: COLORS.none });
		});

		test("à pied ou jeu fermé → « — » partout", () => {
			for (const id of ["speed", "vertical_speed", "radar_altitude", "g_force", "boost", "hydrogen"] as const) {
				expect(shipView(id, { vehicle: fly({ speed: 5 }).vehicle, actor: { state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } } }, t, "fr").text).toBe("—");
			}
		});
	});

	describe("vol : cas limites (relecture)", () => {
		const t = new CountermeasureTracker();
		test("véhicule sans données de vol : nom sans état, instruments « — »", () => {
			const s = { vehicle: { state: { class_name: "TMBL_Cyclone", type: "VEHICLE_TYPE_GROUND" } }, actor: SEATED };
			expect(shipView("ship", s, t, "fr")).toMatchObject({ short: "Tumbril", text: "Cyclone", unit: "" });
			for (const id of ["speed", "vertical_speed", "radar_altitude", "g_force"] as const) expect(shipView(id, s, t, "fr").text).toBe("—");
		});
		test("molette : constructeur court (pas le nom complet)", () => {
			const s = { vehicle: { state: { class_name: "MISC_Prospector", flight: { state: { is_landed: true } } } }, actor: SEATED };
			expect(shipView("ship", s, t, "fr").long).toBe("MISC");
		});
		test("noms longs : taille réduite", () => {
			const s = (cls: string) => ({ vehicle: { state: { class_name: cls, flight: { state: {} } } }, actor: SEATED });
			expect(shipView("ship", s("RSI_Constellation_Andromeda"), t, "fr")).toMatchObject({ text: "Constellati…", size: 20 });
			expect(shipView("ship", s("DRAK_Vulture"), t, "fr").size).toBe(30);
			expect(shipView("ship", s("CRUS_Starfighter"), t, "fr").size).toBeLessThanOrEqual(24);
		});
	});

	describe("boucliers et coque (captures : Lightning F8C en NAV, Arrow après un choc)", () => {
		const t = new CountermeasureTracker();
		const ship = (state: Record<string, unknown>) => ({ vehicle: { state: { class_name: "ANVL_Lightning_F8C", ...state } }, actor: SEATED });
		test("boucliers : % avec jauge ; vidés en NAV → 0, rouge", () => {
			expect(shipView("shields", ship({ shields: { level: 0.64056736, faces: [0.64056736] } }), t, "fr")).toMatchObject({ short: "Boucliers", text: "64", unit: "%", bar: expect.closeTo(64.06, 1), color: COLORS.ok });
			expect(shipView("shields", ship({ shields: { faces: [0] } }), t, "en")).toMatchObject({ short: "Shields", text: "0", bar: 0, color: COLORS.bad });
			expect(shipView("shields", ship({}), t, "fr")).toMatchObject({ text: "—", bar: 0, color: COLORS.none });
		});
		test("coque : % avec jauge ; champ absent (ancienne version du jeu) → « — »", () => {
			expect(shipView("hull", ship({ health: 0.44407666 }), t, "fr")).toMatchObject({ short: "Coque", text: "44", color: COLORS.warn });
			expect(shipView("hull", ship({ health: 0.20146948 }), t, "en")).toMatchObject({ short: "Hull", text: "20", color: COLORS.bad });
			expect(shipView("hull", ship({}), t, "fr")).toMatchObject({ text: "—", bar: 0 });
		});
		test("à pied → « — »", () => {
			const onFoot = { vehicle: ship({ health: 1, shields: { level: 1 } }).vehicle, actor: { state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } } };
			expect(shipView("shields", onFoot, t, "fr").text).toBe("—");
			expect(shipView("hull", onFoot, t, "fr").text).toBe("—");
		});
	});
});
