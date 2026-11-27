// SPDX-License-Identifier: MPL-2.0
import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage } from "node:http";
import type { GameApi, TriggerResult } from "../game/types.js";

/** D'où vient une action : onglet de la page, vue, grille, ou l'API (tout appel sans en-tête d'origine). */
export const ORIGINS = ["character", "ship", "view", "grid", "api"] as const;
export type Origin = (typeof ORIGINS)[number];
/** En-tête posé par la page pour dire d'où vient l'appui. */
export const ORIGIN_HEADER = "x-sctd-origin";

/** Actions gardées dans le journal (les plus anciennes sortent). */
export const KEPT_ACTIONS = 200;

export type ActionLogEntry = {
	at: number;
	action: string;
	origin: Origin;
	/** Position du perso à l'envoi (`on_foot`, `seated`, `eva`, `unknown`) et rôle (`pilot`…, `none`). */
	locomotion: string;
	crewRole: string;
	ok: boolean;
	/** Code du jeu ou de la connexion quand ce n'est pas OK (ex. `TRIGGER_GAME_ACTION_STATUS_FAILED`, `DEADLINE_EXCEEDED`). */
	reason?: string;
	message?: string;
	/** Temps de réponse du jeu. */
	ms: number;
};

export function originOf(req: IncomingMessage): Origin {
	const h = req.headers[ORIGIN_HEADER];
	const v = Array.isArray(h) ? h[0] : h;
	return (ORIGINS as readonly string[]).includes(v ?? "") ? (v as Origin) : "api";
}

/**
 * Journal des actions envoyées au jeu par l'appli web (mode debug). `wrap(game)` renvoie un client qui note
 * chaque `trigger` ; l'origine vient de la requête HTTP en cours (`run`). Lecture seule pour le reste.
 */
export class ActionLog {
	readonly #now: () => number;
	readonly #max: number;
	readonly #origin = new AsyncLocalStorage<Origin>();
	#entries: ActionLogEntry[] = [];

	constructor(opts: { now?: () => number; max?: number } = {}) {
		this.#now = opts.now ?? Date.now;
		this.#max = opts.max ?? KEPT_ACTIONS;
	}

	/** Exécute `fn` (traitement d'une requête) en notant que ses actions viennent de `origin`. */
	run<T>(origin: Origin, fn: () => T): T {
		return this.#origin.run(origin, fn);
	}

	/** Client du jeu qui journalise chaque action envoyée ; `position()` : position du perso au moment de l'envoi. */
	wrap<G extends Pick<GameApi, "trigger">>(game: G, position: () => { locomotion: string; crewRole: string }): G {
		const trigger = async (name: string, timeoutMs: number): Promise<TriggerResult> => {
			const start = this.#now();
			const where = position();
			const result = await game.trigger(name, timeoutMs);
			const entry: ActionLogEntry = {
				at: start,
				action: name,
				origin: this.#origin.getStore() ?? "api",
				locomotion: where.locomotion,
				crewRole: where.crewRole,
				ok: result.ok,
				ms: Math.max(0, this.#now() - start),
			};
			if (!result.ok) {
				entry.reason = result.reason;
				if (result.message) entry.message = result.message;
			}
			this.#entries.push(entry);
			if (this.#entries.length > this.#max) this.#entries = this.#entries.slice(-this.#max);
			return result;
		};
		// Les autres méthodes restent celles du vrai client, liées à lui (champs privés #…).
		return new Proxy(game, {
			get: (target, prop) => {
				if (prop === "trigger") return trigger;
				const value = Reflect.get(target, prop, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	}

	/** Du plus ancien au plus récent ; `since` : seulement à partir de cette heure. */
	entries(since = 0): ActionLogEntry[] {
		return this.#entries.filter((e) => e.at >= since);
	}

	clear(): void {
		this.#entries = [];
	}
}
