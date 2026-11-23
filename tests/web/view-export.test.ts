import { deflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { defaultLayout, type NamedView } from "../../src/web/view.js";
import { buildExport, CODE_PREFIX, encodeCode, readImport } from "../../src/web/view-export.js";

const views = (): NamedView[] => [
	{ id: "main", name: "Ma vue", sections: defaultLayout("fr").sections },
	{ id: "v1", name: "Cockpit", sections: [] },
];
const now = new Date("2026-11-23T14:05:12Z");
const codeOf = (json: unknown, prefix = CODE_PREFIX) => prefix + deflateRawSync(Buffer.from(JSON.stringify(json))).toString("base64url");

describe("buildExport / readImport", () => {
	test("aller-retour document", () => {
		const doc = buildExport(views(), "0.3.12", now);
		expect(doc).toMatchObject({ format: "sc-telemetry-deck.views", format_version: 1, app_version: "0.3.12", exported_at: "2026-11-23T14:05:12.000Z" });
		expect(doc.views[0]).not.toHaveProperty("id");
		expect(readImport(JSON.parse(JSON.stringify(doc)), "fr")).toEqual({
			views: views().map(({ name, sections }) => ({ name, sections })),
			from_version: "0.3.12",
			exported_at: "2026-11-23T14:05:12.000Z",
			skipped: [],
		});
	});

	test("aller-retour code, préfixe SCTD1:", () => {
		const code = encodeCode(buildExport(views(), "0.3.12", now));
		expect(code.startsWith("SCTD1:")).toBe(true);
		expect(code.slice(6)).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(readImport({ code }, "fr")).toMatchObject({ views: [{ name: "Ma vue" }, { name: "Cockpit" }], from_version: "0.3.12" });
	});

	test("code collé avec espaces, retours à la ligne et guillemets", () => {
		const code = encodeCode(buildExport(views(), "0.3.12", now));
		expect(readImport({ code: `  "${code.slice(0, 20)}\n ${code.slice(20)}"  ` }, "fr")).toMatchObject({ from_version: "0.3.12" });
		expect(readImport({ code: `\`${code}\`` }, "fr")).toMatchObject({ from_version: "0.3.12" });
		expect(readImport({ code: `« ${code} »` }, "fr")).toMatchObject({ from_version: "0.3.12" });
		const [zw, bom, lq, rq] = [0x200b, 0xfeff, 0x201c, 0x201d].map((c) => String.fromCharCode(c));
		expect(readImport({ code: `${zw}${code.slice(0, 9)}${zw}${code.slice(9)}${bom}` }, "fr")).toMatchObject({ from_version: "0.3.12" });
		expect(readImport({ code: `${lq}${code}${rq}` }, "fr")).toMatchObject({ from_version: "0.3.12" });
	});

	test("code tronqué → invalid_export", () => {
		const code = encodeCode(buildExport(views(), "0.3.12", now));
		expect(readImport({ code: code.slice(0, code.length - 30) }, "fr")).toEqual({ error: "invalid_export" });
		expect(readImport({ code: "bonjour" }, "fr")).toEqual({ error: "invalid_export" });
		expect(readImport({ code: "SCTD1:" }, "fr")).toEqual({ error: "invalid_export" });
	});

	test("JSON d'une autre appli ou view.json interne → invalid_export", () => {
		expect(readImport({ version: 2, views: views() }, "fr")).toEqual({ error: "invalid_export" });
		expect(readImport({ foo: 1 }, "fr")).toEqual({ error: "invalid_export" });
		expect(readImport(undefined, "fr")).toEqual({ error: "invalid_export" });
		expect(readImport({ ...buildExport(views(), "0.3.12", now), views: [] }, "fr")).toEqual({ error: "invalid_export" });
		expect(readImport({ code: codeOf({ foo: 1 }) }, "fr")).toEqual({ error: "invalid_export" });
	});

	test("format_version 2 ou SCTD2: → unsupported_format", () => {
		const doc = buildExport(views(), "0.4.0", now);
		expect(readImport({ ...doc, format_version: 2 }, "fr")).toEqual({ error: "unsupported_format" });
		expect(readImport({ code: codeOf(doc, "SCTD2:") }, "fr")).toEqual({ error: "unsupported_format" });
	});

	test("décompression plafonnée", () => {
		const bomb = CODE_PREFIX + deflateRawSync(Buffer.alloc(2_000_000, 32)).toString("base64url");
		expect(readImport({ code: bomb }, "fr")).toEqual({ error: "invalid_export" });
	});

	test("cases ignorées rapportées avec le nom de la vue", () => {
		const doc = buildExport(views(), "0.3.14", now);
		doc.views[1] = {
			name: "Cockpit Corsair",
			sections: [{ id: "d", title: "Défense", width: "half", items: [{ id: "f", kind: "shield_faces" as any, size: 1 }] }],
		};
		const r = readImport(doc, "fr");
		expect(r).toMatchObject({ from_version: "0.3.14" });
		expect("skipped" in r && r.skipped).toEqual([{ view: "Cockpit Corsair", section: "Défense", kind: "shield_faces", reason: "unknown_kind" }]);
	});

	test("nom normalisé", () => {
		const doc = buildExport(views(), "0.3.12", now) as any;
		doc.views[0].name = "x".repeat(40);
		doc.views[1].name = "   ";
		const r = readImport(doc, "fr") as any;
		expect(r.views.map((v: any) => v.name)).toEqual(["x".repeat(24), "Vue"]);
	});
});
