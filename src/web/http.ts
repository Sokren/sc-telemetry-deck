import crypto from "node:crypto";
import net from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import { toLang, type Lang } from "../catalog/labels.js";
import { isStopped, levelAllows, PLUGIN_PREFIX, TOKEN_PREFIX, viewRightAllows, type AccessStore, type Caller } from "./access.js";

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
	/** Niveau minimal d'un jeton externe ; absent = jetons admin et mobile seulement (liste blanche). */
	access?: "read" | "pilot";
	/** Route d'administration (réseau local, jetons, plugins, réglage des mises à jour) : jeton admin seulement. */
	admin?: true;
	/** Route des vues : ouverte aux seuls jetons de plugin qui ont ce droit (jamais aux jetons externes). */
	views?: "read" | "create" | "edit";
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

/**
 * Jetons acceptés : l'admin (en-tête ou `?t=`, depuis le PC seulement), le mobile (en-tête ou `?t=`, partout, sans
 * les routes d'administration) et les jetons externes (en-tête seulement).
 */
export type Auth = { main: () => string; mobile: () => string; store?: AccessStore; isLocal?: (req: IncomingMessage) => boolean };

/** Refus (403), avec la raison. `pc_only` : jeton admin hors du PC, ou jeton mobile sur une route d'administration. */
const forbidden = (reason: "level" | "lan" | "stopped" | "view" | "pc_only") => ({ status: 403, json: { error: "forbidden", reason } });

/**
 * En-tête `Host` accepté : `localhost` ou une adresse IP littérale (IPv4, `[IPv6]`), avec ou sans port. Un nom de
 * domaine est refusé : une page web qui fait pointer son domaine vers 127.0.0.1 (rebinding DNS) n'atteint pas l'appli.
 */
export function hostAllowed(host: string | undefined): boolean {
	if (!host) return false;
	let name: string;
	let port: string | undefined;
	if (host.startsWith("[")) {
		const end = host.indexOf("]");
		if (end < 0) return false;
		name = host.slice(1, end);
		const rest = host.slice(end + 1);
		if (rest && !rest.startsWith(":")) return false;
		port = rest ? rest.slice(1) : undefined;
		if (name.includes("%") || !net.isIPv6(name)) return false;
	} else {
		const i = host.lastIndexOf(":");
		name = i < 0 ? host : host.slice(0, i);
		port = i < 0 ? undefined : host.slice(i + 1);
		if (name.toLowerCase() !== "localhost" && !net.isIPv4(name)) return false;
	}
	return port === undefined || (/^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535);
}

/** Gestionnaire HTTP : routage, jeton, corps JSON, langue. */
export function createHandler(
	routes: Route[],
	auth: Auth,
	fallback?: (req: IncomingMessage, res: ServerResponse) => boolean,
): (req: IncomingMessage, res: ServerResponse) => void {
	const compiled = routes.map(compile);
	return (req, res) => {
		void (async () => {
			if (!hostAllowed(req.headers.host)) {
				send(res, { status: 403, json: { error: "bad_host" } });
				return;
			}
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
				const external = header?.startsWith(TOKEN_PREFIX) || header?.startsWith(PLUGIN_PREFIX) ? auth.store?.find(header) : undefined;
				if (sameToken(given, auth.main())) caller = { kind: "main" };
				else if (sameToken(given, auth.mobile())) caller = { kind: "mobile" };
				else if (external) caller = { kind: "external", token: external };
				else {
					send(res, { status: 401, json: { error: "unauthorized" } });
					return;
				}
				// Jeton admin : jamais hors du PC (un lien qui fuit ne donne pas l'administration).
				if (caller.kind === "main" && !(auth.isLocal?.(req) ?? true)) {
					send(res, forbidden("pc_only"));
					return;
				}
				if (caller.kind === "mobile" && match.route.admin) {
					send(res, forbidden("pc_only"));
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
				const refusal = isStopped(caller.token)
					? forbidden("stopped")
					: !caller.token.lan && !(auth.isLocal?.(req) ?? true)
						? forbidden("lan")
					: match.route.views
						? !caller.token.plugin
							? forbidden("level")
							: !viewRightAllows(caller.token.plugin.views, match.route.views)
								? forbidden("view")
								: undefined
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
