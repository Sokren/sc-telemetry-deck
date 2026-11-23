import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { loadSettings } from "../../src/web/config.js";
import { compareVersions, fetchLatestRelease, UpdateChecker } from "../../src/web/update-check.js";
import { startTestServer, validateResponse, type TestServer } from "./harness.js";

describe("compareVersions", () => {
	test("numérique, v devant ignoré, parties manquantes = 0", () => {
		expect(compareVersions("0.3.10", "0.3.9")).toBeGreaterThan(0);
		expect(compareVersions("v0.3.9", "0.3.10")).toBeLessThan(0);
		expect(compareVersions("0.3.10", "v0.3.10")).toBe(0);
		expect(compareVersions("0.4", "0.3.99")).toBeGreaterThan(0);
	});
});

describe("fetchLatestRelease", () => {
	test("lit tag, page et date ; en-tête générique ; réponse inattendue → erreur", async () => {
		const calls: RequestInit[] = [];
		const ok = (async (_u: string, init: RequestInit) => {
			calls.push(init);
			return new Response(JSON.stringify({ tag_name: "v0.3.11", html_url: "https://github.com/x/releases/tag/v0.3.11", published_at: "2026-11-24T10:00:00Z" }));
		}) as unknown as typeof fetch;
		expect(await fetchLatestRelease(ok)).toEqual({ version: "0.3.11", url: "https://github.com/x/releases/tag/v0.3.11", publishedAt: "2026-11-24T10:00:00Z" });
		expect((calls[0].headers as Record<string, string>)["user-agent"]).toBe("sc-telemetry-deck");
		const bad = (async () => new Response("{}")) as unknown as typeof fetch;
		await expect(fetchLatestRelease(bad)).rejects.toThrow();
		const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
		await expect(fetchLatestRelease(down)).rejects.toThrow("503");
	});
});

describe("UpdateChecker", () => {
	afterEach(() => vi.useRealTimers());

	test("disponible / à jour ; erreur garde la dernière réponse connue", async () => {
		let next: () => Promise<{ version: string; url: string; publishedAt: string | null }> = async () => ({ version: "0.3.11", url: "u", publishedAt: null });
		let auto = true;
		const c = new UpdateChecker({ current: "0.3.10", latest: () => next(), auto: () => auto, setAuto: (on) => (auto = on), now: () => 0 });
		expect(c.state.status).toBe("unknown");
		expect(await c.check()).toMatchObject({ status: "available", latest: "0.3.11", current: "0.3.10", url: "u" });
		next = async () => {
			throw new Error("hors ligne");
		};
		expect((await c.check()).status).toBe("available");
		next = async () => ({ version: "0.3.10", url: "u", publishedAt: null });
		expect((await c.check()).status).toBe("up_to_date");
	});

	test("jamais vérifié + erreur → error ; une seule vérification à la fois", async () => {
		let calls = 0;
		const c = new UpdateChecker({
			current: "1.0.0",
			latest: async () => {
				calls++;
				throw new Error("x");
			},
			auto: () => false,
			setAuto: () => {},
		});
		const [a, b] = await Promise.all([c.check(), c.check()]);
		expect(calls).toBe(1);
		expect(a.status).toBe("error");
		expect(b.status).toBe("error");
	});

	test("automatique : au démarrage puis chaque jour ; désactivé → plus rien", async () => {
		vi.useFakeTimers();
		let calls = 0;
		let auto = true;
		const c = new UpdateChecker({
			current: "1.0.0",
			latest: async () => (calls++, { version: "1.0.0", url: "u", publishedAt: null }),
			auto: () => auto,
			setAuto: (on) => (auto = on),
			everyMs: 1000,
		});
		c.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(calls).toBe(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(calls).toBe(2);
		c.setAuto(false);
		await vi.advanceTimersByTimeAsync(5000);
		expect(calls).toBe(2);
		c.stop();
	});
});

let servers: TestServer[] = [];
afterEach(async () => {
	await Promise.all(servers.map((s) => s.close()));
	servers = [];
});

describe("API /api/v1/update", () => {
	test("état, vérifier maintenant, réglage enregistré dans settings.json", async () => {
		const s = await startTestServer({
			game: null,
			extra: { version: "0.3.10", latestRelease: async () => ({ version: "0.3.11", url: "https://github.com/x", publishedAt: null }) },
		});
		servers.push(s);
		const check = await s.call("POST", "/api/v1/update/check");
		expect(check.status).toBe(200);
		validateResponse("/api/v1/update/check", "POST", 200, check.body);
		expect(check.body).toMatchObject({ current: "0.3.10", status: "available", latest: "0.3.11", auto: true });
		const got = await s.call("GET", "/api/v1/update");
		validateResponse("/api/v1/update", "GET", 200, got.body);
		const off = await s.call("PUT", "/api/v1/update", { body: { auto: false } });
		validateResponse("/api/v1/update", "PUT", 200, off.body);
		expect(off.body.auto).toBe(false);
		expect(s.deps.settings.updateCheck).toBe(false);
		expect((await s.call("PUT", "/api/v1/update", { body: { auto: "oui" } })).status).toBe(400);
		expect((await s.call("PUT", "/api/v1/update", { body: { auto: true } })).body.auto).toBe(true);
		expect(s.deps.settings.updateCheck).toBeUndefined();
	});

	test("updateVersion : faire semblant d'être plus vieux (test de la fausse version)", async () => {
		const s = await startTestServer({
			game: null,
			extra: { version: "0.3.10", updateVersion: "0.3.9", latestRelease: async () => ({ version: "0.3.10", url: "u", publishedAt: null }) },
		});
		servers.push(s);
		expect((await s.call("POST", "/api/v1/update/check")).body).toMatchObject({ current: "0.3.9", status: "available", latest: "0.3.10" });
	});
});

describe("réglage updateCheck", () => {
	test("absent = activé ; false gardé ; autre valeur ignorée", () => {
		const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? "/tmp"), "sc-upd-"));
		fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ updateCheck: false }));
		expect(loadSettings(dir).updateCheck).toBe(false);
		fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ updateCheck: "non" }));
		expect(loadSettings(dir)).not.toHaveProperty("updateCheck");
	});
});
