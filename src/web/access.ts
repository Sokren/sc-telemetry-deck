import crypto from "node:crypto";
import type { WebSettings } from "./config.js";

/**
 * Jetons externes (VoiceAttack, overlay, bot, plugin…) : chacun a un niveau et peut servir ou non depuis le réseau
 * local. Seule l'empreinte SHA-256 est enregistrée (`settings.json`) ; le jeton n'est montré qu'à sa création.
 * Le jeton principal (page web, Stream Deck) n'est pas concerné : il garde tous les droits.
 */
export type AccessLevel = "read" | "pilot" | "pilot_full";
export const ACCESS_LEVELS: readonly AccessLevel[] = ["read", "pilot", "pilot_full"];

export type AccessToken = {
	id: string;
	name: string;
	level: AccessLevel;
	lan: boolean;
	hash: string;
	last4: string;
	created: string;
	/** Jeton stoppé : sans limite (`until: null`) ou jusqu'à cette date ; absent = en marche. */
	stopped?: { until: string | null };
	/** Jeton d'un plugin lancé par l'appli (en mémoire seulement) : son dossier et ses droits sur les vues. */
	plugin?: { id: string; views: ViewGrant };
};
/** Droits d'un plugin sur les vues : lire toutes, modifier (toutes ou une liste d'ids), créer les siennes. */
export type ViewGrant = { read: boolean; edit: false | "all" | string[]; create: boolean };
/** Ce que le joueur accorde à un plugin à son activation. */
export type PluginGrant = { level: AccessLevel; views: ViewGrant };
/** Appelant d'une requête : jeton principal, jeton externe, ou anonyme (routes publiques : documentation). */
export type Caller = { kind: "main" } | { kind: "mobile" } | { kind: "external"; token: AccessToken } | { kind: "anonymous" };
export type AccessLogEntry = { at: string; method: string; path: string; status: number; sensitive?: true };

export const MAX_TOKENS = 20;
/** Durée maximale d'un stop temporaire, en minutes (24 h). */
export const MAX_STOP_MINUTES = 1440;
export const MAX_TOKEN_NAME = 32;
export const TOKEN_PREFIX = "sct_ext_";
export const PLUGIN_PREFIX = "sct_plg_";
const LOG_SIZE = 100;
/** Appels en alerte, et actions sensibles, gardés en plus (chacun jusqu'à 50) quand d'autres appels les chassent des 100 derniers. */
const KEPT_ALERTS = 50;
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,32}$/;

const newSecret = () => TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
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

/** Le nom est-il déjà pris par un autre jeton (sans tenir compte des majuscules) ? Deux « Overlay » prêtent à confusion. */
const nameTaken = (tokens: AccessToken[], name: string, except?: string) =>
	tokens.some((t) => t.id !== except && t.name.toLocaleLowerCase() === name.toLocaleLowerCase());

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
		const stop = obj(o.stopped);
		const stopped = stop && (stop.until === null || (typeof stop.until === "string" && !Number.isNaN(Date.parse(stop.until)))) ? { until: stop.until as string | null } : undefined;
		out.push({ id: o.id, name, level: o.level, lan: o.lan, hash: o.hash, last4: o.last4, created: o.created, ...(stopped ? { stopped } : {}) });
	}
	return out;
}

/**
 * Appel à signaler (rouge et ⚠ dans l'appli web) : refusé (401, 403), requête invalide (400) ou erreur (5xx). Une
 * réponse normale comme 404 (aucune donnée du jeu) ou 409 (rien à arrêter) reste neutre.
 */
export const isAlertStatus = (status: number) => status === 400 || status === 401 || status === 403 || status >= 500;

/** Le jeton est-il stoppé maintenant ? Un stop temporaire se lève seul à son échéance. */
export function isStopped(token: AccessToken, now = Date.now()): boolean {
	if (!token.stopped) return false;
	return token.stopped.until === null || Date.parse(token.stopped.until) > now;
}

