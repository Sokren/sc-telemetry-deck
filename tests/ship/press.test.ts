import { describe, expect, test } from "vitest";
import { DANGEROUS_ACTIONS } from "../../src/game/dangerous.js";
import { SHIP_FUNCTIONS, shipFunction, type ShipFunction } from "../../src/ship/functions.js";
import { decidePress, type ShipMode } from "../../src/ship/press.js";
import type { ShipState } from "../../src/ship/state.js";

const gear = shipFunction("gear");
const send = (action: string) => ({ kind: "send", action });

describe("train d'atterrissage", () => {
	test.each<[ShipState, ShipMode, object]>([
		["on", "toggle", send("v_retract_landing_system")],
		["off", "toggle", send("v_deploy_landing_system")],
		["moving-on", "toggle", send("v_retract_landing_system")],
		["moving-off", "toggle", send("v_deploy_landing_system")],
		["on", "on", { kind: "noop" }],
		["off", "on", send("v_deploy_landing_system")],
		["moving-off", "on", send("v_deploy_landing_system")],
		["off", "off", { kind: "noop" }],
		["on", "off", send("v_retract_landing_system")],
		["unknown", "toggle", send("v_toggle_landing_system")],
		["unknown", "on", send("v_deploy_landing_system")],
		["unknown", "off", send("v_retract_landing_system")],
	])("état %s, mode %s", (state, mode, expected) => {
		expect(decidePress(gear, state, mode)).toEqual(expected);
	});

	test("fonction absente du vaisseau → refusé, rien envoyé", () => {
		for (const mode of ["toggle", "on", "off"] as const) expect(decidePress(gear, "unavailable", mode).kind).toBe("refuse");
	});
});

describe("ESP (bascule seulement)", () => {
	const esp = shipFunction("esp");
	test("état connu différent de la cible → bascule du jeu", () => {
		expect(decidePress(esp, "on", "toggle")).toEqual(send("v_ifcs_toggle_esp"));
		expect(decidePress(esp, "off", "on")).toEqual(send("v_ifcs_toggle_esp"));
		expect(decidePress(esp, "on", "off")).toEqual(send("v_ifcs_toggle_esp"));
	});
	test("déjà dans l'état voulu → rien", () => {
		expect(decidePress(esp, "on", "on")).toEqual({ kind: "noop" });
	});
	test("état inconnu : bascule seulement en mode Bascule", () => {
		expect(decidePress(esp, "unknown", "toggle")).toEqual(send("v_ifcs_toggle_esp"));
		expect(decidePress(esp, "unknown", "on").kind).toBe("refuse");
		expect(decidePress(esp, "unknown", "off").kind).toBe("refuse");
	});
});

describe("portes, verrous, puissance générale : dans les deux sens (22/11/2026)", () => {
	const doors = shipFunction("doors_closed");
	const locks = shipFunction("doors_locked");
	const power = shipFunction("power_main");
	test("bascule selon l'état lu, commandes dédiées", () => {
		expect(decidePress(doors, "on", "toggle")).toEqual(send("v_open_all_doors"));
		expect(decidePress(doors, "off", "toggle")).toEqual(send("v_close_all_doors"));
		expect(decidePress(locks, "on", "toggle")).toEqual(send("v_unlock_all_doors"));
		expect(decidePress(locks, "off", "on")).toEqual(send("v_lock_all_doors"));
		expect(decidePress(power, "on", "off")).toEqual(send("v_power_set_off"));
	});
	test("état inconnu → bascule du jeu", () => {
		expect(decidePress(power, "unknown", "toggle")).toEqual(send("v_power_toggle"));
		expect(decidePress(doors, "unknown", "on")).toEqual(send("v_close_all_doors"));
	});
});

describe("garde-fou indépendant de la table", () => {
	test("aucune combinaison (18 fonctions × 6 états × 3 modes) n'envoie l'autodestruction, l'éjection ni la sortie d'urgence", () => {
		const states: ShipState[] = ["on", "off", "moving-on", "moving-off", "unavailable", "unknown"];
		let combos = 0;
		for (const fn of SHIP_FUNCTIONS) {
			for (const state of states) {
				for (const mode of ["toggle", "on", "off"] as const) {
					combos++;
					const d = decidePress(fn, state, mode);
					if (d.kind === "send") expect(["v_self_destruct", "v_eject", "v_emergency_exit"], `${fn.id}/${state}/${mode}`).not.toContain(d.action);
				}
			}
		}
		expect(combos).toBe(324);
	});
});
