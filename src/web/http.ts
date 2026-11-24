import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { toLang, type Lang } from "../catalog/labels.js";
import { levelAllows, TOKEN_PREFIX, type AccessStore, type Caller } from "./access.js";

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export type Ctx = {
	params: Record<string, string>;
	query: URLSearchParams;
	body: unknown;
	lang: Lang;
	req: IncomingMessage;
	res: ServerResponse;
	/** Appelant : jeton principal, jeton externe, ou anonyme (routes publiques). */
	caller: Caller;
	/** Marque la requête dans le journal du jeton externe (action protégée envoyée). */
	mark: (tag: "sensitive") => void;
};

/** Réponse d'une route ; `stream` : la route écrit elle-même la réponse (Server-Sent Events). */
export type Reply = { status: number; json?: unknown; text?: string; data?: Buffer; contentType?: string } | { stream: true };

export type Route = {
	method: Method;
	/** Chemin au format OpenAPI, ex. `/api/v1/actions/{name}/trigger`. */
	path: string;
	/** Accessible sans jeton (documentation, page). */
	public?: boolean;
	/** Niveau minimal d'un jeton externe ; absent = jeton principal seulement (liste blanche). */
	access?: "read" | "pilot";
	/** Taille maximale du corps en octets (64 Ko par défaut). */
	maxBody?: number;
	handle(ctx: Ctx): Promise<Reply>;
};

const MAX_BODY = 64 * 1024;

type Compiled = Route & { regex: RegExp; names: string[] };

function compile(route: Route): Compiled {
	const names: string[] = [];
	const pattern = route.path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{([^}]+)\\?\}|\{([^}]+)\}/g, (_m, a, b) => {
		names.push(a ?? b);
		return "([^/]+)";
	});
	return { ...route, regex: new RegExp(`^${pattern}$`), names };
}

/** Jeton de la requête : en-tête `Authorization: Bearer …`, sinon paramètre `t`. */
function tokenOf(req: IncomingMessage, query: URLSearchParams): string | undefined {
	const header = req.headers.authorization;
	if (header?.startsWith("Bearer ")) return header.slice(7).trim();
	return query.get("t") ?? undefined;
}

function sameToken(given: string | undefined, expected: string): boolean {
	if (!given) return false;
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Langue : `?lang=fr|en`, sinon `Accept-Language`, sinon anglais. */
export function langOf(req: IncomingMessage, query: URLSearchParams): Lang {
	const asked = query.get("lang");
	if (asked === "fr" || asked === "en") return asked;
	return toLang(req.headers["accept-language"]?.split(",")[0]?.trim() ?? "en");
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > limit) {
				reject(new Error("too_large"));
				req.destroy();
			} else chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
		req.on("error", reject);
	});
}

export function send(res: ServerResponse, reply: Exclude<Reply, { stream: true }>): void {
	const headers: Record<string, string> = { "cache-control": "no-store" };
	let payload: string | Buffer = "";
	if (reply.json !== undefined) {
		headers["content-type"] = "application/json; charset=utf-8";
		payload = JSON.stringify(reply.json);
	} else if (reply.data) {
		headers["content-type"] = reply.contentType ?? "application/octet-stream";
		payload = reply.data;
	} else if (reply.text !== undefined) {
		headers["content-type"] = reply.contentType ?? "text/plain; charset=utf-8";
		payload = reply.text;
	}
	res.writeHead(reply.status, headers);
	res.end(payload);
}

/** Jetons acceptés : le principal (en-tête ou `?t=`) et les jetons externes (en-tête seulement). */
export type Auth = { main: () => string; store?: AccessStore; isLocal?: (req: IncomingMessage) => boolean };

/** Refus d'un jeton externe (403), avec la raison. */
const forbidden = (reason: "level" | "lan") => ({ status: 403, json: { error: "forbidden", reason } });

/** Gestionnaire HTTP : routage, jeton, corps JSON, langue. */
export function createHandler(
	routes: Route[],
	auth: Auth,
	fallback?: (req: IncomingMessage, res: ServerResponse) => boolean,
): (req: IncomingMessage, res: ServerResponse) => void {
	const compiled = routes.map(compile);
	return (req, res) => {
		void (async () => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const method = (req.method ?? "GET").toUpperCase();
			let match: { route: Compiled; params: Record<string, string> } | undefined;
			for (const route of compiled) {
				if (route.method !== method) continue;
				const m = route.regex.exec(url.pathname);
				if (m) {
					match = { route, params: Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
					break;
				}
			}
			if (!match) {
				if (!fallback?.(req, res)) send(res, { status: 404, json: { error: "not_found" } });
				return;
			}
			let caller: Caller = { kind: "anonymous" };
			if (!match.route.public) {
				const given = tokenOf(req, url.searchParams);
				const header = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : undefined;
				const external = header?.startsWith(TOKEN_PREFIX) ? auth.store?.find(header) : undefined;
				if (sameToken(given, auth.main())) caller = { kind: "main" };
				else if (external) caller = { kind: "external", token: external };
				else {
					send(res, { status: 401, json: { error: "unauthorized" } });
					return;
				}
			}
			let sensitive = false;
			const record = (status: number) => {
				if (caller.kind !== "external") return;
				const entry = { at: new Date().toISOString(), method, path: match.route.path, status, ...(sensitive ? { sensitive: true as const } : {}) };
				auth.store?.record(caller.token.id, entry);
			};
			if (caller.kind === "external") {
				const refusal = !caller.token.lan && !(auth.isLocal?.(req) ?? true)
					? forbidden("lan")
					: !match.route.access || !levelAllows(caller.token.level, match.route.access)
						? forbidden("level")
						: undefined;
				if (refusal) {
					record(403);
					send(res, refusal);
					return;
				}
			}
			let body: unknown;
			if (method === "POST" || method === "PUT") {
				try {
					const text = await readBody(req, match.route.maxBody ?? MAX_BODY);
					body = text.trim() ? JSON.parse(text) : undefined;
				} catch {
					record(400);
					send(res, { status: 400, json: { error: "bad_request" } });
					return;
				}
			}
			const reply = await match.route.handle({
				params: match.params,
				query: url.searchParams,
				body,
				lang: langOf(req, url.searchParams),
				req,
				res,
				caller,
				mark: () => {
					sensitive = true;
				},
			});
			record("stream" in reply ? 200 : reply.status);
			if (!("stream" in reply)) send(res, reply);
		})().catch(() => {
			if (!res.headersSent) send(res, { status: 500, json: { error: "internal" } });
			else res.end();
		});
	};
}
