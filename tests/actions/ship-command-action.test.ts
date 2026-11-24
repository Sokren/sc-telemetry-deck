import fs from "node:fs";
import type {
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SendToPluginEvent,
	TitleParametersDidChangeEvent,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convertSettings, ShipCommandAction, stateFunctionOf, type ShipCommandSettings } from "../../src/actions/ship-command-action.js";
import { ActionSource, readSnapshot } from "../../src/catalog/source.js";
import type { GameApi, TriggerResult } from "../../src/game/types.js";

type Obj = Record<string, unknown>;
const snapshot = readSnapshot(new URL("../../schema/actions.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const titan = JSON.parse(fs.readFileSync(new URL("../fixtures/titan-pilote.json", import.meta.url), "utf-8")) as { vehicle: Obj; actor: Obj };

class FakeHub {
	listeners = new Set<() => void>();
	sections: Record<string, Obj | undefined> = { vehicle: titan.vehicle, actor: titan.actor };
	subscribe(l: () => void) {
		this.listeners.add(l);
		return () => void this.listeners.delete(l);
	}
	section(name: string) {
		return this.sections[name];
	}
	emit() {
		for (const l of [...this.listeners]) l();
	}
}

class FakeKey {
	calls: string[] = [];
	images: string[] = [];
	constructor(
		public settings: ShipCommandSettings = {},
		public id = "k1",
	) {}
	isKey() {
		return true;
	}
	async setTitle(t?: string) {
		this.calls.push(`title:${t ?? ""}`);
	}
	async setImage(img?: string) {
		if (img) this.images.push(decodeURIComponent(img));
		this.calls.push(img ? "image" : "image:default");
	}
	async setSettings(s: ShipCommandSettings) {
		this.settings = s;
		this.calls.push(`settings:${JSON.stringify(s)}`);
	}
	async getSettings() {
		return this.settings;
	}
	async showOk() {
		this.calls.push("ok");
	}
	async showAlert() {
		this.calls.push("alert");
	}
}

let hub: FakeHub;
let triggered: string[];
let result: TriggerResult;
let logs: string[];
let toPI: JsonValue[];
let action: ShipCommandAction;

function make(animate = false) {
	const game: GameApi = {
		listActions: async () => snapshot,
		trigger: async (name): Promise<TriggerResult> => (triggered.push(name), result),
		openStream: () => ({ cancel() {} }),
		close() {},
	};
	return new ShipCommandAction({
		hub,
		game,
		source: new ActionSource(game, () => snapshot),
		lang: () => "fr",
		sendToPropertyInspector: async (p) => void toPI.push(p),
		log: (m) => void logs.push(m),
		animate,
	});
}

beforeEach(() => {
	hub = new FakeHub();
	triggered = [];
	result = { ok: true };
	logs = [];
	toPI = [];
	action = make();
});

const ev = <T>(key: FakeKey) => ({ action: key, payload: { settings: key.settings } }) as unknown as T;
const appear = (key: FakeKey) => action.onWillAppear(ev<WillAppearEvent<ShipCommandSettings>>(key));
const press = (key: FakeKey) => action.onKeyDown(ev<KeyDownEvent<ShipCommandSettings>>(key));
const titled = (key: FakeKey, title: string, showTitle: boolean) =>
	action.onTitleParametersDidChange({ action: key, payload: { settings: key.settings, title, titleParameters: { showTitle } } } as unknown as TitleParametersDidChangeEvent<ShipCommandSettings>);
const flush = () => new Promise((r) => setTimeout(r, 0));
const retracted = () => {
	const v = structuredClone(titan.vehicle) as { state: { flight: { state: Obj } } };
	v.state.flight.state.gear = "VEHICLE_COMPONENT_DEPLOYMENT_STATE_RETRACTED";
	return v;
};

describe("appui", () => {
	test.each<[string | undefined, string]>([
		["on", "v_lights_on"],
		["toggle", "v_lights_on"],
		[undefined, "v_lights_on"],
	])("Phares éteints, mode %s → %s", async (mode, expected) => {
		const key = new FakeKey({ action: "group:lights", mode: mode as ShipCommandSettings["mode"] });
		await press(key);
		expect(triggered).toEqual([expected]);
		expect(key.calls).toEqual(["ok"]);
	});

	test("Phares déjà éteints, mode Off → rien envoyé, ✔", async () => {
		const key = new FakeKey({ action: "group:lights", mode: "off" });
		await press(key);
		expect(triggered).toEqual([]);
		expect(key.calls).toEqual(["ok"]);
	});

	test("hors du vaisseau (état inconnu) → la commande du mode, comme avant", async () => {
		hub.sections.vehicle = undefined;
		await press(new FakeKey({ action: "group:lights" }));
		expect(triggered).toEqual(["v_lights"]);
	});

	test("train sorti, bascule → rentrer", async () => {
		await press(new FakeKey({ action: "group:gear" }));
		expect(triggered).toEqual(["v_retract_landing_system"]);
	});

	test("fonction absente du vaisseau → ⚠ + journal, rien envoyé", async () => {
		const key = new FakeKey({ action: "group:doors_closed" });
		await press(key);
		expect(triggered).toEqual([]);
		expect(key.calls).toEqual(["alert"]);
		expect(logs).toHaveLength(1);
	});

	test("refus du jeu → ⚠ + journal", async () => {
		result = { ok: false, reason: "TRIGGER_GAME_ACTION_STATUS_FILTERED" };
		const key = new FakeKey({ action: "group:lights" });
		await press(key);
		expect(key.calls).toEqual(["alert"]);
		expect(logs[0]).toContain("TRIGGER_GAME_ACTION_STATUS_FILTERED");
	});

	test("commande unique : envoyée telle quelle (le mode est ignoré)", async () => {
		await press(new FakeKey({ action: "v_flightready", mode: "off" }));
		expect(triggered).toEqual(["v_flightready"]);
	});

	test("action sensible (autodestruction) : envoyée en un appui", async () => {
		await press(new FakeKey({ action: "v_self_destruct" }));
		expect(triggered).toEqual(["v_self_destruct"]);
	});

	test("regroupement inconnu → ⚠, rien envoyé", async () => {
		const key = new FakeKey({ action: "group:inexistant" });
		await press(key);
		expect(triggered).toEqual([]);
		expect(key.calls).toEqual(["alert"]);
	});
});

describe("touches déjà réglées", () => {
	test("ancienne commande v_lights_on → convertie en Phares / On", async () => {
		const key = new FakeKey({ action: "v_lights_on" });
		await appear(key);
		expect(key.settings).toEqual({ action: "group:lights", mode: "on" });
		await press(key);
		expect(key.calls.at(-1)).toBe("ok");
	});

	test("ancienne touche Ship Toggle → Ship Action avec état, mode / style / alerte gardés", () => {
		expect(convertSettings({ function: "lights", mode: "on", style: "led", dangerAlert: false })).toEqual({
			action: "group:lights",
			mode: "on",
			style: "led",
			dangerAlert: false,
		});
		expect(convertSettings({ function: "inconnue" })).toEqual({ action: "group:gear", mode: "toggle" });
		expect(convertSettings({ action: "v_ifcs_toggle_esp" })).toEqual({ action: "group:esp", mode: "toggle" });
		expect(convertSettings({ action: "v_flightready" })).toBeUndefined();
		expect(convertSettings({ action: "group:gear" })).toBeUndefined();
	});

	test("commande unique déjà réglée → inchangée, titre = libellé", async () => {
		const key = new FakeKey({ action: "v_flightready" });
		await appear(key);
		expect(key.calls).toEqual(["image:default", "title:Prêt au vol"]);
	});

	test("toutes les fonctions sont reconnues en group:…", () => {
		expect(stateFunctionOf("group:cruise")?.id).toBe("cruise");
		expect(stateFunctionOf("group:nope")).toBeUndefined();
		expect(stateFunctionOf("v_lights")).toBeUndefined();
	});
});

describe("image avec état", () => {
	test("apparition → abonnée, ancien titre effacé, image du train sorti avec son libellé", async () => {
		const key = new FakeKey({ action: "group:gear" });
		await appear(key);
		expect(hub.listeners.size).toBe(1);
		expect(key.calls).toContain("title:");
		expect(key.images.at(-1)).toContain(">SORTI<");
		expect(key.images.at(-1)).toContain(">Train<");
	});

	test("nouvelle frame (train rentré) → nouvelle image", async () => {
		const key = new FakeKey({ action: "group:gear" });
		await appear(key);
		await new Promise((r) => setTimeout(r, 300));
		hub.sections.vehicle = retracted();
		hub.emit();
		await flush();
		expect(key.images.at(-1)).toContain(">RENTRÉ<");
	});

	test("hors du vaisseau → « — »", async () => {
		hub.sections.vehicle = undefined;
		const key = new FakeKey({ action: "group:lights" });
		await appear(key);
		expect(key.images.at(-1)).toContain(">—<");
	});

	test("style « Sans état » → icône fixe et titre libellé + mot du mode", async () => {
		const key = new FakeKey({ action: "group:gear", mode: "off", style: "plain" });
		await appear(key);
		expect(key.images).toEqual([]);
		expect(key.calls).toEqual(["image:default", "title:Train\nRENTRÉ"]);
	});

	test("passage de « Sans état » à « Texte » → image d'état", async () => {
		const key = new FakeKey({ action: "group:lights", style: "plain" });
		await appear(key);
		key.settings = { action: "group:lights", style: "text" };
		await action.onDidReceiveSettings(ev<DidReceiveSettingsEvent<ShipCommandSettings>>(key));
		expect(key.images.at(-1)).toContain(">Phares<");
	});

	test("disparition → désabonnée", async () => {
		const key = new FakeKey({ action: "group:gear" });
		await appear(key);
		await action.onWillDisappear(ev<WillDisappearEvent<ShipCommandSettings>>(key));
		expect(hub.listeners.size).toBe(0);
	});
});

describe("titre saisi", () => {
	test("titre saisi (non affiché par le Stream Deck) → remplace le nom par défaut", async () => {
		const key = new FakeKey({ action: "group:gear" });
		await appear(key);
		await titled(key, "Roues", false);
		expect(key.images.at(-1)).toContain(">Roues<");
		expect(key.images.at(-1)).not.toContain(">Train<");
	});

	test("titre effacé → nom par défaut", async () => {
		const key = new FakeKey({ action: "group:gear" });
		await appear(key);
		await titled(key, "Roues", false);
		await titled(key, "", false);
		expect(key.images.at(-1)).toContain(">Train<");
	});

	test("titre affiché par le Stream Deck → pas de libellé dans l'image (pas de doublon)", async () => {
		const key = new FakeKey({ action: "group:gear" });
		await appear(key);
		await titled(key, "Roues", true);
		expect(key.images.at(-1)).not.toContain(">Roues<");
		expect(key.images.at(-1)).not.toContain(">Train<");
		expect(key.images.at(-1)).toContain(">SORTI<");
	});
});

describe("animations", () => {
	afterEach(() => vi.useRealTimers());

	test("changement d'état → « pop » (pictogramme agrandi puis normal)", async () => {
		vi.useFakeTimers();
		action = make(true);
		const key = new FakeKey({ action: "group:gear" });
		await appear(key);
		const before = key.images.length;
		hub.sections.vehicle = retracted();
		hub.emit();
		await vi.advanceTimersByTimeAsync(400);
		const frames = key.images.slice(before);
		expect(frames.length).toBeGreaterThanOrEqual(3);
		expect(frames[0]).toContain("scale(2.596)");
		expect(frames.at(-1)).toContain("scale(2.200)");
		await action.onWillDisappear(ev<WillDisappearEvent<ShipCommandSettings>>(key));
	});

	test("en mouvement → images régulières, arrêt une fois l'état atteint", async () => {
		vi.useFakeTimers();
		action = make(true);
		const v = structuredClone(titan.vehicle) as { state: { flight: { state: Obj } } };
		v.state.flight.state.gear = "VEHICLE_COMPONENT_DEPLOYMENT_STATE_RETRACTING";
		hub.sections.vehicle = v;
		const key = new FakeKey({ action: "group:gear" });
		await appear(key);
		await vi.advanceTimersByTimeAsync(1000);
		expect(key.images.length).toBeGreaterThanOrEqual(4);
		hub.sections.vehicle = retracted();
		hub.emit();
		await vi.advanceTimersByTimeAsync(500);
		const n = key.images.length;
		await vi.advanceTimersByTimeAsync(2000);
		expect(key.images.length).toBe(n);
		expect(key.images.at(-1)).toContain(">RENTRÉ<");
		await action.onWillDisappear(ev<WillDisappearEvent<ShipCommandSettings>>(key));
	});
});

describe("panneau", () => {
	test("getActions → regroupements, ESP et croisière en une ligne", async () => {
		await action.onSendToPlugin({ action: new FakeKey({}), payload: { event: "getActions" } } as unknown as SendToPluginEvent<JsonValue, ShipCommandSettings>);
		const json = JSON.stringify(toPI[0]);
		expect(json).toContain("group:lights");
		expect(json).toContain("group:esp");
		expect(json).toContain("group:cruise");
		expect(json).not.toContain('"v_lights_on"');
		expect(json).not.toContain('"v_ifcs_toggle_esp"');
	});
});
