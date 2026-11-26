import http from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { hostAllowed } from "../../src/web/http.js";
import { startTestServer, type TestServer } from "./harness.js";

let s: TestServer;
beforeAll(async () => {
	s = await startTestServer({ game: null });
});
afterAll(() => s.close());

/** Requête avec un en-tête Host choisi (fetch ne permet pas de le changer). */
function get(path: string, host: string | undefined): Promise<{ status: number; body: string }> {
	const u = new URL(s.url);
	return new Promise((resolve, reject) => {
		const req = http.request(
			{ host: u.hostname, port: u.port, path, method: "GET", setHost: false, headers: { ...(host === undefined ? {} : { host }), authorization: `Bearer ${s.token}` } },
			(res) => {
				let body = "";
				res.on("data", (c) => (body += c));
				res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
			},
		);
		req.on("error", reject);
		req.end();
	});
}

describe("en-tête Host (rebinding DNS)", () => {
	test.each(["evil.example:8743", "evil.example", "127.0.0.1.evil.example", "localhost.evil.example:80"])("nom de domaine %s → 403 bad_host", async (host) => {
		const r = await get("/api/v1/status", host);
		expect(r.status).toBe(403);
		expect(JSON.parse(r.body)).toEqual({ error: "bad_host" });
	});

	test("page et fichiers statiques aussi protégés", async () => {
		expect((await get("/", "evil.example")).status).toBe(403);
	});

	test("sans en-tête Host → refusé (400 de Node, sinon 403)", async () => {
		expect([400, 403]).toContain((await get("/api/v1/status", undefined)).status);
	});

	test.each(["127.0.0.1:8743", "localhost:8743", "localhost", "LOCALHOST:1", "192.168.0.10:8743", "[::1]:8743", "10.0.0.5"])("%s → accepté", async (host) => {
		expect((await get("/api/v1/status", host)).status).toBe(200);
	});

	test("hostAllowed : cas limites", () => {
		expect(hostAllowed("999.1.1.1")).toBe(false);
		expect(hostAllowed("127.0.0.1:99999")).toBe(false);
		expect(hostAllowed("[::1]")).toBe(true);
		expect(hostAllowed("[fe80::1%25eth0]:80")).toBe(false);
		expect(hostAllowed("")).toBe(false);
	});
});
