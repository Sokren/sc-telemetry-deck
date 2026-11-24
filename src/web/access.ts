import crypto from "node:crypto";
import type { WebSettings } from "./config.js";

/**
 * Jetons externes (VoiceAttack, overlay, bot, plugin…) : chacun a un niveau et peut servir ou non depuis le réseau
 * local. Seule l'empreinte SHA-256 est enregistrée (`settings.json`) ; le jeton n'est montré qu'à sa création.
 * Le jeton principal (page web, Stream Deck) n'est pas concerné : il garde tous les droits.
 */
export type AccessLevel = "read" | "pilot" | "pilot_full";
export const ACCESS_LEVELS: readonly AccessLevel[] = ["read", "pilot", "pilot_full"];

export type AccessToken = { id: string; name: string; level: AccessLevel; lan: boolean; hash: string; last4: string; created: string };
/** Appelant d'une requête : jeton principal, jeton externe, ou anonyme (routes publiques : documentation). */
export type Caller = { kind: "main" } | { kind: "external"; token: AccessToken } | { kind: "anonymous" };
export type AccessLogEntry = { at: string; method: string; path: string; status: number; sensitive?: true };

export const MAX_TOKENS = 20;
export const MAX_TOKEN_NAME = 32;
export const TOKEN_PREFIX = "sct_ext_";
const LOG_SIZE = 100;
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,32}$/;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const obj = (x: unknown): Record<string, unknown> | undefined =>
	x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined;
const isLevel = (x: unknown): x is AccessLevel => (ACCESS_LEVELS as readonly unknown[]).includes(x);

/** Nom nettoyé (1 à 32 caractères), ou `undefined`. */
function cleanName(x: unknown): string | undefined {
	if (typeof x !== "string") return undefined;
	const name = x.trim();
	return name && [...name].length <= MAX_TOKEN_NAME ? name : undefined;
}

/** Jetons lus dans `settings.json` ; une entrée invalide est ignorée. */
export function parseAccess(raw: unknown): AccessToken[] {
	if (!Array.isArray(raw)) return [];
	const out: AccessToken[] = [];
	for (const x of raw) {
		const o = obj(x);
		if (!o || typeof o.id !== "string" || !ID.test(o.id) || out.some((t) => t.id === o.id)) continue;
		const name = cleanName(o.name);
		if (!name || !isLevel(o.level) || typeof o.lan !== "boolean") continue;
		if (typeof o.hash !== "string" || !HASH.test(o.hash) || typeof o.last4 !== "string" || typeof o.created !== "string") continue;
		out.push({ id: o.id, name, level: o.level, lan: o.lan, hash: o.hash, last4: o.last4, created: o.created });
	}
	return out;
}

/** Le niveau donne-t-il accès à une route de ce niveau ? Lecture ⊂ Pilotage ⊂ Pilotage complet. */
export function levelAllows(level: AccessLevel, needed: "read" | "pilot"): boolean {
	return needed === "read" || level !== "read";
}

/** Actions protégées (éjection, autodestruction, déverrouillage) : jeton principal et Pilotage complet seulement. */
export function mayTriggerDangerous(caller: Caller): boolean {
	return caller.kind === "main" || (caller.kind === "external" && caller.token.level === "pilot_full");
}

export class AccessStore {
	readonly #logs = new Map<string, { entries: AccessLogEntry[]; refused: number }>();

	constructor(
		private readonly settings: WebSettings,
		private readonly save: () => void,
	) {}

	list(): AccessToken[] {
		return this.settings.access ?? [];
	}

	create(input: { name: unknown; level: unknown; lan: unknown }): { token: AccessToken; secret: string } | "invalid" | "too_many" {
		const name = cleanName(input.name);
		if (!name || !isLevel(input.level) || typeof input.lan !== "boolean") return "invalid";
		const tokens = this.list();
		if (tokens.length >= MAX_TOKENS) return "too_many";
		const secret = TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
		let id: string;
		do id = crypto.randomBytes(6).toString("base64url");
		while (tokens.some((t) => t.id === id));
		const token: AccessToken = { id, name, level: input.level, lan: input.lan, hash: sha256(secret), last4: secret.slice(-4), created: new Date().toISOString() };
		this.settings.access = [...tokens, token];
		this.save();
		return { token, secret };
	}

	update(id: string, patch: { name?: unknown; level?: unknown; lan?: unknown }): AccessToken | "invalid" | "unknown" {
		const tokens = this.list();
		const current = tokens.find((t) => t.id === id);
		if (!current) return "unknown";
		const name = patch.name === undefined ? current.name : cleanName(patch.name);
		const level = patch.level === undefined ? current.level : patch.level;
		const lan = patch.lan === undefined ? current.lan : patch.lan;
		if (!name || !isLevel(level) || typeof lan !== "boolean") return "invalid";
		const token = { ...current, name, level, lan };
		this.settings.access = tokens.map((t) => (t.id === id ? token : t));
		this.save();
		return token;
	}

	remove(id: string): boolean {
		const tokens = this.list();
		if (!tokens.some((t) => t.id === id)) return false;
		const rest = tokens.filter((t) => t.id !== id);
		if (rest.length) this.settings.access = rest;
		else delete this.settings.access;
		this.#logs.delete(id);
		this.save();
		return true;
	}

	/** Jeton externe correspondant (comparaison des empreintes en temps constant). */
	find(secret: string): AccessToken | undefined {
		if (!secret.startsWith(TOKEN_PREFIX)) return undefined;
		const given = Buffer.from(sha256(secret), "hex");
		return this.list().find((t) => crypto.timingSafeEqual(Buffer.from(t.hash, "hex"), given));
	}

	record(id: string, entry: AccessLogEntry): void {
		const log = this.#logs.get(id) ?? { entries: [], refused: 0 };
		log.entries.push(entry);
		if (log.entries.length > LOG_SIZE) log.entries.shift();
		if (entry.status === 401 || entry.status === 403) log.refused++;
		this.#logs.set(id, log);
	}

	log(id: string): { entries: AccessLogEntry[]; refused: number; lastUsed: string | null } {
		const log = this.#logs.get(id);
		return { entries: [...(log?.entries ?? [])], refused: log?.refused ?? 0, lastUsed: log?.entries.at(-1)?.at ?? null };
	}
}
