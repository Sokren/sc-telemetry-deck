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

	constructor(hub: Pick<TelemetryHub, "onFrame">, now: () => number = Date.now) {
		this.#now = now;
		this.#stop = hub.onFrame((frame, at) => this.#onFrame(frame, at));
	}

	#onFrame(frame: TelemetryFrame, at: number): void {
		this.#recent.push(at);
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
