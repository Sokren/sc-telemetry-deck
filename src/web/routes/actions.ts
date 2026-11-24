import { ACTOR_GROUPS, SHIP_GROUPS } from "../../catalog/dropdown.js";
import { groupLabel, labelFor } from "../../catalog/labels.js";
import type { ActionSource } from "../../catalog/source.js";
import { PROTECTED_ACTIONS } from "../../game/dangerous.js";
import type { GameApi } from "../../game/types.js";
import { mayTriggerDangerous } from "../access.js";
import type { Route } from "../http.js";

export const TRIGGER_TIMEOUT_MS = 2000;
/** Ordre des groupes : perso, vaisseau, puis les autres catégories par ordre alphabétique. */
const KNOWN_ORDER = [...ACTOR_GROUPS, ...SHIP_GROUPS].map((g) => g.category);

export function actionRoutes(deps: { game: Pick<GameApi, "trigger">; source: ActionSource }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/actions",
			access: "read",
			handle: async ({ lang, caller }) => {
				const { actions, live } = await deps.source.getActions();
				// Un jeton externe sans « Pilotage complet » ne voit pas les actions protégées.
				const offered = mayTriggerDangerous(caller) ? actions : actions.filter((a) => !PROTECTED_ACTIONS.has(a.name));
				const categories = [...new Set(offered.map((a) => a.category))].sort((a, b) => {
					const ia = KNOWN_ORDER.indexOf(a);
					const ib = KNOWN_ORDER.indexOf(b);
					return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
				});
				const groups = categories.map((category) => ({
					category,
					label: groupLabel(category, lang),
					actions: offered
						.filter((a) => a.category === category)
						.map((a) => ({ name: a.name, label: labelFor(a.name, lang), holdable: a.holdable }))
						.sort((x, y) => x.label.localeCompare(y.label, lang)),
				}));
				return { status: 200, json: { live, groups } };
			},
		},
		{
			method: "POST",
			path: "/api/v1/actions/{name}/trigger",
			access: "pilot",
			handle: async ({ params, caller, mark }) => {
				if (PROTECTED_ACTIONS.has(params.name)) {
					if (!mayTriggerDangerous(caller)) return { status: 403, json: { error: "forbidden", reason: "dangerous_action" } };
					mark("sensitive");
				}
				const result = await deps.game.trigger(params.name, TRIGGER_TIMEOUT_MS);
				return result.ok ? { status: 200, json: { ok: true } } : { status: 502, json: result };
			},
		},
	];
}
