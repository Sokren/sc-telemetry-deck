import { describe, expect, test } from "vitest";
import { COLORS } from "../../src/display/format.js";
import { situationView } from "../../src/display/situation-values.js";

const seated = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_SEATED" } };
const qt = (q: Record<string, unknown>) => ({ vehicle: { state: { quantum_travel: q } }, actor: seated });

describe("touches du build 13273298", () => {
	test("saut quantique : temps restant + destination, alignement en %, prêt, éteint ; rien → « — »", () => {
		const dest = { display_name: "Port Tressler très long" };
		expect(situationView("quantum", qt({ state: "QUANTUM_TRAVEL_STATE_TRAVELING", destination: dest, eta_seconds: 84 }), "fr")).toMatchObject({ short: "Saut QT", text: "1:24", unit: "Port Tressl…", color: COLORS.ok });
		expect(situationView("quantum", qt({ state: "QUANTUM_TRAVEL_STATE_ALIGNING", calibration_ratio: 0.62 }), "fr")).toMatchObject({ text: "62 %", color: COLORS.warn });
		expect(situationView("quantum", qt({ state: "QUANTUM_TRAVEL_STATE_IDLE" }), "en")).toMatchObject({ short: "QT", text: "Ready", unit: "" });
		expect(situationView("quantum", qt({ state: "QUANTUM_TRAVEL_STATE_OFF" }), "fr")).toMatchObject({ text: "Éteint" });
		expect(situationView("quantum", { actor: seated }, "fr")).toMatchObject({ text: "—", color: COLORS.none });
	});
	test("distance (valeur + unité) et calibrage (jauge)", () => {
		expect(situationView("quantum_distance", qt({ remaining_distance_m: 12_700_000_000 }), "fr")).toMatchObject({ text: "12,7", unit: "Gm" });
		expect(situationView("quantum_distance", qt({}), "fr")).toMatchObject({ text: "—" });
		expect(situationView("quantum_calibration", qt({ calibration_ratio: 1 }), "fr")).toMatchObject({ text: "100", unit: "%", bar: 100, color: COLORS.ok });
		expect(situationView("quantum_calibration", {}, "fr")).toMatchObject({ text: "—", bar: 0 });
	});
	test("perso : mode, lieu (et niveau au-dessus), CrimeStat rouge, armistice vert, mission en jauge", () => {
		const actor = {
			state: {
				operator_mode: "ACTOR_OPERATOR_MODE_MINING",
				crime_stat: 2,
				location: { hierarchy: [{ display_name: "Hurston" }, { display_name: "Lorville" }], armistice_zone: true },
				tracked_contract: { details: { title: "Livraison", objectives_completed: 1, objectives_total: 4 } },
			},
		};
		expect(situationView("mode", { actor }, "fr")).toMatchObject({ text: "Minage" });
		expect(situationView("location", { actor }, "fr")).toMatchObject({ text: "Lorville", unit: "Hurston" });
		expect(situationView("crime_stat", { actor }, "fr")).toMatchObject({ text: "2", color: COLORS.bad, bar: 40 });
		expect(situationView("armistice", { actor }, "en")).toMatchObject({ text: "Yes", color: COLORS.ok, bar: 100 });
		expect(situationView("mission", { actor }, "fr")).toMatchObject({ text: "1/4", bar: 25 });
		const bare = { state: {} };
		expect(situationView("mode", { actor: bare }, "fr").text).toBe("—");
		expect(situationView("crime_stat", { actor: bare }, "fr")).toMatchObject({ text: "0", color: COLORS.none, bar: 0 });
		expect(situationView("armistice", { actor: bare }, "fr").text).toBe("—");
		expect(situationView("mission", { actor: bare }, "fr")).toMatchObject({ text: "—", bar: 0 });
		expect(situationView("crime_stat", {}, "fr").text).toBe("—");
	});
	test("FPS et ping (section game)", () => {
		const game = { debug: { fps: 57.6, network: { ping_ms: 38.2 } } };
		expect(situationView("fps", { game }, "fr")).toMatchObject({ text: "58" });
		expect(situationView("ping", { game }, "fr")).toMatchObject({ text: "38", unit: "ms" });
		expect(situationView("ping", { game: { debug: { fps: 60 } } }, "fr").text).toBe("—");
		expect(situationView("fps", {}, "fr").text).toBe("—");
	});
});
