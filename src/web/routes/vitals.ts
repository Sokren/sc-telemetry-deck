// SPDX-License-Identifier: MPL-2.0
import type { Lang } from "../../catalog/labels.js";
import { toView } from "../../display/format.js";
import { DISPLAY_VALUES, isDisplayValueId, readValue, type DisplayValueId } from "../../display/values.js";
import type { TelemetryHub } from "../../telemetry/hub.js";
import type { Route } from "../http.js";

export type Vital = {
	id: DisplayValueId;
	label: string;
	available: boolean;
	text: string;
	unit: string;
	percent?: number;
	/** Solde seulement : montant brut en chiffres (le texte est compact : 12,3 k), mis en forme par la page. */
	amount?: string;
	level: "ok" | "warn" | "bad" | "none";
};

/** Constante du perso telle qu'affichée sur une touche Actor Display, en données. */
export function vitalOf(id: DisplayValueId, actor: Record<string, unknown> | undefined, lang: Lang): Vital {
	const reading = readValue(id, actor);
	const view = toView(id, reading, lang);
	const vital: Vital = { id, label: view.long, available: reading.available, text: view.text, unit: view.unit, level: "none" };
	if (reading.available && reading.kind === "percent") vital.percent = Math.round(reading.percent * 10) / 10;
	if (reading.available && (reading.kind === "percent" || reading.kind === "number")) vital.level = reading.level;
	if (reading.available && reading.kind === "money") vital.amount = reading.value;
	return vital;
}

export function vitalRoutes(deps: { hub: Pick<TelemetryHub, "section"> }): Route[] {
	return [
		{
			method: "GET",
			path: "/api/v1/vitals",
			access: "read",
			handle: async ({ lang }) => ({ status: 200, json: DISPLAY_VALUES.map((id) => vitalOf(id, deps.hub.section("actor"), lang)) }),
		},
		{
			method: "GET",
			path: "/api/v1/vitals/{id}",
			access: "read",
			handle: async ({ params, lang }) =>
				isDisplayValueId(params.id)
					? { status: 200, json: vitalOf(params.id, deps.hub.section("actor"), lang) }
					: { status: 404, json: { error: "not_found" } },
		},
	];
}