/** Le droit sur les vues ouvre-t-il ce genre de route ? Modifier ou créer implique de voir ses vues. */
export function viewRightAllows(views: ViewGrant, needed: "read" | "create" | "edit"): boolean {
	if (needed === "create") return views.create;
	if (needed === "edit") return views.edit !== false || views.create;
	return views.read || views.edit !== false || views.create;
}

/** Le niveau donne-t-il accès à une route de ce niveau ? Lecture ⊂ Pilotage ⊂ Pilotage complet. */
export function levelAllows(level: AccessLevel, needed: "read" | "pilot"): boolean {
	return needed === "read" || level !== "read";
}

/** Actions protégées (éjection, autodestruction, déverrouillage) : jetons admin et mobile, et Pilotage complet. */
export function mayTriggerDangerous(caller: Caller): boolean {
	return caller.kind === "main" || caller.kind === "mobile" || (caller.kind === "external" && caller.token.level === "pilot_full");
}

export class AccessStore {
	readonly #logs = new Map<string, { entries: AccessLogEntry[]; kept: AccessLogEntry[]; keptSensitive: AccessLogEntry[]; refused: number }>();
	/** Jetons des plugins en marche, par dossier de plugin : jamais enregistrés. */
	readonly #plugins = new Map<string, AccessToken>();

	constructor(
		private readonly settings: WebSettings,
		private readonly save: () => void,
	) {}

	list(): AccessToken[] {
		return this.settings.access ?? [];
	}

	create(input: { name: unknown; level: unknown; lan: unknown }): { token: AccessToken; secret: string } | "invalid" | "too_many" | "name_taken" {
		const name = cleanName(input.name);
		if (!name || !isLevel(input.level) || typeof input.lan !== "boolean") return "invalid";
		const tokens = this.list();
		if (nameTaken(tokens, name)) return "name_taken";
		if (tokens.length >= MAX_TOKENS) return "too_many";
		const secret = newSecret();
		let id: string;
		do id = crypto.randomBytes(6).toString("base64url");
		while (tokens.some((t) => t.id === id));
		const token: AccessToken = { id, name, level: input.level, lan: input.lan, hash: sha256(secret), last4: secret.slice(-4), created: new Date().toISOString() };
		this.settings.access = [...tokens, token];
		this.save();
		return { token, secret };
	}

	update(id: string, patch: { name?: unknown; level?: unknown; lan?: unknown }): AccessToken | "invalid" | "unknown" | "name_taken" {
		const tokens = this.list();
		const current = tokens.find((t) => t.id === id);
		if (!current) return "unknown";
		const name = patch.name === undefined ? current.name : cleanName(patch.name);
		const level = patch.level === undefined ? current.level : patch.level;
		const lan = patch.lan === undefined ? current.lan : patch.lan;
		if (!name || !isLevel(level) || typeof lan !== "boolean") return "invalid";
		if (nameTaken(tokens, name, id)) return "name_taken";
		const token = { ...current, name, level, lan };
		this.settings.access = tokens.map((t) => (t.id === id ? token : t));
		this.save();
		return token;
	}

	/** Nouveau secret pour ce jeton (même id, nom, niveau, réseau local) : l'ancien ne marche plus. */
	renew(id: string): { token: AccessToken; secret: string } | "unknown" {
		const tokens = this.list();
		const current = tokens.find((t) => t.id === id);
		if (!current) return "unknown";
		const secret = newSecret();
		const token = { ...current, hash: sha256(secret), last4: secret.slice(-4) };
		this.settings.access = tokens.map((t) => (t.id === id ? token : t));
		this.save();
		return { token, secret };
	}

