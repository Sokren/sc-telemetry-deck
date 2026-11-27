import { DANGEROUS_ACTIONS, PROTECTED_ACTIONS } from "../../game/dangerous.js";
import { mayTriggerDangerous } from "../access.js";
import type { Lang } from "../../catalog/labels.js";
import type { GameApi } from "../../game/types.js";
import { isDangerState, isReadOnly, SHIP_FUNCTION_IDS, shipFunction, type ShipFunctionId } from "../../ship/functions.js";
import { decidePress, type ShipMode } from "../../ship/press.js";
import { shipFunctionName, toShipView } from "../../ship/render.js";
import { readShipState, type ShipState } from "../../ship/state.js";
import type { TelemetryHub } from "../../telemetry/hub.js";
import type { Route } from "../http.js";
import { TRIGGER_TIMEOUT_MS } from "./actions.js";

/** `readOnly` (seulement s'il est vrai) : aucune commande du jeu, l'état se lit mais un appui ne fait rien. */
/** `danger` (seulement s'il est vrai) : état dangereux, ex. portes ouvertes. */
/** `words` : mots des deux états (interrupteur de « Ma vue » : SCM / NAV, RENTRÉ / SORTI…). */
export type ShipFunctionState = {
	id: ShipFunctionId;
	name: string;
	label: string;
	state: ShipState;
	word: string;
	words: { on: string; off: string };
	readOnly?: true;
	danger?: true;
};

const isId = (x: string): x is ShipFunctionId => (SHIP_FUNCTION_IDS as readonly string[]).includes(x);
const MODES: readonly ShipMode[] = ["toggle", "on", "off"];

export function shipStateOf(id: ShipFunctionId, hub: Pick<TelemetryHub, "section">, lang: Lang): ShipFunctionState {
	const state = readShipState(id, hub.section("vehicle"), hub.section("actor"));
	const view = toShipView(id, state, lang);
	const words = { on: toShipView(id, "on", lang).word, off: toShipView(id, "off", lang).word };
	const base = { id, name: shipFunctionName(id, lang), label: view.label, state, word: view.word, words };
	return {
		...base,
		...(isReadOnly(shipFunction(id)) ? { readOnly: true as const } : {}),
		...(isDangerState(id, state) ? { danger: true as const } : {}),
	};
}

/** Code stable d'un refus (indépendant de la langue). */
export type RefusalCode = "unavailable" | "no_command";

const REFUSALS: Record<RefusalCode, Record<Lang, string>> = {
	unavailable: { fr: "Ce vaisseau n'a pas cette fonction.", en: "This ship does not have this function." },
	no_command: { fr: "Aucune commande sûre pour ce mode dans l'état actuel.", en: "No safe command for this mode in the current state." },
};

export type PressOutcome =
	| { status: 403; json: { error: "forbidden"; reason: "dangerous_action" } }
	| { status: 200; json: { decision: "sent"; action: string; ok: true } | { decision: "noop" } }
	| { status: 409; json: { decision: "refused"; code: RefusalCode; reason: string } }
	| { status: 502; json: { decision: "sent"; action: string; ok: false; reason: string; message?: string } };

/** Appui sur une fonction vaisseau, mêmes règles que la touche Ship Toggle (`decidePress`). */
export async function pressShipFunction(
	id: ShipFunctionId,
	mode: ShipMode,
	deps: { hub: Pick<TelemetryHub, "section">; game: Pick<GameApi, "trigger"> },
	lang: Lang = "en",
	/**
	 * `allowProtected: false` : une commande protégée (déverrouillage) est refusée sans rien envoyer.
	 * `onSensitive` : appelé juste avant l'envoi de toute commande dangereuse (protégée ou non).
	 */
	guard: { allowProtected: boolean; onSensitive?: () => void } = { allowProtected: true },
): Promise<PressOutcome> {
	const fn = shipFunction(id);
	const state = readShipState(id, deps.hub.section("vehicle"), deps.hub.section("actor"));
	const decision = decidePress(fn, state, mode);
	if (decision.kind === "noop") return { status: 200, json: { decision: "noop" } };
	if (decision.kind === "refuse") {
		// La raison de `decidePress` (module partagé) est en français : on expose un code stable et une raison traduite.
		const code: RefusalCode = state === "unavailable" ? "unavailable" : "no_command";
		return { status: 409, json: { decision: "refused", code, reason: REFUSALS[code][lang] } };
	}
	if (PROTECTED_ACTIONS.has(decision.action) && !guard.allowProtected) return { status: 403, json: { error: "forbidden", reason: "dangerous_action" } };
	if (DANGEROUS_ACTIONS.has(decision.action)) guard.onSensitive?.();
	const result = await deps.game.trigger(decision.action, TRIGGER_TIMEOUT_MS);
	return result.ok
		? { status: 200, json: { decision: "sent", action: decision.action, ok: true } }
		: { status: 502, json: { decision: "sent", action: decision.action, ok: false, reason: result.reason, ...(result.message ? { message: result.message } : {}) } };
}

export function shipRoutes(deps: { hub: Pick<TelemetryHub, "section">; game: Pick<GameApi, "trigger"> }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/ship/functions",
			access: "read",
			handle: async ({ lang }) => ({ status: 200, json: SHIP_FUNCTION_IDS.map((id) => shipStateOf(id, deps.hub, lang)) }),
		},
		{
			method: "GET",
			path: "/api/v1/ship/functions/{id}",
			access: "read",
			handle: async ({ params, lang }) =>
				isId(params.id) ? { status: 200, json: shipStateOf(params.id, deps.hub, lang) } : { status: 404, json: { error: "not_found" } },
		},
		{
			method: "POST",
			path: "/api/v1/ship/functions/{id}/press",
			access: "pilot",
			handle: async ({ params, body, lang, caller, mark }) => {
				if (!isId(params.id)) return { status: 404, json: { error: "not_found" } };
				const asked = (body as { mode?: unknown } | undefined)?.mode;
				if (asked !== undefined && !MODES.includes(asked as ShipMode)) return { status: 400, json: { error: "bad_request" } };
				return pressShipFunction(params.id, (asked as ShipMode | undefined) ?? "toggle", deps, lang, {
					allowProtected: mayTriggerDangerous(caller),
					onSensitive: () => mark("sensitive"),
				});
			},
		},
	];
}
