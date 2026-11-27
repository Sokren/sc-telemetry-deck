// SPDX-License-Identifier: MPL-2.0
import type { Lang } from "../catalog/labels.js";

type Role = "pilot" | "gunner" | "crew" | "none";

/**
 * Mots reconnus dans le nom technique du siège (`seat_name`), du plus précis au plus général :
 * `CoPilot` doit passer avant `Pilot`, `RemoteTurret` est une tourelle.
 */
const WORDS: [RegExp, Record<Lang, string>][] = [
	// Postes (vu sur l'Hermes : `RSI_Hermes_Tractor_Station_…`) : le poste compte plus que « tourelle » ou « siège ».
	[/tractor/i, { fr: "Rayon tracteur", en: "Tractor beam" }],
	[/mining/i, { fr: "Minage", en: "Mining" }],
	[/salvage/i, { fr: "Récupération", en: "Salvage" }],
	[/co-?pilot/i, { fr: "Copilote", en: "Co-pilot" }],
	[/pilot/i, { fr: "Pilote", en: "Pilot" }],
	[/turret/i, { fr: "Tourelle", en: "Turret" }],
	[/gunner/i, { fr: "Tireur", en: "Gunner" }],
	[/engineer/i, { fr: "Ingénieur", en: "Engineer" }],
	[/captain/i, { fr: "Capitaine", en: "Captain" }],
	[/navigat/i, { fr: "Navigateur", en: "Navigator" }],
	[/passenger/i, { fr: "Passager", en: "Passenger" }],
	[/station/i, { fr: "Poste", en: "Station" }],
];

const ROLES: Record<Lang, Record<Exclude<Role, "none">, string>> = {
	fr: { pilot: "Pilote", gunner: "Tireur", crew: "Équipage" },
	en: { pilot: "Pilot", gunner: "Gunner", crew: "Crew" },
};
const SEAT: Record<Lang, string> = { fr: "Siège", en: "Seat" };

/**
 * Étiquette lisible du siège : `RSI_Hermes_SeatDashboard_CoPilot_877605416445` → « Copilote ».
 * Sans mot connu (ex. Prospector), le rôle du perso ; à défaut « Siège ». Pas de siège → `null`.
 */
export function seatLabel(seat: string | null | undefined, role: Role, lang: Lang): string | null {
	if (!seat) return null;
	for (const [re, label] of WORDS) if (re.test(seat)) return label[lang];
	return role === "none" ? SEAT[lang] : ROLES[lang][role];
}
