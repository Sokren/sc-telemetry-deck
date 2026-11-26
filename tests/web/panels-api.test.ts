import fs from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8"));

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});
async function start(inShip: boolean) {
	const s = await startTestServer({ game: inShip ? { frames: [titan], holdOpen: true } : null });
	servers.push(s);
	if (inShip) for (let i = 0; i < 40 && (await s.call("GET", "/api/v1/telemetry/vehicle")).status !== 200; i++) await new Promise((r) => setTimeout(r, 50));
	return s;
}

describe("GET /api/v1/character", () => {
	test("au siège pilote : position, rôle, constantes ; conforme au contrat", async () => {
		const s = await start(true);
		const r = await s.call("GET", "/api/v1/character?lang=fr");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/character", "GET", 200, r.body);
		expect(r.body).toMatchObject({ available: true, locomotion: "seated", crewRoleLabel: "Pilote" });
		expect(r.body.vitals).toHaveLength(13);
	});

	test("jeu fermé : indisponible", async () => {
		const s = await start(false);
		const r = await s.call("GET", "/api/v1/character?lang=en");
		validateResponse("/api/v1/character", "GET", 200, r.body);
		expect(r.body).toMatchObject({ available: false, locomotionLabel: "—" });
	});
});

describe("GET /api/v1/ship/status", () => {
	test("Titan : nom, instruments, voyants ; conforme au contrat", async () => {
		const s = await start(true);
		const r = await s.call("GET", "/api/v1/ship/status?lang=en");
		expect(r.status).toBe(200);
		validateResponse("/api/v1/ship/status", "GET", 200, r.body);
		expect(r.body).toMatchObject({ available: true, name: "Avenger Titan", landed: true, masterModeLabel: "SCM" });
		expect(r.body.instruments).toHaveLength(15);
		expect(r.body.annunciators).toHaveLength(10);
	});

	test("jeu fermé : indisponible, conforme au contrat", async () => {
		const s = await start(false);
		const r = await s.call("GET", "/api/v1/ship/status");
		validateResponse("/api/v1/ship/status", "GET", 200, r.body);
		expect(r.body.available).toBe(false);
	});
});

describe("données du build 13273298 (trame encodée avec le schéma, de bout en bout)", () => {
	const frame = structuredClone(titan);
	frame.vehicle.state.quantum_travel = {
		state: "QUANTUM_TRAVEL_STATE_TRAVELING",
		spool_ratio: 1,
		calibration_ratio: 1,
		destination: { id: "arccorp", display_name: "ArcCorp" },
		eta_seconds: 84,
		remaining_distance_m: 12_700_000_000,
	};
	Object.assign(frame.actor.state, {
		operator_mode: "ACTOR_OPERATOR_MODE_QUANTUM_NAVIGATION",
		player_name: "Pilote_42",
		crime_stat: 1,
		location: { hierarchy: [{ id: "stanton", display_name: "Stanton" }], armistice_zone: true },
		tracked_contract: { revision: 1, details: { title: "Livraison", objectives_completed: 1, objectives_total: 3, ends_at_unix_ms: "1795629521179" } },
	});
	frame.header = { sequence: "12", game_time_unix_ms: "1795629521179" };
	frame.game = { state: "GAME_STATE_IN_GAME", menu_open: true, debug: { fps: 58, frame_time_ms: 17.2, network: { ping_ms: 38 } } };

	test("perso, vaisseau et jeu conformes au contrat", async () => {
		const s = await startTestServer({ game: { frames: [frame], holdOpen: true } });
		servers.push(s);
		for (let i = 0; i < 40 && (await s.call("GET", "/api/v1/telemetry/vehicle")).status !== 200; i++) await new Promise((r) => setTimeout(r, 50));
		const c = await s.call("GET", "/api/v1/character?lang=fr");
		validateResponse("/api/v1/character", "GET", 200, c.body);
		expect(c.body).toMatchObject({ playerName: "Pilote_42", mode: "quantum_navigation", place: "Stanton", armistice: true, crimeStat: 1 });
		expect(c.body.mission).toEqual({ title: "Livraison", giver: null, objective: null, done: 1, total: 3, endsAt: 1795629521179 });
		const v = await s.call("GET", "/api/v1/ship/status?lang=fr");
		validateResponse("/api/v1/ship/status", "GET", 200, v.body);
		expect(v.body.quantum).toMatchObject({ state: "traveling", destination: "ArcCorp", etaText: "1 min 24 s", distanceText: "12,7 Gm" });
		const g = await s.call("GET", "/api/v1/game?lang=fr");
		validateResponse("/api/v1/game", "GET", 200, g.body);
		expect(g.body).toMatchObject({ available: true, state: "in_game", label: "En jeu", menuOpen: true });
		expect(g.body.perf).toMatchObject({ fps: 58, pingMs: 38, vramUsedMb: null });
	});

	test("jeu fermé : état du jeu indisponible, conforme au contrat", async () => {
		const s = await startTestServer({ game: null });
		servers.push(s);
		const g = await s.call("GET", "/api/v1/game");
		validateResponse("/api/v1/game", "GET", 200, g.body);
		expect(g.body).toEqual({ available: false, state: "unknown", label: "—", menuOpen: false, mode: null, perf: null });
	});
});
