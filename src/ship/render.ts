import type { Lang } from "../catalog/labels.js";
import type { ShipFunctionId } from "./functions.js";
import { BASE_ICONS, stateGlyph } from "./icons.js";
import en from "./labels.en.json" with { type: "json" };
import fr from "./labels.fr.json" with { type: "json" };
import type { ShipState } from "./state.js";

/** Apparence choisie sur la touche : A texte, B voyant, C fond coloré. */
export type ShipStyle = "text" | "led" | "fill";
export type Tone = "on" | "off" | "moving" | "none";

export type ShipView = { id: ShipFunctionId; label: string; word: string; tone: Tone };

export const SHIP_COLORS = {
	on: "#1D9E75",
	moving: "#EF9F27",
	off: "#888780",
	none: "#5F5E5A",
	onFill: "#0F6E56",
	movingFill: "#854F0B",
	background: "#111418",
	label: "#C9D1DB",
	white: "#FFFFFF",
	dim: "#444441",
	danger: "#E24B4A",
	dangerFill: "#7A1F1F",
} as const;

type FunctionLabels = { name: string; label: string; on: string; off: string };
const TABLES: Record<Lang, Record<string, FunctionLabels>> = { fr: fr.functions, en: en.functions };

/** Nom complet de la fonction (liste du panneau). */
export function shipFunctionName(id: ShipFunctionId, lang: Lang): string {
	return TABLES[lang][id].name;
}

export function toShipView(id: ShipFunctionId, state: ShipState, lang: Lang): ShipView {
	const l = TABLES[lang][id];
	switch (state) {
		case "on":
			return { id, label: l.label, word: l.on, tone: "on" };
		case "off":
			return { id, label: l.label, word: l.off, tone: "off" };
		case "moving-on":
		case "moving-off":
			return { id, label: l.label, word: "…", tone: "moving" };
		default:
			return { id, label: l.label, word: "—", tone: "none" };
	}
}

const ICONS = BASE_ICONS;

const FONT = "Segoe UI, Arial, sans-serif";
const escapeXml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TONE_TEXT: Record<Tone, string> = { on: SHIP_COLORS.on, moving: SHIP_COLORS.moving, off: SHIP_COLORS.off, none: SHIP_COLORS.none };

