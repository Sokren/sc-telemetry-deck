import type { IncomingMessage } from "node:http";
import type { AccessStore, AccessToken } from "../access.js";
import type { Route } from "../http.js";

const pcOnly = { status: 403, json: { error: "pc_only" } } as const;
const notFound = { status: 404, json: { error: "not_found" } } as const;
const invalid = { status: 400, json: { error: "invalid_token" } } as const;

/** Jeton tel qu'exposé : jamais l'empreinte ni le jeton lui-même. */
const view = ({ hash: _hash, ...rest }: AccessToken) => rest;

/**
 * Gestion des jetons externes : jeton principal seulement (aucun niveau `access`), depuis le PC seulement.
 * Le jeton créé n'est renvoyé qu'une fois, dans la réponse à la création.
 */
export function accessRoutes(deps: { store: AccessStore; isLocal: (req: IncomingMessage) => boolean }): Route[] {
	const { store } = deps;
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
				return { status: 200, json: view(r) };
			},
		},
		{
			method: "DELETE",
			path: "/api/v1/access/tokens/{id}",
			handle: async ({ req, params }) => {
				if (!deps.isLocal(req)) return pcOnly;
				return store.remove(params.id) ? { status: 204 } : notFound;
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
