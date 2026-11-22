import {
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { normalizeText, progressAt, progressLines, toSigns, toToggleTimes, type MorseProgress } from "../morse/encode.js";
import { lightSwitch, morseLight, type MorseLight } from "../morse/lights.js";
import type { MorsePlayer } from "../morse/player.js";

/** Réglages enregistrés par touche (les champs du panneau peuvent arriver en texte). */
export type MorseSettings = { text?: string; unitMs?: number; repeat?: number; light?: string };

const DEFAULTS = { text: "SOS", unitMs: 400, repeat: 1 };

function bounded(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
	return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

export function readSettings(s: MorseSettings): { text: string; unitMs: number; repeat: number; light: MorseLight } {
	return {
		text: typeof s.text === "string" && s.text.trim() !== "" ? s.text : DEFAULTS.text,
		unitMs: bounded(s.unitMs, 100, 2000, DEFAULTS.unitMs),
		repeat: bounded(s.repeat, 1, 10, DEFAULTS.repeat),
		// Touches existantes (sans réglage) : la torche, comme avant.
		light: morseLight(s.light),
	};
}

/** Titre de la touche pendant l'envoi : lettre en cours, son code (signe allumé en gros), tour si répété. */
export function progressTitle(p: MorseProgress): string {
	const [letter, code] = progressLines(p);
	return [letter, code, p.rounds > 1 ? `${p.round}/${p.rounds}` : ""].filter(Boolean).join("\n");
}

/** `trigger` : envoie une action au jeu (phares du vaisseau) ; absent → seulement la lumière par défaut du lecteur. */
export type MorseActionDeps = { player: MorsePlayer; log: (msg: string) => void; trigger?: (action: string) => Promise<boolean> };

/**
 * Fait clignoter la torche, ou les phares du vaisseau, en morse. Un appui pendant une émission (sur n'importe quelle touche Morse) l'arrête.
 * L'action enregistrée auprès de Stream Deck est `MorseCodeAction` (morse-code-action.ts).
 */
export class MorseAction extends SingletonAction<MorseSettings> {
	constructor(private readonly deps: MorseActionDeps) {
		super();
	}

	override async onWillAppear(ev: WillAppearEvent<MorseSettings>): Promise<void> {
		if (ev.action.isKey()) await ev.action.setTitle(normalizeText(readSettings(ev.payload.settings).text));
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<MorseSettings>): Promise<void> {
		if (ev.action.isKey()) await ev.action.setTitle(normalizeText(readSettings(ev.payload.settings).text));
	}

	override async onKeyDown(ev: KeyDownEvent<MorseSettings>): Promise<void> {
		const { player } = this.deps;
		if (player.playing) {
			player.stop();
			return;
		}
		const { text, unitMs, repeat, light } = readSettings(ev.payload.settings);
		const times = toToggleTimes(text, unitMs, repeat);
		const title = normalizeText(text);
		if (times.length === 0) {
			await ev.action.showAlert();
			return;
		}
		// Pendant l'envoi, le titre suit la lettre et le signe en cours (envoyé sans attendre : l'horloge du morse ne doit pas attendre Stream Deck).
		const signs = toSigns(text, repeat);
		const onToggle = (i: number) => {
			const p = progressAt(signs, i, repeat);
			if (p) void ev.action.setTitle(progressTitle(p)).catch(() => undefined);
		};
		// Démarrer avant tout await : un 2e appui immédiat voit déjà `playing` et arrête au lieu de relancer.
		const switchLight = light === "ship_lights" && this.deps.trigger ? lightSwitch(light, this.deps.trigger) : undefined;
		const starting = ev.action.setTitle(`● ${title}`); // envoyé avant la première lettre
		const run = player.play(times, switchLight, onToggle);
		await starting;
		const result = await run;
		await ev.action.setTitle(title);
		if (result === "done") await ev.action.showOk();
		if (result === "failed") {
			this.deps.log(
				light === "ship_lights"
					? `Morse « ${title} » interrompu : les phares n'ont pas pu être commandés (assis dans un vaisseau, jeu en 5.0 ?)`
					: `Morse « ${title} » interrompu : la torche n'a pas pu être basculée (jeu lancé, perso spawné ?)`,
			);
			await ev.action.showAlert();
		}
	}
}
