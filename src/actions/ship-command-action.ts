// SPDX-License-Identifier: MPL-2.0
import type {
	Action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	TitleParametersDidChangeEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { SHIP_GROUPS, buildDropdown, type StatefulEntry } from "../catalog/dropdown.js";
import { labelFor } from "../catalog/labels.js";
import { MERGED_COMMANDS, mergedFor } from "../catalog/merged.js";
import { isDangerState, SHIP_FUNCTION_IDS, shipFunction, type ShipFunction, type ShipFunctionId } from "../ship/functions.js";
import { decidePress, type ShipMode } from "../ship/press.js";
import { renderStatefulKey, toShipView, type ShipStyle } from "../ship/render.js";
import { readShipState, type ShipState } from "../ship/state.js";
import type { TelemetryHub } from "../telemetry/hub.js";
import { CategoryAction, DATASOURCE_EVENT, type ActionSettings, type CategoryActionDeps } from "./category-action.js";
import { ThrottledRenderer } from "./throttled-renderer.js";
import { labelWithTitle, readUserTitle, type UserTitle } from "./user-title.js";

/** Image de la touche : avec état (A, B, C) ou « plain » = icône fixe et titre, comme avant la 0.3.14. */
export type ShipImageStyle = ShipStyle | "plain";

/**
 * Réglages de Ship Action : une commande du jeu, ou une fonction `group:…` avec son mode, son image et
 * l'alerte rouge. `function` : réglage des anciennes touches Ship Toggle, converti à l'apparition.
 */
export type ShipCommandSettings = ActionSettings & {
	mode?: ShipMode;
	style?: ShipImageStyle;
	dangerAlert?: boolean;
	function?: string;
};

const MODES: readonly ShipMode[] = ["toggle", "on", "off"];
const STYLES: readonly ShipImageStyle[] = ["text", "led", "fill", "plain"];

/** Fonctions avec état sans les trois commandes : l'ESP (bascule seule) et la croisière (lecture seule). */
const SINGLES: readonly StatefulEntry[] = [
	{ id: "group:esp", fn: "esp", command: "v_ifcs_toggle_esp", category: "spaceship_movement" },
	{ id: "group:cruise", fn: "cruise", category: "spaceship_movement" },
];

/** Fonction avec état désignée par `group:<id>`, sinon `undefined` (commande simple). */
export function stateFunctionOf(action: unknown): ShipFunction | undefined {
	if (typeof action !== "string" || !action.startsWith("group:")) return undefined;
	const id = action.slice("group:".length);
	return (SHIP_FUNCTION_IDS as readonly string[]).includes(id) ? shipFunction(id) : undefined;
}

const modeOf = (s: ShipCommandSettings): ShipMode => (MODES.includes(s.mode as ShipMode) ? (s.mode as ShipMode) : "toggle");
const styleOf = (s: ShipCommandSettings): ShipImageStyle => (STYLES.includes(s.style as ShipImageStyle) ? (s.style as ShipImageStyle) : "text");

/**
 * Réglages convertis à l'apparition : anciennes touches Ship Toggle (`function`) et commandes seules
 * d'une fonction regroupée (ex. `v_lights_on` → Phares / On). `undefined` = rien à changer.
 */
export function convertSettings(s: ShipCommandSettings): ShipCommandSettings | undefined {
	if (s.function !== undefined) {
		const { function: fn, ...rest } = s;
		return { ...rest, action: `group:${shipFunction(fn).id}`, mode: modeOf(s) };
	}
	if (!s.action) return undefined;
	const merged = mergedFor(s.action);
	if (merged) return { ...s, action: merged.group, mode: merged.mode };
	const single = SINGLES.find((one) => one.command === s.action);
	if (single) return { ...s, action: single.id, mode: "toggle" };
	return undefined;
}

export type ShipCommandDeps = Omit<CategoryActionDeps, "groups"> & {
	hub: Pick<TelemetryHub, "subscribe" | "section">;
	renderer?: ThrottledRenderer;
	/** Animations (mouvement, « pop ») ; désactivées dans certains tests. */
	animate?: boolean;
};

/** Durée d'un cycle d'animation de mouvement, et intervalle entre deux images. */
export const MOVE_CYCLE_MS = 1200;
export const MOVE_FRAME_MS = 200;
/** « Pop » au changement d'état : agrandissements successifs du pictogramme, une image toutes les 90 ms. */
export const POP_FRAMES = [1.18, 1.08, 1] as const;
export const POP_FRAME_MS = 90;

type Entry = {
	action: Action<ShipCommandSettings>;
	settings: ShipCommandSettings;
	title?: UserTitle;
	unsubscribe: () => void;
	/** Dernier état lu, pour détecter un changement (« pop ») ou un mouvement. */
	last?: ShipState;
	moveTimer?: ReturnType<typeof setInterval>;
	moveStart: number;
	pop: number;
	popTimer?: ReturnType<typeof setTimeout>;
};

const isMoving = (s: ShipState | undefined) => s === "moving-on" || s === "moving-off";
const isStable = (s: ShipState | undefined) => s === "on" || s === "off";

/**
 * Ship Action : commandes vaisseau et siège. Une fonction avec état (train, phares, VTOL, puissance…)
 * dessine son état sur la touche (pictogramme, mot, couleur, petites animations) et un appui envoie la
 * commande qui mène à l'état voulu. Les commandes simples gardent l'icône fixe et le titre.
 * Actions enregistrées : `ShipAction` (ship-action.ts) et l'ancienne `ShipToggleRegistered`, masquée.
 */
export class ShipCommandAction extends CategoryAction {
	readonly #entries = new Map<string, Entry>();
	readonly #renderer: ThrottledRenderer;
	readonly #hub: ShipCommandDeps["hub"];
	readonly #animate: boolean;

	constructor(deps: ShipCommandDeps) {
		super({ ...deps, groups: SHIP_GROUPS });
		this.#hub = deps.hub;
		this.#renderer = deps.renderer ?? new ThrottledRenderer();
		this.#animate = deps.animate ?? true;
	}

	override async onWillAppear(ev: WillAppearEvent<ShipCommandSettings>): Promise<void> {
		let settings = ev.payload.settings;
		const converted = convertSettings(settings);
		if (converted) {
			settings = converted;
			await ev.action.setSettings(settings);
		}
		const id = ev.action.id;
		this.#drop(id);
		const entry: Entry = { action: ev.action, settings, unsubscribe: () => {}, moveStart: 0, pop: 1 };
		this.#entries.set(id, entry);
		entry.unsubscribe = this.#hub.subscribe(() => void this.#update(id));
		await this.#apply(entry, true);
	}

	override async onWillDisappear(ev: WillDisappearEvent<ShipCommandSettings>): Promise<void> {
		this.#drop(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ShipCommandSettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return this.#title(ev.action, ev.payload.settings);
		const wasStateful = this.#stateful(entry.settings);
		entry.settings = ev.payload.settings;
		entry.last = undefined;
		await this.#apply(entry, !wasStateful);
	}

	override async onTitleParametersDidChange(ev: TitleParametersDidChangeEvent<ShipCommandSettings>): Promise<void> {
		const entry = this.#entries.get(ev.action.id);
		if (!entry) return;
		entry.title = readUserTitle(ev);
		if (this.#stateful(entry.settings)) await this.#render(entry.action.id, true);
	}

	override async onKeyDown(ev: KeyDownEvent<ShipCommandSettings>): Promise<void> {
		const s = ev.payload.settings;
		const fn = stateFunctionOf(s.action);
		if (!fn) {
			if (s.action?.startsWith("group:")) {
				this.deps.log(`Ship Action : regroupement inconnu ${s.action}`);
				await ev.action.showAlert();
				return;
			}
			return super.onKeyDown(ev);
		}
		// L'état fait foi : « Allumer » sur une fonction déjà allumée n'envoie rien.
		const decision = decidePress(fn, this.#read(fn.id), modeOf(s));
		if (decision.kind === "noop") {
			await ev.action.showOk();
			return;
		}
		if (decision.kind === "refuse") {
			this.deps.log(`Ship Action refusé : ${decision.reason}`);
			await ev.action.showAlert();
			return;
		}
		await this.pressCommand(ev.action, decision.action);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ShipCommandSettings>): Promise<void> {
		const p = ev.payload;
		if (typeof p !== "object" || p === null || Array.isArray(p) || p.event !== DATASOURCE_EVENT) return;
		const settings = await ev.action.getSettings();
		const { actions } = await this.deps.source.getActions();
		const items = buildDropdown(actions, this.deps.groups, this.deps.lang(), settings.action, MERGED_COMMANDS, SINGLES);
		await this.deps.sendToPropertyInspector({ event: DATASOURCE_EVENT, items });
	}

	#stateful(s: ShipCommandSettings): boolean {
		return stateFunctionOf(s.action) !== undefined && styleOf(s) !== "plain";
	}

	#read(id: ShipFunctionId): ShipState {
		return readShipState(id, this.#hub.section("vehicle"), this.#hub.section("actor"));
	}

	/** Applique les réglages : image d'état, ou titre + icône fixe. `clearTitle` : effacer un ancien titre. */
	async #apply(entry: Entry, clearTitle: boolean): Promise<void> {
		const { action } = entry;
		if (!this.#stateful(entry.settings)) {
			this.#stopMove(entry);
			this.#renderer.forget(action.id);
			if (action.isKey()) await action.setImage();
			await this.#title(action, entry.settings);
			return;
		}
		// Le libellé est dessiné dans l'image ; un titre saisi par l'utilisateur reste prioritaire.
		if (clearTitle && action.isKey()) await action.setTitle("");
		await this.#update(action.id, true);
	}

	/** Nouvel état lu : lance « pop » ou animation de mouvement si besoin, puis redessine. */
	async #update(id: string, force = false): Promise<void> {
		const entry = this.#entries.get(id);
		if (!entry || !this.#stateful(entry.settings)) return;
		const fn = stateFunctionOf(entry.settings.action)!;
		const state = this.#read(fn.id);
		const previous = entry.last;
		entry.last = state;
		if (this.#animate) {
			if (isMoving(state)) this.#startMove(entry);
			else this.#stopMove(entry);
			if (isStable(state) && previous !== undefined && previous !== state && (isStable(previous) || isMoving(previous))) this.#startPop(entry);
		}
		await this.#render(id, force);
	}

	#startMove(entry: Entry): void {
		if (entry.moveTimer) return;
		entry.moveStart = Date.now();
		entry.moveTimer = setInterval(() => void this.#render(entry.action.id, true), MOVE_FRAME_MS);
	}

	#stopMove(entry: Entry): void {
		if (entry.moveTimer) clearInterval(entry.moveTimer);
		entry.moveTimer = undefined;
	}

	#startPop(entry: Entry): void {
		if (entry.popTimer) clearTimeout(entry.popTimer);
		let i = 0;
		const step = () => {
			entry.pop = POP_FRAMES[i];
			void this.#render(entry.action.id, true);
			i++;
			entry.popTimer = i < POP_FRAMES.length ? setTimeout(step, POP_FRAME_MS) : undefined;
		};
		step();
	}

	#drop(id: string): void {
		const entry = this.#entries.get(id);
		if (!entry) return;
		entry.unsubscribe();
		this.#stopMove(entry);
		if (entry.popTimer) clearTimeout(entry.popTimer);
		this.#entries.delete(id);
		this.#renderer.forget(id);
	}

	#render(id: string, force = false): Promise<void> {
		return this.#renderer.request(
			id,
			() => {
				const entry = this.#entries.get(id);
				if (!entry || !this.#stateful(entry.settings)) return undefined;
				const fn = stateFunctionOf(entry.settings.action)!;
				const state = this.#read(fn.id);
				const view = toShipView(fn.id, state, this.deps.lang());
				const phase = isMoving(state) && entry.moveTimer ? ((Date.now() - entry.moveStart) % MOVE_CYCLE_MS) / MOVE_CYCLE_MS : 0;
				const image = renderStatefulKey(view, styleOf(entry.settings) as ShipStyle, {
					state,
					label: labelWithTitle(entry.title, view.label),
					phase,
					pop: entry.pop,
					danger: entry.settings.dangerAlert !== false && isDangerState(fn.id, state),
				});
				const { action } = entry;
				return { payload: image, send: async () => (action.isKey() ? action.setImage(image) : undefined) };
			},
			force,
		);
	}

	/** Titre (image fixe) : libellé de la commande, ou libellé court de la fonction + mot du mode (rien en bascule). */
	async #title(action: Action<ShipCommandSettings>, s: ShipCommandSettings): Promise<void> {
		if (!action.isKey()) return;
		const lang = this.deps.lang();
		const fn = stateFunctionOf(s.action);
		if (!fn) {
			await action.setTitle(s.action ? labelFor(s.action, lang) : "");
			return;
		}
		const label = toShipView(fn.id, "unknown", lang).label;
		if (s.mode !== "on" && s.mode !== "off") {
			await action.setTitle(label);
			return;
		}
		const word = toShipView(fn.id, s.mode, lang).word;
		await action.setTitle(`${label}\n${word}`);
	}
}
