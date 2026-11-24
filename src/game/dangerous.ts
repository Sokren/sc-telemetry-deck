/**
 * Actions sensibles : autodestruction, éjection, coupure totale, ouverture ou déverrouillage des portes et des sas.
 * Les touches Stream Deck et l'appli web les envoient en un appui (décision du
 * 22/11/2026) ; l'éjection demande d'appui maintenu (`HOLD_ACTIONS`).
 */
export const DANGEROUS_ACTIONS: ReadonlySet<string> = new Set([
	"v_self_destruct",
	"v_eject",
	"v_emergency_exit",
	"v_power_set_off",
	"v_power_toggle",
	"v_open_all_doors",
	"v_toggle_all_doors",
	"v_unlock_all_doors",
	"v_unlock_all_ports",
	// Bascules de verrouillage : peuvent déverrouiller.
	"v_toggle_all_doorlocks",
	"v_toggle_all_portlocks",
]);

/**
 * Actions protégées pour les jetons externes (outils, plugins) : éjection, autodestruction et déverrouillage du
 * vaisseau (les bascules de verrous peuvent déverrouiller). Réservées au jeton principal et au niveau
 * « Pilotage complet » ; le reste (sortie d'urgence, coupure de puissance, ouverture des portes) est normal
 * (décision du 24/11/2026). Distincte de `DANGEROUS_ACTIONS`.
 */
export const PROTECTED_ACTIONS: ReadonlySet<string> = new Set([
	"v_eject",
	"v_self_destruct",
	"v_unlock_all_doors",
	"v_unlock_all_ports",
	"v_toggle_all_doorlocks",
	"v_toggle_all_portlocks",
]);

/** Actions qui demandent de rester appuyé (touche, case de l'appli web) avant d'être envoyées. */
export const HOLD_ACTIONS: ReadonlySet<string> = new Set(["v_eject"]);
/** Durée d'appui maintenu (ms). */
export const HOLD_MS = 1500;
