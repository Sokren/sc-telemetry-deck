// SPDX-License-Identifier: MPL-2.0
import type { AccessLevel, Caller } from "./access.js";

/**
 * Droits d'un appelant (`can`), renvoyés par `GET /api/v1/access/me`. Objet plat, clés `domaine.objet` ; toutes les
 * clés connues sont présentes, `false` compris. Pour l'instant tout est déduit du niveau du jeton : Lecture ⊂ Pilotage ⊂
 * Pilotage complet. Les clients testent un droit dans `can`, jamais le nom du niveau, et ignorent les clés inconnues.
 */
export const READ_RIGHTS = ["read.status", "read.character", "read.ship", "read.game", "read.telemetry", "read.actions", "read.events"] as const;

export type CanValue = boolean | "all" | string[];
export type Can = Record<string, CanValue>;
export type AccessMe = {
	kind: "main" | "mobile" | "external" | "plugin";
	name: string | null;
	plugin: string | null;
	level: AccessLevel | null;
	custom: false;
	can: Can;
};

/** Ce que l'appelant peut faire, pour les catégories d'actions connues (`categories`, dans n'importe quel ordre). */
export function capabilitiesOf(caller: Caller, categories: readonly string[]): Can {
	const full = caller.kind === "main" || caller.kind === "mobile";
	const token = caller.kind === "external" ? caller.token : undefined;
	const read = full || token !== undefined;
	const pilot = full || (token !== undefined && token.level !== "read");
	const protectedOk = full || token?.level === "pilot_full";
	const views = full ? { read: true, edit: "all" as const, create: true } : (token?.plugin?.views ?? { read: false, edit: false as const, create: false });

	const can: Can = {};
	for (const key of READ_RIGHTS) can[key] = read;
	// Le flux brut de débogage n'est jamais déduit d'un niveau : réservé à l'appli elle-même.
	can["read.debug"] = full;
	for (const cat of [...new Set(categories)].sort()) can[`actions.${cat}`] = pilot;
	can["actions.unknown"] = pilot;
	can["actions.dangerous"] = pilot;
	can["actions.protected"] = protectedOk;
	can["morse.send"] = pilot;
	can["views.read"] = views.read;
	can["views.edit"] = Array.isArray(views.edit) ? [...views.edit] : views.edit;
	can["views.create"] = views.create;
	// Jeton principal : PC seulement ; téléphone : réseau local par nature ; plugin : lancé sur le PC, jamais.
	can["net.lan"] = caller.kind === "mobile" || (token !== undefined && !token.plugin && token.lan);
	can.admin = caller.kind === "main";
	return can;
}

/** Qui est l'appelant et ce qu'il peut faire ; jamais la valeur du jeton, son empreinte, son id ni ses dates. */
export function describeCaller(caller: Caller, categories: readonly string[]): AccessMe {
	const token = caller.kind === "external" ? caller.token : undefined;
	const kind: AccessMe["kind"] = token ? (token.plugin ? "plugin" : "external") : caller.kind === "mobile" ? "mobile" : "main";
	return {
		kind,
		name: token?.name ?? null,
		plugin: token?.plugin?.id ?? null,
		level: token?.level ?? null,
		custom: false,
		can: capabilitiesOf(caller, categories),
	};
}
