import { describe, expect, test } from "vitest";
import { seatLabel } from "../../src/display/seat.js";

describe("seatLabel (sièges vus en jeu)", () => {
	test.each([
		["RSI_Hermes_SeatDashboard_CoPilot_877605416445", "crew", "fr", "Copilote"],
		["RSI_Hermes_SeatDashboard_CoPilot_877605416445", "crew", "en", "Co-pilot"],
		["ANVL_Lightning_F8_SCItem_Seat_Pilot_877605224341", "pilot", "fr", "Pilote"],
		["ANVL_Arrow_Seat_Pilot_877609247928", "pilot", "en", "Pilot"],
		// Pas de mot connu : le rôle sert d'étiquette.
		["MISC_Prospector_SCItem_Seat_877602860569", "pilot", "fr", "Pilote"],
		["AEGS_Hammerhead_Seat_Turret_Left_1", "gunner", "fr", "Tourelle"],
		["RSI_Constellation_Seat_RemoteTurret_2", "gunner", "en", "Turret"],
		["CRUS_C2_Seat_Engineer_1", "crew", "fr", "Ingénieur"],
		["DRAK_Cutlass_Seat_Passenger_3", "crew", "en", "Passenger"],
		["AEGS_Idris_Seat_Captain_1", "crew", "fr", "Capitaine"],
		["X_Seat_Gunner_1", "crew", "fr", "Tireur"],
		// Postes de l'Hermes et autres (nom propre au poste, rôle « équipage »).
		["RSI_Hermes_Tractor_Station_877605416498", "crew", "fr", "Rayon tracteur"],
		["RSI_Hermes_Tractor_Station_877605416498", "crew", "en", "Tractor beam"],
		["MISC_Prospector_Mining_Station_1", "pilot", "fr", "Minage"],
		["DRAK_Vulture_Salvage_Station_1", "crew", "en", "Salvage"],
		["ARGO_MOLE_Mining_Turret_Left_1", "crew", "fr", "Minage"],
		["RSI_Polaris_Scanner_Station_1", "crew", "fr", "Poste"],
	] as const)("%s (%s, %s) → %s", (seat, role, lang, expected) => {
		expect(seatLabel(seat, role, lang)).toBe(expected);
	});

	test("ni mot connu ni rôle → « Siège » ; pas de siège → null", () => {
		expect(seatLabel("X_Seat_42", "none", "fr")).toBe("Siège");
		expect(seatLabel("X_Seat_42", "none", "en")).toBe("Seat");
		expect(seatLabel(null, "pilot", "fr")).toBeNull();
		expect(seatLabel("", "pilot", "fr")).toBeNull();
	});
});
