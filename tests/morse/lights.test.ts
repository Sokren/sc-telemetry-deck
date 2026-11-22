import { describe, expect, test } from "vitest";
import { lightSwitch, morseLight } from "../../src/morse/lights.js";
import { MorsePlayer } from "../../src/morse/player.js";

describe("lumière du morse", () => {
	test("valeur inconnue ou absente → torche", () => {
		expect(morseLight(undefined)).toBe("flashlight");
		expect(morseLight("phares")).toBe("flashlight");
		expect(morseLight("ship_lights")).toBe("ship_lights");
	});

	test("torche : bascule ; phares : allumer / éteindre explicites", async () => {
		const sent: string[] = [];
		const trigger = async (a: string) => (sent.push(a), true);
		await lightSwitch("flashlight", trigger)(true);
		await lightSwitch("flashlight", trigger)(false);
		await lightSwitch("ship_lights", trigger)(true);
		await lightSwitch("ship_lights", trigger)(false);
		expect(sent).toEqual(["toggle_flashlight", "toggle_flashlight", "v_lights_on", "v_lights_off"]);
	});

	test("lecteur : lumière choisie pour une émission, éteinte à l'arrêt", async () => {
		const sent: string[] = [];
		let t = 0;
		const player = new MorsePlayer(async () => (sent.push("défaut"), true), async (ms) => void (t += ms), () => t);
		expect(await player.play([0, 100, 200, 300], lightSwitch("ship_lights", async (a) => (sent.push(a), true)))).toBe("done");
		expect(sent).toEqual(["v_lights_on", "v_lights_off", "v_lights_on", "v_lights_off"]);
		sent.length = 0;
		// Échec au milieu (phares restés allumés) : éteints une fois.
		let n = 0;
		expect(await player.play([0, 100, 200], lightSwitch("ship_lights", async (a) => (sent.push(a), ++n < 2 || a === "v_lights_off" && n > 2)))).toBe("failed");
		expect(sent).toEqual(["v_lights_on", "v_lights_off", "v_lights_off"]);
	});
});