	/** Stoppe le jeton : sans limite, ou pour `minutes` (entier de 1 à 1440). */
	stop(id: string, minutes?: unknown, now = Date.now()): AccessToken | "invalid" | "unknown" {
		const tokens = this.list();
		const current = tokens.find((t) => t.id === id);
		if (!current) return "unknown";
		if (minutes !== undefined && !(Number.isInteger(minutes) && (minutes as number) >= 1 && (minutes as number) <= MAX_STOP_MINUTES)) return "invalid";
		const until = minutes === undefined ? null : new Date(now + (minutes as number) * 60_000).toISOString();
		return this.#replace(tokens, { ...current, stopped: { until } });
	}

	/** Remet le jeton en marche. */
	start(id: string): AccessToken | "unknown" {
		const tokens = this.list();
		const current = tokens.find((t) => t.id === id);
		if (!current) return "unknown";
		const { stopped: _stopped, ...rest } = current;
		return this.#replace(tokens, rest);
	}

	#replace(tokens: AccessToken[], token: AccessToken): AccessToken {
		this.settings.access = tokens.map((t) => (t.id === token.id ? token : t));
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

	/** Jeton externe ou de plugin correspondant (comparaison des empreintes en temps constant). */
	find(secret: string): AccessToken | undefined {
		const pool = secret.startsWith(TOKEN_PREFIX) ? this.list() : secret.startsWith(PLUGIN_PREFIX) ? [...this.#plugins.values()] : [];
		const given = Buffer.from(sha256(secret), "hex");
		return pool.find((t) => crypto.timingSafeEqual(Buffer.from(t.hash, "hex"), given));
	}

	/**
	 * Nouveau jeton pour un plugin qu'on lance (remplace le précédent) : en mémoire seulement, PC seulement, absent de
	 * `list()`. Son id (`plugin:<dossier>`) sert de clé au journal et aux flux d'événements.
	 */
	issuePlugin(pluginId: string, name: string, grant: PluginGrant): string {
		const secret = PLUGIN_PREFIX + crypto.randomBytes(32).toString("base64url");
		this.#plugins.set(pluginId, {
			id: `plugin:${pluginId}`,
			name,
			level: grant.level,
			lan: false,
			hash: sha256(secret),
			last4: secret.slice(-4),
			created: new Date().toISOString(),
			plugin: { id: pluginId, views: grant.views },
		});
		return secret;
	}

	/** Droits changés pendant que le plugin tourne : appliqués tout de suite à son jeton en cours. */
	regrantPlugin(pluginId: string, grant: PluginGrant): void {
		const tok = this.#plugins.get(pluginId);
		if (tok) this.#plugins.set(pluginId, { ...tok, level: grant.level, plugin: { id: pluginId, views: grant.views } });
	}

	/** Le jeton du plugin ne marche plus (arrêt, relance, fermeture de l'appli). */
	revokePlugin(pluginId: string): void {
		this.#plugins.delete(pluginId);
	}

	record(id: string, entry: AccessLogEntry): void {
		const log = this.#logs.get(id) ?? { entries: [], kept: [], keptSensitive: [], refused: 0 };
		log.entries.push(entry);
		if (log.entries.length > LOG_SIZE) {
			const out = log.entries.shift()!;
			// Réserves séparées : des erreurs ne chassent pas une action sensible, ni l'inverse.
			const reserve = out.sensitive ? log.keptSensitive : isAlertStatus(out.status) ? log.kept : undefined;
			if (reserve) {
				reserve.push(out);
				if (reserve.length > KEPT_ALERTS) reserve.shift();
			}
		}
		if (entry.status === 401 || entry.status === 403) log.refused++;
		this.#logs.set(id, log);
	}

	log(id: string): { entries: AccessLogEntry[]; refused: number; lastUsed: string | null } {
		const log = this.#logs.get(id);
		const kept = [...(log?.kept ?? []), ...(log?.keptSensitive ?? [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
		return { entries: [...kept, ...(log?.entries ?? [])], refused: log?.refused ?? 0, lastUsed: log?.entries.at(-1)?.at ?? null };
	}
}
