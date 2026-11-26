import { describe, expect, test } from "vitest";
import { clockText, distanceText, durationText, readGame, readQuantum, readWhereabouts } from "../../src/display/situation.js";

// Trames construites d'après le schéma 5.0 PTU build 13273298 (enums en texte, int64 en chaîne, zéros non transmis).
const seated = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_SEATED" } };
const onFoot = { state: { locomotion: "ACTOR_LOCOMOTION_STATE_ON_FOOT" } };
const vehicleWith = (quantum_travel: unknown) => ({ state: { name: "Titan", quantum_travel } });

describe("formats", () => {
	test("distance : m, km, Mm, Gm ; une décimale sous 100", () => {
		expect(distanceText(850.4, "fr")).toBe("850 m");
		expect(distanceText(12_400, "fr")).toBe("12,4 km");
		expect(distanceText(3_200_000, "en")).toBe("3.2 Mm");
		expect(distanceText(12_700_000_000, "fr")).toBe("12,7 Gm");
		expect(distanceText(150_000_000_000, "fr")).toBe("150 Gm");
		expect(distanceText(-5, "fr")).toBe("0 m");
	});
	test("durées : longue et courte", () => {
		expect(durationText(45)).toBe("45 s");
		expect(durationText(84)).toBe("1 min 24 s");
		expect(durationText(4320)).toBe("1 h 12 min");
		expect(clockText(45)).toBe("0:45");
		expect(clockText(84)).toBe("1:24");
		expect(clockText(4325)).toBe("1:12:05");
	});
});

describe("readQuantum", () => {
	test("en saut : état, destination, ETA, distance", () => {
		const q = readQuantum(
			vehicleWith({
				state: "QUANTUM_TRAVEL_STATE_TRAVELING",
				spool_ratio: 1,
				calibration_ratio: 1,
				destination: { id: "arccorp", display_name: "ArcCorp" },
				eta_seconds: 84,
				remaining_distance_m: 12_700_000_000,
			}),
			seated,
			"fr",
		);
		expect(q).toEqual({
			state: "traveling",
			label: "En saut",
			spool: 100,
			calibration: 100,
			destination: "ArcCorp",
			etaSeconds: 84,
			etaText: "1 min 24 s",
			distanceM: 12_700_000_000,
			distanceText: "12,7 Gm",
		});
	});
	test("prêt : zéros non transmis, champs optional absents → inconnus", () => {
		const q = readQuantum(vehicleWith({ state: "QUANTUM_TRAVEL_STATE_IDLE", spool_ratio: 1 }), seated, "en");
		expect(q).toMatchObject({ state: "idle", label: "Ready", spool: 100, calibration: 0, destination: null, etaSeconds: null, etaText: "—", distanceM: null, distanceText: "—" });
	});
	test("état inconnu toléré ; pas assis, pas envoyé ou pas de vaisseau → null", () => {
		expect(readQuantum(vehicleWith({ state: "QUANTUM_TRAVEL_STATE_WARP_9" }), seated, "fr")?.state).toBe("unknown");
		expect(readQuantum(vehicleWith({ state: "QUANTUM_TRAVEL_STATE_IDLE" }), onFoot, "fr")).toBeNull();
		expect(readQuantum({ state: { name: "Titan" } }, seated, "fr")).toBeNull();
		expect(readQuantum(undefined, seated, "fr")).toBeNull();
	});
});

