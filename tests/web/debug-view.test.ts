import { describe, expect, test } from "vitest";
// @ts-expect-error module JS de la page, sans types
import { filterRows, formatNumber, recordingFileName, treeRows } from "../../src/web/static/debug.js";

type Row = { path: string; kind: string };

const schema = [
	{ name: "name", type: "string", kind: "scalar" },
	{ name: "lights_enabled", type: "bool", kind: "scalar", default: false },
	{ name: "doors", type: "VehicleDoorState", kind: "message", optional: true, fields: [{ name: "open_state", type: "DoorOpenState", kind: "enum" }] },
	{
		name: "shields",
		type: "VehicleShields",
		kind: "message",
		optional: true,
		fields: [
			{ name: "level", type: "float", kind: "scalar" },
			{ name: "faces", type: "float", kind: "scalar", repeated: true },
		],
	},
];

describe("onglet Debug : arbre", () => {
	test("valeurs reçues, champs non envoyés (optional) ou par défaut (simple), champs inconnus du schéma", () => {
		const rows: Row[] = treeRows({ name: "Titan", shields: { level: 0.5, faces: [1, 0.4] }, extra: 3 }, schema, { path: "vehicle" });
		expect(rows.map((r) => `${r.path}:${r.kind}`)).toEqual([
			"vehicle.name:value",
			"vehicle.lights_enabled:default",
			"vehicle.doors:absent",
			"vehicle.shields:object",
			"vehicle.shields.level:value",
			"vehicle.shields.faces:object",
			"vehicle.shields.faces[0]:value",
			"vehicle.shields.faces[1]:value",
			"vehicle.extra:value",
		]);
	});

	test("champ simple non envoyé : sa vraie valeur (phares éteints = false)", () => {
		const rows = treeRows({ name: "Titan" }, schema, { path: "vehicle" });
		expect(rows.find((r: Row) => r.path === "vehicle.lights_enabled")).toMatchObject({ kind: "default", value: false });
		// Même en masquant les champs non envoyés : c'est l'état réel.
		const hidden = treeRows({ name: "Titan" }, schema, { path: "vehicle", showAbsent: false });
		expect(hidden.map((r: Row) => r.path)).toEqual(["vehicle.name", "vehicle.lights_enabled"]);
	});

	test("sans les champs non envoyés ; branche pliée", () => {
		const rows: Row[] = treeRows({ shields: { level: 1 } }, schema, { showAbsent: false, closed: new Set(["shields"]) });
		expect(rows.map((r) => r.path)).toEqual(["lights_enabled", "shields"]);
	});

	test("filtre : lignes trouvées et leurs parents", () => {
		const rows: Row[] = treeRows({ name: "Titan", shields: { level: 0.5, faces: [1] } }, schema, { path: "vehicle", showAbsent: false });
		expect(filterRows(rows, "level").map((r: Row) => r.path)).toEqual(["vehicle.shields", "vehicle.shields.level"]);
		expect(filterRows(rows, "titan").map((r: Row) => r.path)).toEqual(["vehicle.name"]);
		expect(filterRows(rows, "")).toHaveLength(rows.length);
	});

	test("nombres et nom de fichier", () => {
		expect(formatNumber(3)).toBe("3");
		expect(formatNumber(0.998622477054596)).toBe("0.998622");
		expect(formatNumber(3.4028234663852886e38)).toBe("3.40282e+38");
		expect(recordingFileName(new Date(2026, 10, 23, 7, 5, 9))).toBe("sc-telemetry-debug-2026-11-23-070509.json");
	});
});
