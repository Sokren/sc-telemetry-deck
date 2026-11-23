import { afterEach, describe, expect, test } from "vitest";
import type { TriggerResult } from "../../src/game/types.js";
import { ActionLog, KEPT_ACTIONS } from "../../src/web/action-log.js";
import type { TriggerRequest } from "../game/fake-server.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

/** Faux client : OK sauf pour « refus », et une méthode qui lit un champ privé (doit rester liée au vrai objet). */
class FakeGame {
	#calls = 0;
	async trigger(name: string, _timeoutMs: number): Promise<TriggerResult> {
		this.#calls++;
		return name === "refus" ? { ok: false, reason: "TRIGGER_GAME_ACTION_STATUS_FILTERED" } : { ok: true };
	}
	get calls() {
		return this.#calls;
	}
	count() {
		return this.#calls;
	}
}

describe("ActionLog", () => {
	test("note chaque envoi : origine, position, résultat, durée ; les autres méthodes restent celles du client", async () => {
		let now = 1000;
		const log = new ActionLog({ now: () => now });
		const raw = new FakeGame();
		const game = log.wrap(raw, () => ({ locomotion: "seated", crewRole: "pilot" }));
		await log.run("character", () => game.trigger("visor_wipe", 100));
		now = 1050;
		await game.trigger("refus", 100);
		expect(game.count()).toBe(2);
		expect(log.entries()).toEqual([
			{ at: 1000, action: "visor_wipe", origin: "character", locomotion: "seated", crewRole: "pilot", ok: true, ms: 0 },
			{ at: 1050, action: "refus", origin: "api", locomotion: "seated", crewRole: "pilot", ok: false, reason: "TRIGGER_GAME_ACTION_STATUS_FILTERED", ms: 0 },
		]);
		expect(log.entries(1010).map((e) => e.action)).toEqual(["refus"]);
		log.clear();
		expect(log.entries()).toEqual([]);
	});

	test("garde seulement les dernières", async () => {
		const log = new ActionLog({ max: 3 });
		const game = log.wrap(new FakeGame(), () => ({ locomotion: "on_foot", crewRole: "none" }));
		for (const n of ["a", "b", "c", "d"]) await game.trigger(n, 100);
		expect(log.entries().map((e) => e.action)).toEqual(["b", "c", "d"]);
		expect(KEPT_ACTIONS).toBe(200);
	});
});

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});

describe("API : journal des actions du mode debug", () => {
	test("origine de la page (en-tête) ou API, raison du refus, libellé ; vider", async () => {
		const sent: TriggerRequest[] = [];
		const s = await startTestServer({ game: { trigger: (r) => (sent.push(r), r.action_name === "mobiglas" ? { status: 3 } : { status: 1 }) } });
		servers.push(s);
		await s.call("POST", "/api/v1/actions/visor_wipe/trigger", { headers: { "x-sctd-origin": "character" } });
		await s.call("POST", "/api/v1/actions/mobiglas/trigger");
		await s.call("POST", "/api/v1/actions/emote_wave/trigger", { headers: { "x-sctd-origin": "n'importe quoi" } });
		const r = await s.call("GET", "/api/v1/debug?lang=fr");
		validateResponse("/api/v1/debug", "GET", 200, r.body);
		const list = r.body.actions as { action: string; origin: string; ok: boolean; reason?: string; label: string }[];
		expect(list.map((a) => [a.action, a.origin, a.ok])).toEqual([
			["emote_wave", "api", true],
			["mobiglas", "api", false],
			["visor_wipe", "character", true],
		]);
		expect(list[1].reason).toMatch(/^TRIGGER_GAME_ACTION_STATUS_|^STATUS_3$/);
		expect(list[2].label).toBe("Essuyer la visière");
		expect(sent).toHaveLength(3);
		expect((await s.call("DELETE", "/api/v1/debug/actions")).status).toBe(204);
		expect((await s.call("GET", "/api/v1/debug")).body.actions).toEqual([]);
	});

	test("l'enregistrement contient les actions envoyées pendant qu'il tournait", async () => {
		const s = await startTestServer({ game: {} });
		servers.push(s);
		await s.call("POST", "/api/v1/actions/emote_wave/trigger");
		await s.call("POST", "/api/v1/debug/recording");
		await s.call("POST", "/api/v1/actions/visor_wipe/trigger", { headers: { "x-sctd-origin": "view" } });
		const rec = await s.call("DELETE", "/api/v1/debug/recording?lang=en");
		validateResponse("/api/v1/debug/recording", "DELETE", 200, rec.body);
		expect(rec.body.actions.map((a: { action: string; origin: string; label: string }) => [a.action, a.origin, a.label])).toEqual([["visor_wipe", "view", "Wipe visor"]]);
	});
});
