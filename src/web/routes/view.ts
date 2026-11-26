import { viewRightAllows, type Caller, type ViewGrant } from "../access.js";
import type { Route } from "../http.js";
import type { Lang } from "../../catalog/labels.js";
import { MAX_VIEWS, normalizeViewName, parseViewInput, type ViewInput, type ViewStore } from "../view.js";
import { buildExport, encodeCode, readImport } from "../view-export.js";
import { templateById, templateSummary, VIEW_TEMPLATES } from "../view-templates.js";

const invalid = { status: 400, json: { error: "invalid_view" } } as const;
const unknown = { status: 404, json: { error: "unknown_view" } } as const;
const noView = { status: 403, json: { error: "forbidden", reason: "view" } } as const;

/** Plugin appelant (jeton de plugin), sinon `undefined` (jeton principal : tous les droits). */
export const pluginOf = (caller: Caller): { id: string; views: ViewGrant } | undefined => (caller.kind === "external" ? caller.token.plugin : undefined);
/** Le plugin peut-il modifier ou supprimer cette vue ? La sienne, ou une vue accordée. */
export const mayEdit = (p: { id: string; views: ViewGrant }, view: { id: string; plugin?: string }) =>
	view.plugin === p.id || p.views.edit === "all" || (Array.isArray(p.views.edit) && p.views.edit.includes(view.id));

/** Corps d'import : jusqu'à 10 vues pleines (bien plus que les 64 Ko par défaut). */
const MAX_IMPORT_BODY = 1_048_576;

/**
 * Corps `{ template, name? }` : contenu du modèle (nom du modèle, ou celui donné) ; `undefined` sans `template`.
 * `template` avec `sections` ou `look` → corps invalide.
 */
function fromTemplate(body: unknown, lang: Lang): ViewInput | "unknown_template" | null | undefined {
	if (!body || typeof body !== "object" || !("template" in body)) return undefined;
	const o = body as Record<string, unknown>;
	if ("sections" in o || "look" in o || (o.name !== undefined && typeof o.name !== "string")) return null;
	const t = templateById(o.template);
	if (!t) return "unknown_template";
	const view = t.build(lang);
	return typeof o.name === "string" && o.name.trim() ? { ...view, name: normalizeViewName(o.name, lang) } : view;
}

/**
 * Vues que cet appelant voit (liste et flux d'événements) : toutes pour le jeton principal ; aucune pour un jeton
 * externe ; pour un plugin : toutes s'il a « lire », sinon les siennes et celles qu'il peut modifier, aucune sans droit.
 */
export function visibleViews<V extends { id: string; plugin?: string }>(caller: Caller, all: V[]): V[] | null {
	if (caller.kind !== "external") return all;
	const p = caller.token.plugin;
	if (!p || !viewRightAllows(p.views, "read")) return null;
	return p.views.read ? all : all.filter((v) => mayEdit(p, v));
}

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
			views: "read",
			handle: async ({ lang, caller }) => {
				// Sans « lire » : seulement ses vues et celles qu'il peut modifier (la route refuse déjà sans aucun droit).
				return { status: 200, json: { views: visibleViews(caller, deps.views.list(lang)) ?? [] } };
			},
		},
		{
			method: "GET",
			path: "/api/v1/views/templates",
			handle: async ({ lang }) => ({ status: 200, json: { templates: VIEW_TEMPLATES.map((t) => templateSummary(t, lang)) } }),
		},
		{
			method: "POST",
			path: "/api/v1/views",
			views: "create",
			handle: async ({ body, lang, caller }) => {
				const templated = fromTemplate(body, lang);
				const input = templated === undefined ? parseViewInput(body, lang) : templated;
				if (input === "unknown_template") return { status: 400, json: { error: "unknown_template" } };
				if (!input) return invalid;
				const view = deps.views.create(input, lang, pluginOf(caller)?.id);
				return view === "too_many" ? { status: 409, json: { error: "too_many_views" } } : { status: 201, json: view };
			},
		},
		{
			method: "PUT",
			path: "/api/v1/views/{id}",
			views: "edit",
			handle: async ({ body, lang, params, caller }) => {
				const p = pluginOf(caller);
				const target = deps.views.list(lang).find((v) => v.id === params.id);
				if (p && target && !mayEdit(p, target)) return noView;
				const input = parseViewInput(body, lang);
				if (!input) return invalid;
				const view = deps.views.update(params.id, input, lang);
				return view === "unknown" ? unknown : { status: 200, json: view };
			},
		},
		{
			method: "DELETE",
			path: "/api/v1/views/{id}",
			views: "edit",
			handle: async ({ lang, params, caller }) => {
				const p = pluginOf(caller);
				const target = deps.views.list(lang).find((v) => v.id === params.id);
				if (p && target && !mayEdit(p, target)) return noView;
				const result = deps.views.remove(params.id, lang);
				if (result === "unknown") return unknown;
				if (result === "last") return { status: 409, json: { error: "last_view" } };
				return { status: 204 };
			},
		},
	];
}
