// SPDX-License-Identifier: MPL-2.0
import type { IncomingMessage } from "node:http";
import type { AccessStore, AccessToken } from "../access.js";
import type { ActionSource } from "../../catalog/source.js";
import type { Route } from "../http.js";
import { describeCaller } from "../rights.js";

const pcOnly = { status: 403, json: { error: "pc_only" } } as const;
const notFound = { status: 404, json: { error: "not_found" } } as const;
const invalid = { status: 400, json: { error: "invalid_token" } } as const;

/** Jeton tel qu'exposé : jamais l'empreinte ni le jeton lui-même. */
const view = ({ hash: _hash, ...rest }: AccessToken) => rest;

/**
 * Gestion des jetons externes : jeton principal seulement (aucun niveau `access`), depuis le PC seulement.
 * Le jeton créé n'est renvoyé qu'une fois, dans la réponse à la création.
 */
export function accessRoutes(deps: {
	store: AccessStore;
	isLocal: (req: IncomingMessage) => boolean;
	/** Ferme les flux d'événements ouverts avec ce jeton (révoqué ou modifié : ses droits ont changé). */
	closeStreams?: (id: string) => void;
}): Route[] {
	const { store } = deps;
	const nameTaken = { status: 409, json: { error: "name_taken" } } as const;
	const body = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
	return [
		{
			method: "GET",
			path: "/api/v1/access/tokens",
			handle: async ({ req }) => (deps.isLocal(req) ? { status: 200, json: { tokens: store.list().map(view) } } : pcOnly),
		},
		{
			method: "POST",
			path: "/api/v1/access/tokens",
			handle: async ({ req, body: raw }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const b = body(raw);
				const r = store.create({ name: b.name, level: b.level, lan: b.lan });
				if (r === "invalid") return invalid;
				if (r === "too_many") return { status: 409, json: { error: "too_many" } };
				if (r === "name_taken") return nameTaken;
				return { status: 201, json: { token: view(r.token), secret: r.secret } };
			},
		},
		{
			method: "PUT",
			path: "/api/v1/access/tokens/{id}",
			handle: async ({ req, params, body: raw }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const b = body(raw);
				const r = store.update(params.id, { name: b.name, level: b.level, lan: b.lan });
				if (r === "unknown") return notFound;
				if (r === "invalid") return invalid;
				if (r === "name_taken") return nameTaken;
				deps.closeStreams?.(r.id);
				return { status: 200, json: view(r) };
			},
		},
		{
			method: "DELETE",
			path: "/api/v1/access/tokens/{id}",
			handle: async ({ req, params }) => {
				if (!deps.isLocal(req)) return pcOnly;
				if (!store.remove(params.id)) return notFound;
				deps.closeStreams?.(params.id);
				return { status: 204 };
			},
		},
		{
			method: "POST",
			path: "/api/v1/access/tokens/{id}/renew",
			handle: async ({ req, params }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const r = store.renew(params.id);
				if (r === "unknown") return notFound;
				deps.closeStreams?.(params.id);
				return { status: 200, json: { token: view(r.token), secret: r.secret } };
			},
		},
		{
			method: "POST",
			path: "/api/v1/access/tokens/{id}/stop",
			handle: async ({ req, params, body: raw }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const r = store.stop(params.id, body(raw).minutes);
				if (r === "unknown") return notFound;
				if (r === "invalid") return { status: 400, json: { error: "invalid_minutes" } };
				deps.closeStreams?.(params.id);
				return { status: 200, json: view(r) };
			},
		},
		{
			method: "POST",
			path: "/api/v1/access/tokens/{id}/start",
			handle: async ({ req, params }) => {
				if (!deps.isLocal(req)) return pcOnly;
				const r = store.start(params.id);
				return r === "unknown" ? notFound : { status: 200, json: view(r) };
			},
		},
		{
			method: "GET",
			path: "/api/v1/access/tokens/{id}/log",
			handle: async ({ req, params }) => {
				if (!deps.isLocal(req)) return pcOnly;
				if (!store.list().some((t) => t.id === params.id)) return notFound;
				return { status: 200, json: store.log(params.id) };
			},
		},
	];
}

/**
 * `GET /api/v1/access/me` : qui est l'appelant et ce qu'il peut faire (`can`). Ouverte à tout jeton en marche ; lit le
 * jeton à chaque appel, donc des droits changés en marche (plugin) se voient tout de suite. Catégories d'actions : celles
 * de l'instantané seul, sans interroger le jeu — réponse immédiate même jeu bloqué, et clés `actions.<catégorie>` qui ne
 * disparaissent jamais ; une catégorie que seul le jeu connaît relève de `actions.unknown`.
 */
export function accessMeRoute(deps: { source: Pick<ActionSource, "getSnapshot"> }): Route {
	return {
		method: "GET",
		path: "/api/v1/access/me",
		self: true,
		handle: async ({ caller }) => {
			const categories = deps.source.getSnapshot().map((a) => a.category);
			return { status: 200, json: describeCaller(caller, categories) };
		},
	};
}
