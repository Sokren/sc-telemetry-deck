import { describe, expect, test } from "vitest";
import type { AccessLevel, AccessToken, Caller } from "../../src/web/access.js";
import { READ_RIGHTS, capabilitiesOf, describeCaller } from "../../src/web/rights.js";

const CATS = ["spaceship_power", "lights_controller"];
const ext = (level: AccessLevel, over: Partial<AccessToken> = {}): Caller => ({
	kind: "external",
	token: { id: "a", name: "VA", level, lan: false, hash: "0".repeat(64), last4: "abcd", created: "t", ...over },
});

describe("capabilitiesOf", () => {
	test("toutes les clés connues sont présentes, false compris", () => {
		const can = capabilitiesOf(ext("read"), CATS);
		expect(Object.keys(can)).toEqual([
			...READ_RIGHTS,
			"read.debug",
			"actions.lights_controller",
			"actions.spaceship_power",
			"actions.unknown",
			"actions.dangerous",
			"actions.protected",
			"morse.send",
			"views.read",
			"views.edit",
			"views.create",
			"net.lan",
			"admin",
		]);
	});

	test("catégories dédoublonnées et triées", () => {
		const keys = Object.keys(capabilitiesOf(ext("read"), ["b_cat", "a_cat", "b_cat"])).filter((k) => k.endsWith("_cat"));
		expect(keys).toEqual(["actions.a_cat", "actions.b_cat"]);
	});

	test.each([
		["read", false, false],
		["pilot", true, false],
		["pilot_full", true, true],
	] as const)("niveau %s : actions %s, protégées %s", (level, act, prot) => {
		const can = capabilitiesOf(ext(level), CATS);
		for (const k of READ_RIGHTS) expect(can[k]).toBe(true);
		expect(can["read.debug"]).toBe(false);
		for (const k of ["actions.spaceship_power", "actions.lights_controller", "actions.unknown", "actions.dangerous", "morse.send"]) expect(can[k]).toBe(act);
		expect(can["actions.protected"]).toBe(prot);
		expect(can).toMatchObject({ "views.read": false, "views.edit": false, "views.create": false, admin: false });
	});

	test("net.lan suit la case du jeton ; plugin : jamais, vues recopiées", () => {
		expect(capabilitiesOf(ext("read", { lan: true }), CATS)["net.lan"]).toBe(true);
		expect(capabilitiesOf(ext("read"), CATS)["net.lan"]).toBe(false);
		const plg = ext("pilot", { lan: true, plugin: { id: "overlay", views: { read: true, edit: ["v1"], create: false } } });
		expect(capabilitiesOf(plg, CATS)).toMatchObject({ "net.lan": false, "views.read": true, "views.edit": ["v1"], "views.create": false, "actions.dangerous": true });
	});

	test("main et mobile", () => {
		expect(capabilitiesOf({ kind: "main" }, CATS)).toMatchObject({ admin: true, "net.lan": false, "read.debug": true, "actions.protected": true, "views.edit": "all", "views.create": true });
		expect(capabilitiesOf({ kind: "mobile" }, CATS)).toMatchObject({ admin: false, "net.lan": true, "actions.protected": true, "views.edit": "all" });
	});

	test("anonyme : tout faux", () => {
		const can = capabilitiesOf({ kind: "anonymous" }, CATS);
		expect(Object.values(can).every((v) => v === false)).toBe(true);
	});
});

describe("describeCaller", () => {
	test("plugin, externe, main ; jamais de secret", () => {
		const plg = ext("pilot", { name: "Overlay", plugin: { id: "overlay", views: { read: false, edit: false, create: false } } });
		expect(describeCaller(plg, CATS)).toMatchObject({ kind: "plugin", name: "Overlay", plugin: "overlay", level: "pilot", custom: false });
		expect(describeCaller(ext("read"), CATS)).toMatchObject({ kind: "external", name: "VA", plugin: null, level: "read" });
		expect(describeCaller({ kind: "main" }, CATS)).toMatchObject({ kind: "main", name: null, plugin: null, level: null, custom: false });
		expect(describeCaller({ kind: "mobile" }, CATS)).toMatchObject({ kind: "mobile", level: null });
		const text = JSON.stringify(describeCaller(ext("read", { stopped: { until: null } }), CATS));
		for (const s of ["abcd", "0".repeat(64), "\"id\"", "created", "stopped", "hash"]) expect(text).not.toContain(s);
	});
});