describe("readWhereabouts", () => {
	const actor = {
		state: {
			locomotion: "ACTOR_LOCOMOTION_STATE_SEATED",
			operator_mode: "ACTOR_OPERATOR_MODE_MINING",
			player_name: "Pilote_42",
			crime_stat: 2,
			location: {
				hierarchy: [{ id: "stanton", display_name: "Stanton" }, { id: "hurston", display_name: "Hurston" }, { id: "lorville" }],
				jurisdiction: { id: "hd", display_name: "Hurston Dynamics" },
				armistice_zone: true,
			},
			tracked_contract: {
				revision: 3,
				details: {
					contract_id: "c1",
					title: "Élimination de primes",
					giver_name: "Hurston Security",
					current_objective: { text: "Rejoindre le point de navigation" },
					objectives_completed: 2,
					objectives_total: 5,
					ends_at_unix_ms: "1795629521179",
				},
			},
		},
	};
	test("tout envoyé", () => {
		expect(readWhereabouts(actor, "fr")).toEqual({
			playerName: "Pilote_42",
			mode: "mining",
			modeLabel: "Minage",
			location: ["Stanton", "Hurston", "lorville"],
			place: "lorville",
			jurisdiction: "Hurston Dynamics",
			armistice: true,
			crimeStat: 2,
			mission: {
				title: "Élimination de primes",
				giver: "Hurston Security",
				objective: "Rejoindre le point de navigation",
				done: 2,
				total: 5,
				endsAt: 1795629521179,
			},
		});
		expect(readWhereabouts(actor, "en").modeLabel).toBe("Mining");
	});
	test("perso présent, nouveaux champs absents : CrimeStat 0, le reste inconnu", () => {
		expect(readWhereabouts(onFoot, "fr")).toEqual({
			playerName: null,
			mode: "unknown",
			modeLabel: "—",
			location: [],
			place: null,
			jurisdiction: null,
			armistice: null,
			crimeStat: 0,
			mission: null,
		});
	});
	test("lieu sans armistice (faux non transmis) ; mission sans détails ; pas de perso", () => {
		const w = readWhereabouts({ state: { location: { hierarchy: [] }, tracked_contract: { revision: 1 }, operator_mode: "ACTOR_OPERATOR_MODE_NEW" } }, "fr");
		expect(w).toMatchObject({ armistice: false, mission: null, mode: "unknown" });
		expect(readWhereabouts(undefined, "fr")).toMatchObject({ crimeStat: null, armistice: null, mode: "unknown" });
	});
});

describe("readGame", () => {
	test("en jeu, menu ouvert, performances", () => {
		const g = readGame(
			{
				state: "GAME_STATE_IN_GAME",
				menu_open: true,
				game_mode: "SC_Default",
				debug: {
					fps: 58,
					frame_time_ms: 17.2,
					main_thread_ms: 14.1,
					render_thread_ms: 9.8,
					gpu_ms: 12.3,
					vram: { used_mb: 9600, budget_mb: 11468 },
					network: { ping_ms: 38, bits_per_second_in: 1_200_000, bits_per_second_out: 300_000 },
					server: { fps: 22, max_frame_time_ms: 120, hitch_count: 3 },
					universe_time_unix_ms: "1795629521179",
					shard_name: "EUW-01 #034",
				},
			},
			"fr",
		);
		expect(g).toMatchObject({ state: "in_game", label: "En jeu", menuOpen: true, mode: "SC_Default" });
		expect(g?.perf).toEqual({
			fps: 58,
			frameMs: 17.2,
			mainMs: 14.1,
			renderMs: 9.8,
			gpuMs: 12.3,
			vramUsedMb: 9600,
			vramBudgetMb: 11468,
			pingMs: 38,
			lossPercent: 0,
			inBps: 1_200_000,
			outBps: 300_000,
			serverFps: 22,
			serverMaxMs: 120,
			hitches: 3,
			shard: "EUW-01 #034",
			shardId: null,
		});
	});
	test("menu principal sans debug ; état inconnu ; section absente → null", () => {
		expect(readGame({ state: "GAME_STATE_FRONT_END" }, "en")).toEqual({ state: "front_end", label: "Main menu", menuOpen: false, mode: null, perf: null });
		expect(readGame({}, "fr")).toMatchObject({ state: "unknown", label: "—" });
		expect(readGame(undefined, "fr")).toBeNull();
	});
});
