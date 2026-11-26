import type { Route } from "../http.js";
import type { UpdateChecker } from "../update-check.js";

/** Vérification de version : état, vérifier maintenant, activer / désactiver la vérification automatique. */
export function updateRoutes(deps: { updates: UpdateChecker }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/update",
			handle: async () => ({ status: 200, json: deps.updates.state }),
		},
		{
			method: "POST",
			path: "/api/v1/update/check",
			// Réglages de l'appli : jeton admin seulement (le badge des mobiles lit seulement l'état).
			admin: true,
			handle: async () => ({ status: 200, json: await deps.updates.check() }),
		},
		{
			method: "PUT",
			path: "/api/v1/update",
			admin: true,
			handle: async ({ body }) => {
				const auto = (body as { auto?: unknown } | null)?.auto;
				if (typeof auto !== "boolean") return { status: 400, json: { error: "bad_request" } };
				deps.updates.setAuto(auto);
				return { status: 200, json: deps.updates.state };
			},
		},
	];
}
