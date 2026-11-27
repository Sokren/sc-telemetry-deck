// SPDX-License-Identifier: MPL-2.0
export type PlayResult = "done" | "stopped" | "failed";

/** Allume (`true`) ou éteint (`false`) la lumière ; une torche sans état lisible se contente de basculer. */
export type LightSwitch = (on: boolean) => Promise<boolean>;

/**
 * Exécute des bascules de lumière à des instants donnés, sur une horloge absolue (la durée des
 * appels au jeu ne décale pas la suite). Une seule émission à la fois ; arrêtable. À l'arrêt ou en
 * cas d'échec, si la lumière est restée allumée, elle est éteinte une fois.
 */
export class MorsePlayer {
	#abort: AbortController | undefined;

	constructor(
		private readonly toggle: LightSwitch,
		private readonly wait: (ms: number, signal: AbortSignal) => Promise<void>,
		private readonly now: () => number = Date.now,
	) {}

	get playing(): boolean {
		return this.#abort !== undefined;
	}

	stop(): void {
		this.#abort?.abort();
	}

	/**
	 * `light` : autre lumière que celle par défaut (ex. phares du vaisseau) pour cette émission.
	 * `onToggle(i)` : après chaque bascule prévue réussie (`i` = indice dans `times`), pas après la remise à l'arrêt.
	 */
	async play(times: number[], light: LightSwitch = this.toggle, onToggle?: (index: number) => void): Promise<PlayResult> {
		const abort = new AbortController();
		this.#abort = abort;
		const start = this.now();
		let lit = false;
		let result: PlayResult = "done";
		try {
			for (const [index, at] of times.entries()) {
				const delay = start + at - this.now();
				// Arrêt déjà demandé (pendant la bascule précédente) : ne pas attendre un signal passé.
				if (delay > 0 && !abort.signal.aborted) await this.wait(delay, abort.signal);
				if (abort.signal.aborted) {
					result = "stopped";
					break;
				}
				if (!(await light(!lit))) {
					result = "failed";
					break;
				}
				lit = !lit;
				onToggle?.(index);
			}
			if (lit) await light(false);
			return result;
		} finally {
			this.#abort = undefined;
		}
	}
}