/** Image de touche 144×144 (data URI SVG) d'un interrupteur vaisseau, dans le style choisi. */
/** `danger` : état dangereux (portes ouvertes…) → contour rouge, mot en rouge, ⚠ (fond rouge en style C). */
export function renderShipKey(view: ShipView, style: ShipStyle, danger = false): string {
	const filled = style === "fill" && (view.tone === "on" || view.tone === "moving" || danger);
	const bg = !filled
		? SHIP_COLORS.background
		: danger
			? SHIP_COLORS.dangerFill
			: view.tone === "on"
				? SHIP_COLORS.onFill
				: SHIP_COLORS.movingFill;
	const iconColor = view.tone === "none" ? SHIP_COLORS.dim : view.tone === "off" ? SHIP_COLORS.off : SHIP_COLORS.white;
	const labelColor = view.tone === "none" ? SHIP_COLORS.none : SHIP_COLORS.label;
	const wordColor = filled ? SHIP_COLORS.white : danger ? SHIP_COLORS.danger : TONE_TEXT[view.tone];
	const withWord = style !== "led";

	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">`,
		`<rect width="144" height="144" fill="${bg}"/>`,
		`<g transform="translate(${withWord ? "48 14" : "44 20"}) scale(${withWord ? 2 : 2.33})" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[view.id]}"/></g>`,
		`<text x="72" y="${withWord ? 86 : 104}" font-family="${FONT}" font-size="${withWord ? 18 : 20}" fill="${labelColor}" text-anchor="middle">${escapeXml(view.label)}</text>`,
	];
	if (withWord) {
		const size = [...view.word].length > 7 ? 20 : 24;
		parts.push(
			`<text x="72" y="120" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${wordColor}" text-anchor="middle">${escapeXml(view.word)}</text>`,
		);
	}
	if (danger) {
		parts.push(`<rect x="3" y="3" width="138" height="138" rx="12" fill="none" stroke="${SHIP_COLORS.danger}" stroke-width="5"/>`);
		// ⚠ en haut à gauche (le voyant du style B est en haut à droite).
		parts.push(`<text x="22" y="32" font-family="${FONT}" font-size="22" fill="${SHIP_COLORS.danger}" text-anchor="middle">⚠</text>`);
	}
	if (style === "led") {
		if (view.tone === "none") {
			// Pas de données : « — » à la place du voyant, pour ne pas ressembler à « éteint ».
			parts.push(`<text x="124" y="30" font-family="${FONT}" font-size="26" font-weight="bold" fill="${SHIP_COLORS.none}" text-anchor="middle">${escapeXml(view.word)}</text>`);
		} else {
			const led = danger ? SHIP_COLORS.danger : view.tone === "on" ? SHIP_COLORS.on : view.tone === "moving" ? SHIP_COLORS.moving : SHIP_COLORS.off;
			parts.push(`<circle cx="124" cy="20" r="9" fill="${led}"/>`);
		}
	}
	parts.push(`</svg>`);
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(parts.join(""))}`;
}

/** Options du rendu avec état (Ship Action). */
export type StatefulKeyOptions = {
	/** État lu (forme du pictogramme). */
	state: ShipState;
	/** Libellé en bas de la touche ; `null` = aucun (le titre du Stream Deck s'affiche à la place). */
	label: string | null;
	/** Phase de l'animation de mouvement, de 0 à 1. */
	phase?: number;
	/** Agrandissement du pictogramme (« pop » au changement d'état), 1 = normal. */
	pop?: number;
	danger?: boolean;
};

/**
 * Image de touche 144×144 de Ship Action avec état : pictogramme qui change selon l'état, mot d'état
 * au milieu, libellé en bas (là où le Stream Deck affiche son titre, pour qu'un titre saisi le remplace).
 */
export function renderStatefulKey(view: ShipView, style: ShipStyle, o: StatefulKeyOptions): string {
	const danger = o.danger ?? false;
	const filled = style === "fill" && (view.tone === "on" || view.tone === "moving" || danger);
	const bg = !filled
		? SHIP_COLORS.background
		: danger
			? SHIP_COLORS.dangerFill
			: view.tone === "on"
				? SHIP_COLORS.onFill
				: SHIP_COLORS.movingFill;
	const stroke = view.tone === "none" ? SHIP_COLORS.dim : view.tone === "off" ? SHIP_COLORS.off : SHIP_COLORS.white;
	const accent = view.tone === "moving" ? SHIP_COLORS.moving : filled ? "#9FF0CF" : SHIP_COLORS.on;
	const wordColor = filled ? SHIP_COLORS.white : danger ? SHIP_COLORS.danger : TONE_TEXT[view.tone];
	const withWord = style !== "led";
	const glyphState: ShipState = view.tone === "none" ? "unknown" : o.state;
	const glyph = stateGlyph(view.id, glyphState, { stroke, accent }, o.phase ?? 0);
	// Pictogramme : 24 × scale px, centré horizontalement, agrandi autour de son centre pour le « pop ».
	const scale = (withWord ? 2.2 : 2.6) * (o.pop ?? 1);
	const top = withWord ? 34 : 50;
	const x = 72 - 12 * scale;
	const y = top - 12 * scale;

	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">`,
		`<rect width="144" height="144" fill="${bg}"/>`,
		`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`,
	];
	if (withWord) {
		const size = [...view.word].length > 7 ? 20 : 24;
		parts.push(
			`<text x="72" y="91" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${wordColor}" text-anchor="middle">${escapeXml(view.word)}</text>`,
		);
	}
	if (o.label !== null) {
		const color = view.tone === "none" ? SHIP_COLORS.none : SHIP_COLORS.label;
		const size = [...o.label].length > 11 ? 16 : 19;
		parts.push(`<text x="72" y="128" font-family="${FONT}" font-size="${size}" fill="${color}" text-anchor="middle">${escapeXml(o.label)}</text>`);
	}
	if (danger) {
		parts.push(`<rect x="3" y="3" width="138" height="138" rx="12" fill="none" stroke="${SHIP_COLORS.danger}" stroke-width="5"/>`);
		parts.push(`<text x="22" y="32" font-family="${FONT}" font-size="22" fill="${SHIP_COLORS.danger}" text-anchor="middle">⚠</text>`);
	}
	if (style === "led") {
		if (view.tone === "none") {
			parts.push(`<text x="124" y="30" font-family="${FONT}" font-size="26" font-weight="bold" fill="${SHIP_COLORS.none}" text-anchor="middle">—</text>`);
		} else {
			const led = danger ? SHIP_COLORS.danger : view.tone === "on" ? SHIP_COLORS.on : view.tone === "moving" ? SHIP_COLORS.moving : SHIP_COLORS.off;
			if (view.tone === "on" && !danger) parts.push(`<circle cx="124" cy="20" r="14" fill="${SHIP_COLORS.on}" fill-opacity="0.25"/>`);
			parts.push(`<circle cx="124" cy="20" r="9" fill="${led}"${view.tone === "moving" ? ` fill-opacity="${(0.4 + 0.6 * Math.abs(Math.cos(Math.PI * (o.phase ?? 0)))).toFixed(2)}"` : ""}/>`);
		}
	}
	parts.push(`</svg>`);
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(parts.join(""))}`;
}
