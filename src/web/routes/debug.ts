import type { SchemaField } from "../../game/schema-tree.js";
import type { TelemetryHub } from "../../telemetry/hub.js";
import type { DebugRecorder } from "../debug.js";
import type { Route } from "../http.js";

/** Âge au-delà duquel une section est périmée (comme le reste de l'appli). */
const STALE_MS = 3000;

/** Mode debug : tout le flux brut du jeu, les champs prévus par le schéma, et l'enregistrement. Lecture seule. */
export function debugRoutes(deps: {
	hub: Pick<TelemetryHub, "sections">;
	recorder: DebugRecorder;
	schema: SchemaField[] | null;
	version: string;
	schemaVersion: string;
	now?: () => number;
}): Route[] {
	const now = deps.now ?? Date.now;
	return [
		{
			method: "GET",
			path: "/api/v1/debug",
			handle: async () => {
				const t = now();
				const got = new Map(deps.hub.sections().map((s) => [s.name, s]));
				// Ordre du schéma, puis toute section reçue que le schéma ne connaît pas (jeu plus récent).
				const names = [...(deps.schema ?? []).map((f) => f.name), ...[...got.keys()].filter((n) => !deps.schema?.some((f) => f.name === n))];
				const sections = names.map((name) => {
					const s = got.get(name);
					if (!s) return { name, ageMs: null, stale: true, data: null };
					const ageMs = Math.max(0, t - s.at);
					return { name, ageMs, stale: ageMs >= STALE_MS, data: s.value };
				});
				return {
					status: 200,
					json: {
						app: deps.version,
						schemaVersion: deps.schemaVersion,
						framesPerSecond: deps.recorder.framesPerSecond,
						sections,
						events: deps.recorder.events.map((e) => ({ ageMs: Math.max(0, t - e.at), event: e.event })),
						recording: deps.recorder.recording,
						schema: deps.schema,
					},
				};
			},
		},
		{
			method: "POST",
			path: "/api/v1/debug/recording",
			handle: async () =>
				deps.recorder.start()
					? { status: 200, json: deps.recorder.recording }
					: { status: 409, json: { error: "already_recording" } },
		},
		{
			method: "DELETE",
			path: "/api/v1/debug/recording",
			handle: async () => {
				const rec = deps.recorder.take();
				if (!rec) return { status: 404, json: { error: "not_recording" } };
				return {
					status: 200,
					json: {
						app: deps.version,
						schemaVersion: deps.schemaVersion,
						startedAt: new Date(rec.startedAt).toISOString(),
						durationMs: rec.durationMs,
						frames: rec.frames,
					},
				};
			},
		},
	];
}
