import type { Route } from "../http.js";
import { MAX_VIEWS, parseViewInput, type ViewStore } from "../view.js";
import { buildExport, encodeCode, readImport } from "../view-export.js";

const invalid = { status: 400, json: { error: "invalid_view" } } as const;
const unknown = { status: 404, json: { error: "unknown_view" } } as const;

/** Corps d'import : jusqu'à 10 vues pleines (bien plus que les 64 Ko par défaut). */
const MAX_IMPORT_BODY = 1_048_576;

/** « Ma vue » : liste, création, modification, suppression, export et import des vues (chacune enregistrée séparément). */
export function viewsRoutes(deps: { views: ViewStore; version: string }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/views/export",
			handle: async ({ lang, query }) => {
				const id = query.get("id");
				const all = deps.views.list(lang);
				const views = id === null ? all : all.filter((v) => v.id === id);
				if (!views.length) return unknown;
				const doc = buildExport(views, deps.version);
				return { status: 200, json: query.get("as") === "code" ? { code: encodeCode(doc), app_version: deps.version } : doc };
			},
		},
		{
			method: "POST",
			path: "/api/v1/views/import",
			maxBody: MAX_IMPORT_BODY,
			handle: async ({ body, lang, query }) => {
				const preview = readImport(body, lang);
				if ("error" in preview) return { status: 400, json: preview };
				const dryRun = query.get("dry_run") === "1" || query.get("dry_run") === "true";
				const count = deps.views.list(lang).length;
				const summary = (v: { name: string; sections: { items: unknown[] }[] }) => ({
					name: v.name,
					sections: v.sections.length,
					items: v.sections.reduce((n, s) => n + s.items.length, 0),
				});
				const report = { app_version: deps.version, from_version: preview.from_version, exported_at: preview.exported_at, skipped: preview.skipped };
				if (dryRun) {
					if (preview.views.length > MAX_VIEWS - count) return { status: 409, json: { error: "too_many_views", free: Math.max(0, MAX_VIEWS - count) } };
					return { status: 200, json: { ...report, views: preview.views.map(summary) } };
				}
				const created = deps.views.createMany(preview.views, lang);
				if (!Array.isArray(created)) return { status: 409, json: { error: "too_many_views", free: created.free } };
				return { status: 201, json: { ...report, views: created.map((v) => ({ id: v.id, ...summary(v) })) } };
			},
		},
		{
			method: "GET",
			path: "/api/v1/views",
			handle: async ({ lang }) => ({ status: 200, json: { views: deps.views.list(lang) } }),
		},
		{
			method: "POST",
			path: "/api/v1/views",
			handle: async ({ body, lang }) => {
				const input = parseViewInput(body, lang);
				if (!input) return invalid;
				const view = deps.views.create(input, lang);
				return view === "too_many" ? { status: 409, json: { error: "too_many_views" } } : { status: 201, json: view };
			},
		},
		{
			method: "PUT",
			path: "/api/v1/views/{id}",
			handle: async ({ body, lang, params }) => {
				const input = parseViewInput(body, lang);
				if (!input) return invalid;
				const view = deps.views.update(params.id, input, lang);
				return view === "unknown" ? unknown : { status: 200, json: view };
			},
		},
		{
			method: "DELETE",
			path: "/api/v1/views/{id}",
			handle: async ({ lang, params }) => {
				const result = deps.views.remove(params.id, lang);
				if (result === "unknown") return unknown;
				if (result === "last") return { status: 409, json: { error: "last_view" } };
				return { status: 204 };
			},
		},
	];
}
