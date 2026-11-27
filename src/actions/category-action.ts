// SPDX-License-Identifier: MPL-2.0
import {
	SingletonAction,
	type Action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyUpEvent,
	type SendToPluginEvent,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { buildDropdown, type ActionGroup } from "../catalog/dropdown.js";
import { labelFor, type Lang } from "../catalog/labels.js";
import type { ActionSource } from "../catalog/source.js";
import { HOLD_ACTIONS, HOLD_MS } from "../game/dangerous.js";
import { failureLog } from "../game/messages.js";
import type { GameApi } from "../game/types.js";
import { renderHoldKey } from "./hold-render.js";

export const TRIGGER_TIMEOUT_MS = 2000;
/** Événement de la source de données du panneau de réglage (`datasource="getActions"`). */
export const DATASOURCE_EVENT = "getActions";

/** Touche reçue à l'appui. */
export type KeyAction = KeyDownEvent<ActionSettings>["action"];

/** Réglages enregistrés par touche. */
export type ActionSettings = { action?: string };

export type CategoryActionDeps = {
	game: GameApi;
	source: ActionSource;
	groups: ActionGroup[];
	lang: () => Lang;
	sendToPropertyInspector: (payload: JsonValue) => Promise<void>;
	log: (msg: string) => void;
};

/**
 * Touche qui déclenche une action du jeu choisie parmi certaines catégories.
 * Chaque action Stream Deck concrète (Actor Action…) ne fait que fixer ses catégories.
 */
export abstract class CategoryAction extends SingletonAction<ActionSettings> {
	/** Appuis maintenus en cours (éjection), par touche. */
	readonly #holds = new Map<string, { timer: ReturnType<typeof setInterval>; done: boolean }>();

	constructor(protected readonly deps: CategoryActionDeps) {
		super();
	}

	override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
		await this.#showTitle(ev.action, ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ActionSettings>): Promise<void> {
		await this.#showTitle(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
		const name = ev.payload.settings.action;
		if (!name) {
			await ev.action.showAlert();
			return;
		}
		await this.pressCommand(ev.action, name);
	}

	/** Envoie une commande du jeu depuis une touche (✔ / ⚠, journal), avec appui maintenu pour l'éjection. */
	protected async pressCommand(action: KeyAction, name: string): Promise<void> {
		// Éjection : rester appuyé HOLD_MS (anneau qui se remplit) ; relâcher avant annule.
		if (HOLD_ACTIONS.has(name)) return this.#startHold(action, name);
		await this.#send(action, name);
	}

	override async onKeyUp(ev: KeyUpEvent<ActionSettings>): Promise<void> {
		const hold = this.#holds.get(ev.action.id);
		if (!hold) return;
		this.#holds.delete(ev.action.id);
		clearInterval(hold.timer);
		// Relâché avant la fin : annulé, image d'origine.
		if (!hold.done && ev.action.isKey()) await ev.action.setImage();
	}

	#startHold(action: KeyAction, name: string): void {
		if (this.#holds.has(action.id)) return;
		const key = action;
		const label = labelFor(name, this.deps.lang());
		const start = Date.now();
		const hold = { done: false, timer: setInterval(() => void tick(), 100) };
		this.#holds.set(action.id, hold);
		const tick = async () => {
			if (hold.done || this.#holds.get(action.id) !== hold) return;
			const elapsed = Date.now() - start;
			if (elapsed < HOLD_MS) {
				await key.setImage(renderHoldKey(label, elapsed / HOLD_MS, HOLD_MS - elapsed));
				return;
			}
			hold.done = true;
			clearInterval(hold.timer);
			await key.setImage();
			await this.#send(key, name);
		};
		void key.setImage(renderHoldKey(label, 0, HOLD_MS));
	}

	async #send(action: KeyAction, name: string): Promise<void> {
		const result = await this.deps.game.trigger(name, TRIGGER_TIMEOUT_MS);
		if (result.ok) {
			await action.showOk();
			return;
		}
		if (result.reason === "UNAVAILABLE") this.deps.source.invalidate();
		this.deps.log(failureLog(name, result));
		await action.showAlert();
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ActionSettings>): Promise<void> {
		const payload = ev.payload;
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
		if (payload.event !== DATASOURCE_EVENT) return;
		const settings = await ev.action.getSettings();
		const { actions } = await this.deps.source.getActions();
		const items = buildDropdown(actions, this.deps.groups, this.deps.lang(), settings.action);
		await this.deps.sendToPropertyInspector({ event: DATASOURCE_EVENT, items });
	}

	async #showTitle(action: Action<ActionSettings>, settings: ActionSettings): Promise<void> {
		if (!action.isKey()) return;
		await action.setTitle(settings.action ? labelFor(settings.action, this.deps.lang()) : "");
	}
}
