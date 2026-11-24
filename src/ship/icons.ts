import type { ShipFunctionId } from "./functions.js";
import type { ShipState } from "./state.js";

/** Glyphes au trait d'origine (grille 24×24), un par fonction. */
export const BASE_ICONS: Record<ShipFunctionId, string> = {
	gear: "M12 4v11M7 10l5 5 5-5M5 20h14",
	lights: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
	vtol: "M12 20V9M7 14l5-5 5 5M5 4h14",
	transform: "M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4",
	decoupled: "M3 12h5M16 12h5M8 7v10M16 7v10",
	gsafe: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM12 8v5M12 16v.5",
	cruise: "M3 16a9 9 0 0 1 18 0M12 16l4-5M6 20h12",
	proximity: "M4 14a8 8 0 0 1 16 0M8 14a4 4 0 0 1 8 0M12 14v6",
	esp: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8",
	advanced_hud: "M3 5h18v14H3zM7 9h10M7 13h6",
	night_vision: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6",
	master_nav: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M15 9l-2 5-4 1 2-5z",
	power_engines: "M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z",
	power_weapons: "M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14M12 2v5M12 17v5M2 12h5M17 12h5",
	power_shields: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12l2 2 4-4",
	power_main: "M12 3v8M7 6a7 7 0 1 0 10 0",
	doors_closed: "M6 21V3h12v18M4 21h16M14 12h1",
	doors_locked: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4M12 15v2",
};

/** Couleurs d'un glyphe : `stroke` = trait principal, `accent` = vert (allumé) ou orange (en mouvement). */
export type GlyphColors = { stroke: string; accent: string };

const p = (d: string, stroke: string, extra = "") => `<path d="${d}" stroke="${stroke}"${extra ? ` ${extra}` : ""}/>`;
const halo = (accent: string, r = 10, cy = 12) => `<circle cx="12" cy="${cy}" r="${r}" fill="${accent}" fill-opacity="0.18" stroke="none"/>`;
const fillSoft = (accent: string, o = 0.3) => `fill="${accent}" fill-opacity="${o}"`;

/** Pictogramme dessiné selon l'état (forme qui change), dans la grille 24×24. Allumé = on ; le reste = éteint. */
type StateGlyph = (on: boolean, c: GlyphColors) => string;

