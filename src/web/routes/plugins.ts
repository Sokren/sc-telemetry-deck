// SPDX-License-Identifier: MPL-2.0
import type { IncomingMessage } from "node:http";
import type { AccessStore } from "../access.js";
import type { Route } from "../http.js";
import type { PluginManager } from "../plugins/manager.js";

const pcOnly = { status: 403, json: { error: "pc_only" } } as const;
const notFound = { status: 404, json: { error: "not_found" } } as const;

/**
 * Gestion des plugins : jeton principal seulement (aucun niveau `access`), depuis le PC seulement. Activer demande
 * l'empreinte que le joueur a vue (`hash`) et les droits qu'il accorde (niveau, vues) ; rien ne se lance sans ça.
 */
export function pluginRoutes(deps: {
	plugins: PluginManager;
	access: AccessStore;
	isLocal: (req: IncomingMessage) => boolean;
	openFolder: (dir: string) => void;
}): Route[] {
	const { plugins } = deps;
	const list = () => ({ status: 200, json: { dir: plugins.dir, plugins: plugins.list() } });
	const body = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
	/** Réponse d'une commande sur un plugin : son état, ou l'erreur. */
	const reply = (r: unknown) => {
		if (r === "unknown") return notFound;
		if (typeof r === "string") return { status: 409, json: { error: r } };
		return { status: 200, json: r };
	};
	const command = (name: "start" | "stop" | "restart" | "disable"): Route => ({
		method: "POST",
		path: `/api/v1/plugins/{id}/${name}`,
		handle: async ({ req, params }) => (deps.isLocal(req) ? reply(await plugins[name](params.id)) : pcOnly),
	});
	return [
		{
			method: "GET",
			path: "/api/v1/plugins",
			handle: async ({ req }) => (deps.isLocal(req) ? list() : pcOnly),
		},
		{
			method: "POST",
			path: "/api/v1/plugins/scan",
			handle: async ({ req }) => {
				if (!deps.isLocal(req)) return pcOnly;
				plugins.scan();
				return list();
			},
		},
		{
			method: "POST",
			path: "/api/v1/plugins/open-folder",
			handle: async ({ req }) => {
				if (!deps.isLocal(req)) return pcOnly;
				deps.openFolder(plugins.dir);
				return { status: 204 };
			},
		},
		{
			method: "POST",
			path: "/api/v1/plugins/{id}/enable",
			handle: async ({ req, params, body: raw }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const b = body(raw);
				const r = plugins.enable(params.id, { hash: b.hash, grant: { level: b.level, views: b.views } });
				if (r === "invalid") return { status: 400, json: { error: "invalid_plugin_grant" } };
				return reply(r);
			},
		},
		command("start"),
		command("stop"),
		command("restart"),
		command("disable"),
		{
			method: "GET",
			path: "/api/v1/plugins/{id}/log",
			handle: async ({ req, params }) => {
				if (!deps.isLocal(req)) return pcOnly;
				if (!plugins.get(params.id)) return notFound;
				return { status: 200, json: { calls: deps.access.log(`plugin:${params.id}`), output: plugins.output(params.id) } };
			},
		},
	];
}
