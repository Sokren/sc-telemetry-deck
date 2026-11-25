import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { loadSchema } from "../../src/game/schema.js";
import { streamSchemaTree } from "../../src/game/schema-tree.js";
import type { TelemetryFrame } from "../../src/game/types.js";
import { DebugRecorder, KEPT_EVENTS, MAX_RECORDED_FRAMES } from "../../src/web/debug.js";
import { DESC_PATH } from "../game/fake-server.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8"));

/** Faux hub : on pousse les frames à la main. */
function fakeHub() {
	let listener: ((f: TelemetryFrame, at: number) => void) | undefined;
	return {
		onFrame(l: (f: TelemetryFrame, at: number) => void) {
			listener = l;
			return () => void (listener = undefined);
		},
		push: (f: TelemetryFrame, at: number) => listener?.(f, at),
	};
}

describe("arbre du schéma", () => {
	test("sections du flux et champs optional (portes, vol) ; boucles coupées", () => {
		const tree = streamSchemaTree(loadSchema(fileURLToPath(DESC_PATH)));
		expect(tree.map((f) => f.name)).toEqual(expect.arrayContaining(["vehicle", "actor", "weapons", "events", "turret", "force_feedback"]));
		const state = tree.find((f) => f.name === "vehicle")!.fields!.find((f) => f.name === "state")!;
		expect(state.fields!.find((f) => f.name === "doors")).toMatchObject({ kind: "message", type: "VehicleDoorState", optional: true });
		expect(state.fields!.find((f) => f.name === "lights_enabled")).toEqual({ name: "lights_enabled", type: "bool", kind: "scalar", default: false });
		// Coque : `optional` depuis le build 13273298 (0 distinct de « non envoyé ») → pas de valeur par défaut.
		expect(state.fields!.find((f) => f.name === "health")).toEqual({ name: "health", type: "float", kind: "scalar", optional: true });
		expect(state.fields!.find((f) => f.name === "quantum_travel")).toMatchObject({ kind: "message", type: "VehicleQuantumTravel", optional: true });
		expect(tree.map((f) => f.name)).toEqual(expect.arrayContaining(["header", "game"]));
		expect(state.fields!.find((f) => f.name === "type")).toMatchObject({ kind: "enum", type: "VehicleType", default: "VEHICLE_TYPE_UNSPECIFIED" });
		expect(state.fields!.find((f) => f.name === "doors")).not.toHaveProperty("default");
	});
});