const STATE_GLYPHS: Partial<Record<ShipFunctionId, StateGlyph>> = {
	lights: (on, c) =>
		on
			? `${halo(c.accent, 9, 9)}${p(BASE_ICONS.lights, c.stroke, 'fill="#FFFFFF" fill-opacity="0.85"')}${p("M12 0v1M3.5 3.5l1 1M20.5 3.5l-1 1M0 10h1.5M22.5 10H24", c.accent)}`
			: p(BASE_ICONS.lights, c.stroke),
	decoupled: (on, c) =>
		on
			? `${p("M3 12h5M16 12h5", c.stroke)}${p("M8 8v8M16 8v8", c.accent)}${p("M10.5 9l3 6", c.accent, 'stroke-dasharray="2 2"')}`
			: p("M3 12h18M8 8v8M16 8v8", c.stroke),
	gsafe: (on, c) =>
		on
			? `${p("M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z", c.stroke, fillSoft(c.accent, 0.35))}${p("M12 8v5M12 16v.5", "#FFFFFF")}`
			: p(BASE_ICONS.gsafe, c.stroke),
	night_vision: (on, c) =>
		on
			? `${p("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z", c.stroke)}<circle cx="12" cy="12" r="3.5" fill="#7CFC9A" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="#0B2A14" stroke="none"/>${p("M5 9h14M4 15h16", "#7CFC9A", 'stroke-opacity="0.35"')}`
			: `${p("M2 12s4 5 10 5 10-5 10-5", c.stroke)}${p("M5 15l-1.5 2M9 16.6l-.6 2.4M15 16.6l.6 2.4M19 15l1.5 2", c.stroke)}`,
	master_nav: (on, c) =>
		on
			? `<circle cx="12" cy="12" r="9" stroke="${c.stroke}"/>${p("M15 9l-2 5-4 1 2-5z", c.accent, `fill="${c.accent}"`)}`
			: `<circle cx="12" cy="12" r="9" stroke="${c.stroke}"/>${p("M12 5v4M12 15v4M5 12h4M15 12h4", c.stroke)}<circle cx="12" cy="12" r="1" fill="${c.stroke}" stroke="none"/>`,
	power_engines: (on, c) =>
		on
			? `${p(BASE_ICONS.power_engines, "#FFFFFF", fillSoft(c.accent, 0.6))}${p("M12 13a2 2 0 0 0 0 5", "#FFD27A")}`
			: p(BASE_ICONS.power_engines, c.stroke),
	power_shields: (on, c) =>
		on
			? `${p("M12 1l9 3.8v7.4c0 5-3.8 8.8-9 11.3-5.2-2.5-9-6.3-9-11.3V4.8z", c.accent, 'stroke-opacity="0.5"')}${p("M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z", c.stroke, fillSoft(c.accent))}${p("M9 12l2 2 4-4", "#FFFFFF")}`
			: p("M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z", c.stroke, 'stroke-dasharray="3 2"'),
	doors_closed: (on, c) =>
		on
			? `${p("M6 21V3h12v18", c.stroke, fillSoft(c.accent, 0.25))}${p("M4 21h16M14 12h1", c.stroke)}`
			: `${p("M6 21V3h12v18M4 21h16", c.stroke, 'stroke-opacity="0.45"')}${p("M6 21V3l6 2.5v18z", c.stroke)}`,
	doors_locked: (on, c) =>
		on
			? `${p("M6 11h12v10H6z", c.stroke, fillSoft(c.accent))}${p("M8 11V7a4 4 0 0 1 8 0v4", c.stroke)}${p("M12 15v2", "#FFFFFF")}`
			: `${p("M6 11h12v10H6z", c.stroke)}${p("M12 9V5a4 4 0 0 1 8 0", c.stroke)}${p("M12 15v2", c.stroke)}`,
};

/** VTOL : le moteur pivote de 0° (éteint) à 90° (allumé) ; `angle` sert pendant le mouvement. */
function vtolGlyph(angle: number, on: boolean, c: GlyphColors): string {
	return [
		p("M2 12h6M16 12h6", c.stroke),
		`<g transform="rotate(${angle.toFixed(1)} 12 12)">`,
		`<rect x="8" y="9.5" width="8" height="5" rx="2" stroke="${c.stroke}"${on ? ` ${fillSoft(c.accent)}` : ""}/>`,
		p("M8 12H5", angle > 0 ? c.accent : c.stroke, 'stroke-dasharray="1.5 1.5"'),
		`</g>`,
		on ? p("M9 18v3M12 18v4M15 18v3", c.accent) : "",
	].join("");
}

/**
 * Pictogramme d'une fonction selon son état. `phase` (0 à 1) anime le mouvement : le VTOL pivote,
 * les autres pictogrammes clignotent doucement en orange. Le train garde son glyphe d'origine.
 */
export function stateGlyph(id: ShipFunctionId, state: ShipState, c: GlyphColors, phase = 0): string {
	const moving = state === "moving-on" || state === "moving-off";
	const on = state === "on";
	if (id === "vtol") {
		if (!moving) return vtolGlyph(on ? 90 : 0, on, c);
		// Aller-retour 0 → 90° (sortie) ou 90 → 0° (rentrée).
		const t = phase < 0.5 ? phase * 2 : 2 - phase * 2;
		return vtolGlyph(90 * (state === "moving-on" ? t : 1 - t), false, c);
	}
	if (moving) {
		const opacity = (0.45 + 0.55 * Math.abs(Math.cos(Math.PI * phase))).toFixed(2);
		return `<g opacity="${opacity}">${p(BASE_ICONS[id], c.stroke)}</g>`;
	}
	const draw = STATE_GLYPHS[id];
	if (draw) return draw(on, c);
	// Fonctions sans dessin propre (train, croisière, ESP…) : glyphe d'origine, halo quand c'est allumé.
	return `${on && id !== "gear" ? halo(c.accent) : ""}${p(BASE_ICONS[id], c.stroke)}`;
}
