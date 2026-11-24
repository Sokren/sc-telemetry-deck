import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { Lang } from "../catalog/labels.js";
import { normalizeViewName, readSections, type NamedView, type SavedLook, type Skipped, type ViewInput, type ViewSection } from "./view.js";

/** Export / import des vues « Ma vue » : document `.json` ou code texte `SCTD1:…` (le même document compressé). */
export const EXPORT_FORMAT = "sc-telemetry-deck.views";
export const EXPORT_FORMAT_VERSION = 1;
export const CODE_PREFIX = `SCTD${EXPORT_FORMAT_VERSION}:`;
/** Taille maximale du document décompressé (protège contre un code qui gonfle énormément). */
const MAX_INFLATED = 1_048_576;

export type ExportDoc = {
	format: string;
	format_version: number;
	app_version: string;
	exported_at: string;
	views: { name: string; sections: ViewSection[]; look?: SavedLook }[];
};

export type ImportPreview = {
	views: ViewInput[];
	from_version: string | null;
	exported_at: string | null;
	skipped: (Skipped & { view: string })[];
};
export type ImportError = { error: "invalid_export" | "unsupported_format" };

/** Document d'export (sans les ids de vues : l'import en crée de nouveaux). */
export function buildExport(views: NamedView[], appVersion: string, now = new Date()): ExportDoc {
	return {
		format: EXPORT_FORMAT,
		format_version: EXPORT_FORMAT_VERSION,
		app_version: appVersion,
		exported_at: now.toISOString(),
		views: views.map(({ name, sections, look }) => ({ name, sections, ...(look ? { look } : {}) })),
	};
}

export function encodeCode(doc: ExportDoc): string {
	return CODE_PREFIX + deflateRawSync(Buffer.from(JSON.stringify(doc), "utf-8")).toString("base64url");
}

const invalid: ImportError = { error: "invalid_export" };
const unsupported: ImportError = { error: "unsupported_format" };

/**
 * Ce qu'un copier-coller ajoute autour ou dans un code : blancs, guillemets droits, typographiques et « »,
 * caractères invisibles (espace sans chasse, liaisons, marque d'ordre des octets).
 */
const PASTE_NOISE = new RegExp(
	`[\\s"'\`${[0x201c, 0x201d, 0x201e, 0xab, 0xbb, 0x2018, 0x2019, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].map((c) => String.fromCharCode(c)).join("")}]`,
	"g",
);

/** Code collé (espaces, retours à la ligne, guillemets droits, typographiques ou « », caractères invisibles tolérés) → document, ou erreur. */
function decodeCode(raw: string): unknown | ImportError {
	const m = /^SCTD(\d+):([A-Za-z0-9_-]+)$/.exec(raw.replace(PASTE_NOISE, ""));
	if (!m) return invalid;
	if (Number(m[1]) !== EXPORT_FORMAT_VERSION) return Number(m[1]) > EXPORT_FORMAT_VERSION ? unsupported : invalid;
	try {
		return JSON.parse(inflateRawSync(Buffer.from(m[2], "base64url"), { maxOutputLength: MAX_INFLATED }).toString("utf-8"));
	} catch {
		return invalid;
	}
}

const isError = (x: unknown): x is ImportError => !!x && typeof x === "object" && "error" in x;
const obj = (x: unknown): Record<string, unknown> | undefined =>
	x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined;

/**
 * Corps d'un import (document ou `{ code }`) → vues lues avec tolérance et ce qui a été ignoré, ou erreur.
 * Le nombre de vues n'est pas limité ici (la route décide du refus s'il n'y a pas la place).
 */
export function readImport(body: unknown, lang: Lang): ImportPreview | ImportError {
	const o = obj(body);
	let doc: unknown = body;
	if (o && typeof o.code === "string" && o.format === undefined) {
		doc = decodeCode(o.code);
		if (isError(doc)) return doc;
	}
	const d = obj(doc);
	if (!d || d.format !== EXPORT_FORMAT || typeof d.format_version !== "number") return invalid;
	if (d.format_version > EXPORT_FORMAT_VERSION) return unsupported;
	if (d.format_version !== EXPORT_FORMAT_VERSION || !Array.isArray(d.views) || !d.views.length) return invalid;
	const views: ViewInput[] = [];
	const skipped: ImportPreview["skipped"] = [];
	for (const raw of d.views) {
		const v = obj(raw);
		if (!v) return invalid;
		const name = normalizeViewName(v.name, lang);
		const read = readSections(v.sections);
		views.push({ name, sections: read.sections, ...(v.look === "hud" || v.look === "cockpit" ? { look: v.look } : {}) });
		skipped.push(...read.skipped.map((s) => ({ view: name, ...s })));
	}
	return {
		views,
		from_version: typeof d.app_version === "string" ? d.app_version.slice(0, 32) : null,
		exported_at: typeof d.exported_at === "string" ? d.exported_at.slice(0, 40) : null,
		skipped,
	};
}