describe("DebugRecorder", () => {
	test("cadence sur la dernière seconde, derniers événements gardés", () => {
		let now = 10_000;
		const hub = fakeHub();
		const r = new DebugRecorder(hub, () => now);
		for (let i = 0; i < 5; i++) hub.push({ actor: {} }, now - 1500 + i * 100); // trop vieilles
		for (let i = 0; i < 17; i++) hub.push({ actor: {} }, now - 900 + i * 50);
		expect(r.framesPerSecond).toBe(17);
		for (let i = 0; i < KEPT_EVENTS + 5; i++) hub.push({ events: { events: [{ type: `E${i}` }] } }, now);
		expect(r.events).toHaveLength(KEPT_EVENTS);
		expect(r.events.at(-1)!.event).toEqual({ type: `E${KEPT_EVENTS + 4}` });
		r.close();
		hub.push({ events: { events: [{ type: "après" }] } }, now);
		expect(r.events.at(-1)!.event.type).not.toBe("après");
	});

	test("numéro de trame (build 13273298) : trames perdues comptées, jeu relancé sans rien compter", () => {
		const hub = fakeHub();
		const r = new DebugRecorder(hub, () => 0);
		hub.push({ actor: {} }, 0);
		expect(r.sequence).toEqual({ last: null, lost: 0, gameTime: null });
		hub.push({ header: { sequence: "10", game_time_unix_ms: "1795629521179" } }, 0);
		hub.push({ header: { sequence: "11" } }, 0);
		hub.push({ header: { sequence: "15" } }, 0); // 12, 13, 14 perdues
		expect(r.sequence).toEqual({ last: 15, lost: 3, gameTime: null });
		hub.push({ header: { sequence: "2", game_time_unix_ms: "1795629521179" } }, 0); // relancé
		hub.push({ header: {} }, 0); // 0 non transmis : rien à compter non plus
		expect(r.sequence).toEqual({ last: 0, lost: 3, gameTime: null });
		hub.push({ header: { sequence: "1", game_time_unix_ms: "1795629521179" } }, 0);
		expect(r.sequence.gameTime).toBe(1795629521179);
	});

	test("enregistrement : start, frames avec t depuis le début, take puis oublié ; un seul à la fois", () => {
		let now = 1000;
		const hub = fakeHub();
		const r = new DebugRecorder(hub, () => now);
		hub.push({ actor: { a: 0 } }, now); // avant : pas gardée
		expect(r.start()).toBe(true);
		expect(r.start()).toBe(false);
		now = 1100;
		hub.push({ actor: { a: 1 } }, now);
		now = 1250;
		hub.push({ vehicle: { v: 2 } }, now);
		expect(r.recording).toEqual({ active: true, frames: 2, ms: 250, full: false });
		const rec = r.take()!;
		expect(rec.frames).toEqual([
			{ t: 100, frame: { actor: { a: 1 } } },
			{ t: 250, frame: { vehicle: { v: 2 } } },
		]);
		expect(rec.durationMs).toBe(250);
		expect(r.take()).toBeUndefined();
		expect(r.recording.active).toBe(false);
	});

	test("plafond : s'arrête seul, garde les frames jusqu'au téléchargement", () => {
		const hub = fakeHub();
		const r = new DebugRecorder(hub, () => 0);
		r.start();
		for (let i = 0; i < MAX_RECORDED_FRAMES + 10; i++) hub.push({ actor: {} }, i);
		expect(r.recording).toMatchObject({ active: false, frames: MAX_RECORDED_FRAMES, full: true });
		expect(r.start()).toBe(false);
		expect(r.take()!.frames).toHaveLength(MAX_RECORDED_FRAMES);
		expect(r.start()).toBe(true);
	});
});

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});

describe("API /api/v1/debug", () => {
	test("toutes les sections du schéma, reçues ou jamais, avec le schéma", async () => {
		const s = await startTestServer({ game: { frames: [titan], holdOpen: true } });
		servers.push(s);
		let r = await s.call("GET", "/api/v1/debug");
		for (let i = 0; i < 40 && !r.body.sections.find((x: { name: string; data: unknown }) => x.name === "vehicle")?.data; i++) {
			await new Promise((ok) => setTimeout(ok, 50));
			r = await s.call("GET", "/api/v1/debug");
		}
		expect(r.status).toBe(200);
		validateResponse("/api/v1/debug", "GET", 200, r.body);
		const vehicle = r.body.sections.find((x: { name: string }) => x.name === "vehicle");
		expect(vehicle).toMatchObject({ stale: false, data: { state: { class_name: titan.vehicle.state.class_name } } });
		expect(vehicle.ageMs).toBeLessThan(3000);
		expect(r.body.sections.find((x: { name: string }) => x.name === "turret")).toEqual({ name: "turret", ageMs: null, stale: true, data: null });
		expect(r.body.schema.map((f: { name: string }) => f.name)).toContain("vehicle");
		expect(r.body.recording).toEqual({ active: false, frames: 0, ms: 0, full: false });
	});

	test("enregistrer puis récupérer ; deux fois → 409 ; rien à récupérer → 404", async () => {
		const s = await startTestServer({ game: null });
		servers.push(s);
		expect((await s.call("DELETE", "/api/v1/debug/recording")).status).toBe(404);
		const start = await s.call("POST", "/api/v1/debug/recording");
		expect(start.status).toBe(200);
		validateResponse("/api/v1/debug/recording", "POST", 200, start.body);
		expect(start.body.active).toBe(true);
		expect((await s.call("POST", "/api/v1/debug/recording")).status).toBe(409);
		const rec = await s.call("DELETE", "/api/v1/debug/recording");
		expect(rec.status).toBe(200);
		validateResponse("/api/v1/debug/recording", "DELETE", 200, rec.body);
		expect(rec.body).toMatchObject({ app: "0.0.0-test", schemaVersion: "test", frames: [] });
	});
});
