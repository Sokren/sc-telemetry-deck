// SPDX-License-Identifier: MPL-2.0
import type { TelemetryFrame } from "../game/types.js";
import type { TelemetryHub } from "../telemetry/hub.js";

/** Plafond d'un enregistrement (~10 min à 17 trames/s) : au-delà il s'arrête seul et garde ce qu'il a. */
export const MAX_RECORDED_FRAMES = 10_000;
/** Événements du jeu gardés pour l'onglet Debug. */
export const KEPT_EVENTS = 100;

export type RecordedFrame = { t: number; frame: TelemetryFrame };
export type DebugEvent = { at: number; event: Record<string, unknown> };

/**
 * Mode debug : suit chaque frame brute du flux (cadence, derniers événements) et enregistre à la demande.
 * Lecture seule : rien n'est jamais envoyé au jeu.
 */
export class DebugRecorder {
	readonly #now: () => number;
	readonly #stop: () => void;
	/** Heures des frames de la dernière seconde (cadence). */
	#recent: number[] = [];
	#events: DebugEvent[] = [];
	#recording: { startedAt: number; frames: RecordedFrame[]; active: boolean } | undefined;
	/** Numéro de la dernière trame (`header.sequence`, build 13273298) et trames sautées depuis le début. */
	#sequence: { last: number | null; lost: number; gameTime: number | null } = { last: null, lost: 0, gameTime: null };

	constructor(hub: Pick<TelemetryHub, "onFrame">, now: () => number = Date.now) {
		this.#now = now;
		this.#stop = hub.onFrame((frame, at) => this.#onFrame(frame, at));
	}

	#onFrame(frame: TelemetryFrame, at: number): void {
		this.#recent.push(at);
		this.#onHeader(frame.header);
		while (this.#recent.length && at - this.#recent[0] > 1000) this.#recent.shift();
		const list = (frame.events as { events?: unknown } | undefined)?.events;
		if (Array.isArray(list)) {
			for (const e of list) if (e && typeof e === "object") this.#events.push({ at, event: e as Record<string, unknown> });
			if (this.#events.length > KEPT_EVENTS) this.#events = this.#events.slice(-KEPT_EVENTS);
		}
		const rec = this.#recording;
		if (rec?.active) {
			rec.frames.push({ t: at - rec.startedAt, frame });
			if (rec.frames.length >= MAX_RECORDED_FRAMES) rec.active = false;
		}
	}

	/**
	 * Numéro de trame : un saut compte les trames perdues ; un numéro qui recule (jeu relancé) repart de zéro sans rien
	 * compter. Les entiers 64 bits arrivent en texte.
	 */
	#onHeader(header: unknown): void {
		const h = header && typeof header === "object" ? (header as Record<string, unknown>) : undefined;
		if (!h) return;
		const n = Number(h.sequence ?? 0);
		if (!Number.isFinite(n)) return;
		const last = this.#sequence.last;
		if (last !== null && n > last + 1) this.#sequence.lost += n - last - 1;
		this.#sequence.last = n;
		const time = Number(h.game_time_unix_ms);
		this.#sequence.gameTime = Number.isFinite(time) && time > 0 ? time : null;
	}

	/** Numéro de la dernière trame, trames perdues, heure du jeu (ms) ; `last: null` si le jeu n'envoie pas d'en-tête. */
	get sequence(): { last: number | null; lost: number; gameTime: number | null } {
		return { ...this.#sequence };
	}

	/** Trames reçues pendant la dernière seconde. */
	get framesPerSecond(): number {
		const now = this.#now();
		return this.#recent.filter((at) => now - at <= 1000).length;
	}

	/** Derniers événements du jeu, du plus ancien au plus récent. */
	get events(): DebugEvent[] {
		return [...this.#events];
	}

	/** État de l'enregistrement : `full` = arrêté seul au plafond, en attente de téléchargement. */
	get recording(): { active: boolean; frames: number; ms: number; full: boolean } {
		const rec = this.#recording;
		if (!rec) return { active: false, frames: 0, ms: 0, full: false };
		const last = rec.frames.at(-1)?.t ?? 0;
		return { active: rec.active, frames: rec.frames.length, ms: rec.active ? this.#now() - rec.startedAt : last, full: !rec.active };
	}

	/** Commence un enregistrement ; faux s'il y en a déjà un (en cours ou pas encore récupéré). */
	start(): boolean {
		if (this.#recording) return false;
		this.#recording = { startedAt: this.#now(), frames: [], active: true };
		return true;
	}

	/** Arrête l'enregistrement et le rend (puis l'oublie) ; `undefined` s'il n'y en a pas. */
	take(): { startedAt: number; durationMs: number; frames: RecordedFrame[] } | undefined {
		const rec = this.#recording;
		if (!rec) return undefined;
		this.#recording = undefined;
		return { startedAt: rec.startedAt, durationMs: rec.active ? this.#now() - rec.startedAt : (rec.frames.at(-1)?.t ?? 0), frames: rec.frames };
	}

	close(): void {
		this.#stop();
	}
}
