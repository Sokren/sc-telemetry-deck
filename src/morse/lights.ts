// SPDX-License-Identifier: MPL-2.0
/**
 * Lumière qui émet le morse. `flashlight` : la torche du perso, sans état lisible, basculée (`toggle_flashlight`).
 * `ship_lights` : les phares du vaisseau, commandés en allumer / éteindre explicites (`v_lights_on` / `v_lights_off`),
 * donc jamais désynchronisés même s'ils étaient allumés au départ.
 */
export type MorseLight = "flashlight" | "ship_lights";

export const MORSE_LIGHTS: readonly MorseLight[] = ["flashlight", "ship_lights"];

/** Valeur reçue (réglage, API) → lumière ; inconnue ou absente → torche. */
export function morseLight(value: unknown): MorseLight {
	return value === "ship_lights" ? "ship_lights" : "flashlight";
}

/** Interrupteur de la lumière pour le lecteur morse : `on` = allumer, `false` = éteindre. */
export function lightSwitch(light: MorseLight, trigger: (action: string) => Promise<boolean>): (on: boolean) => Promise<boolean> {
	return light === "ship_lights" ? (on) => trigger(on ? "v_lights_on" : "v_lights_off") : () => trigger("toggle_flashlight");
}
