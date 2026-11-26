import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseAccess, type AccessToken } from "./access.js";
import { parseSavedPlugins, type SavedPlugin } from "./plugins/manager.js";

/**
 * Réglages de l'appli web, enregistrés dans `settings.json`.
 * `lan` : accès depuis le réseau local ; `lanAll` : sur toutes les interfaces (0.0.0.0, option avancée) ;
 * `lanNetwork` : carte réseau choisie quand il y en a plusieurs.
 */
/** `updateCheck: false` : vérification automatique des nouvelles versions désactivée (absent = activée). */
/** `access` : jetons externes (empreintes seulement, `src/web/access.ts`), absent quand il n'y en a aucun. */
export type WebSettings = {
	port: number;
	lan: boolean;
	lanAll?: boolean;
	lanNetwork?: string;
	/** Jeton admin : tous les droits, accepté seulement depuis le PC. */
	token: string;
	/**
	 * Jeton mobile, commun aux tablettes et téléphones (QR code, lien) : droits de la page, sans les routes
	 * d'administration. « Nouveau jeton » ne renouvelle que lui.
	 */
	mobileToken: string;
	updateCheck?: boolean;
	access?: AccessToken[];
	/** Plugins activés ou désactivés par le joueur (dossier → empreinte approuvée et droits accordés). */
	plugins?: Record<string, SavedPlugin>;
};

export const DEFAULT_PORT = 8743;
const MIN_TOKEN = 32;

/** Dossier des réglages : `%APPDATA%\SC Telemetry Deck` (ou le dossier personnel à défaut). */
export function defaultSettingsDir(): string {
	return path.join(process.env.APPDATA ?? os.homedir(), "SC Telemetry Deck");
}

export const newToken = () => crypto.randomBytes(24).toString("base64url");

/** Réécrit `settings.json`. */
export function saveSettings(dir: string, settings: WebSettings): void {
	fs.writeFileSync(path.join(dir, "settings.json"), `${JSON.stringify(settings, null, "\t")}\n`);
}

/**
 * Lit les réglages (dossier et fichier créés au besoin). Champ absent ou invalide → valeur par défaut ;
 * fichier illisible → réglages neufs, l'ancien gardé en `settings.json.bak`. Le résultat est réécrit.
 */
export function loadSettings(dir: string): WebSettings {
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, "settings.json");
	let raw: Record<string, unknown> = {};
	if (fs.existsSync(file)) {
		const text = fs.readFileSync(file, "utf-8");
		try {
			const parsed: unknown = JSON.parse(text);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
			else throw new Error("format");
		} catch {
			fs.writeFileSync(`${file}.bak`, text);
		}
	}
	const port = Number.isInteger(raw.port) && (raw.port as number) >= 1 && (raw.port as number) <= 65535 ? (raw.port as number) : DEFAULT_PORT;
	const token = typeof raw.token === "string" && raw.token.length >= MIN_TOKEN ? raw.token : newToken();
	// Installation d'avant le jeton mobile : le jeton actuel reste le jeton admin, le jeton mobile est neuf.
	const mobileToken = typeof raw.mobileToken === "string" && raw.mobileToken.length >= MIN_TOKEN && raw.mobileToken !== token ? raw.mobileToken : newToken();
	const settings: WebSettings = {
		port,
		lan: raw.lan === true,
		...(typeof raw.lanAll === "boolean" ? { lanAll: raw.lanAll } : {}),
		...(typeof raw.lanNetwork === "string" && raw.lanNetwork ? { lanNetwork: raw.lanNetwork } : {}),
		token,
		mobileToken,
		...(raw.updateCheck === false ? { updateCheck: false } : {}),
	};
	const access = parseAccess(raw.access);
	if (access.length) settings.access = access;
	const plugins = parseSavedPlugins(raw.plugins);
	if (Object.keys(plugins).length) settings.plugins = plugins;
	saveSettings(dir, settings);
	return settings;
}
