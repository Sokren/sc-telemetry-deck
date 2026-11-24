// Jauges de « Ma vue » : anneau, arc, barres, segments et chiffre. Dessin construit une fois, puis mis à jour sur
// place à chaque frame (longueur de l'arc, taille de la barre, segments allumés, texte). Couleurs par classes
// `level-*` et variables du thème (style.css) : aucune couleur ici.

import { num } from "./numbers.js";

export const STYLES = ["card", "ring", "arc", "bar", "vbar", "segments", "vsegments", "number", "line"];
const STYLED_KINDS = ["vital", "instrument", "character_info", "ship_info", "ship_function", "action"];
const SEGMENTS = 10;
const SVG = "http://www.w3.org/2000/svg";

/**
 * Styles proposés pour une case. `isGauge` : la donnée a un pourcentage (`true`), n'en a pas (`false`), ou on ne
 * sait pas encore (`null`, pas de données) → tout est proposé.
 * @param {string} kind
 * @param {boolean | null} isGauge
 * @param {string} [ref] référence de la case (cap → règle ; voyant boost → carte seulement)
 */
export function stylesFor(kind, isGauge, ref) {
	if (!STYLED_KINDS.includes(kind)) return ["card"];
	// Mêmes règles que l'appli (stylesAllowed dans src/web/view.ts).
	if (kind === "ship_function") return ["card", "switch"];
	if (kind === "action") return ["card", "slide", "hold"];
	if (kind === "ship_info" && ref === "boost") return ["card"];
	const base = isGauge === false ? ["card", "number", "line"] : [...STYLES];
	return kind === "instrument" && ref === "heading" ? [...base, "tape"] : base;
}

/** Décalage (px) de la bande de la règle de cap pour un cap donné (0–359°, ramené dans le tour). */
export function tapeOffset(heading, pxPerDeg) {
	return -(((heading % 360) + 360) % 360) * pxPerDeg;
}

const TAPE_PX = 6;
const CARDINAL = { 0: "N", 90: "E", 180: "S", 270: "W" };

/**
 * Cap « déroulé » : nouveau cap `raw` (0–359) ramené au plus près de `prev` (sans borne), pour que la règle passe
 * 359 → 0 en continuant dans le même sens au lieu de faire tout le tour en arrière. `prev` absent → `raw`.
 */
export function unwrapHeading(prev, raw) {
	if (prev === null || prev === undefined || !Number.isFinite(prev)) return raw;
	const delta = ((((raw - prev) % 360) + 540) % 360) - 180;
	return prev + delta;
}

/**
 * Règle de cap : bande graduée (5°, chiffres tous les 45°, N / E / S / W) qui défile sans fin, cap encadré au
 * centre. Le cap reçu (≈ 17 fois par seconde) est suivi en douceur image par image ; la bande couvre un tour et
 * demi de chaque côté et se recentre d'un tour entier (invisible, elle se répète) quand on s'en éloigne.
 */
function renderTape(data, size) {
	const sz = size <= 0.5 ? "gss" : size >= 2 ? "gs2" : "gs1";
	const root = el("div", `gauge g-tape ${sz}`);
	root.setAttribute("role", "img");
	const strip = el("div", "tstrip");
	for (let d = -540; d <= 900; d += 5) {
		const n = ((d % 360) + 360) % 360;
		const tick = el("i", n % 15 ? "" : "major");
		tick.style.left = `${d * TAPE_PX}px`;
		strip.append(tick);
		const word = CARDINAL[n] ?? (n % 45 === 0 ? String(n).padStart(3, "0") : null);
		if (word) {
			const b = el("b", CARDINAL[n] ? "card" : "", word);
			b.style.left = `${d * TAPE_PX}px`;
			strip.append(b);
		}
	}
	const value = el("div", "tvalue");
	const label = el("div", "glabel");
	root.append(strip, value, label);
	let target = null;
	let shown = null;
	let raf = 0;
	const draw = () => {
		strip.style.transform = `translateX(${-shown * TAPE_PX}px)`;
	};
	const step = () => {
		raf = 0;
		if (shown === null || target === null || !root.isConnected) return;
		const gap = target - shown;
		shown = Math.abs(gap) < 0.05 ? target : shown + gap * 0.25;
		// Recentrage d'un tour entier : même image, la bande ne s'épuise jamais.
		if (shown > 360 || shown < 0) {
			const turn = Math.floor(shown / 360) * 360;
			shown -= turn;
			target -= turn;
		}
		draw();
		if (shown !== target) raf = requestAnimationFrame(step);
	};
	const update = (d) => {
		const h = Number(String(d.text).replace(",", "."));
		const known = d.text !== "—" && Number.isFinite(h);
		root.classList.toggle("tunknown", !known);
		if (known) {
			target = unwrapHeading(target, ((h % 360) + 360) % 360);
			if (shown === null) {
				shown = target;
				draw();
			} else if (!raf && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(step);
		}
		value.textContent = known ? `${String(Math.round(((h % 360) + 360) % 360) % 360).padStart(3, "0")}°` : "—";
		label.textContent = d.label ?? "";
		root.setAttribute("aria-label", `${d.label ?? ""} ${value.textContent}`.trim());
	};
	update(data);
	return { el: root, update };
}

/** Segments allumés sur `count` : arrondi vers le haut dès que la valeur dépasse 0. */
export function litSegments(pct, count = SEGMENTS) {
	if (pct === null || !(pct > 0)) return 0;
	return Math.min(count, Math.ceil(pct / (100 / count)));
}

/** Donnée de case → pourcentage borné (ou `null`), texte et niveau. */
export function gaugeModel(data) {
	const p = data?.percent;
	const pct = typeof p === "number" && Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : null;
	return { pct, text: data?.text ?? "—", level: data?.level ?? "none" };
}

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};
const svgEl = (tag, attrs) => {
	const e = document.createElementNS(SVG, tag);
	for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
	return e;
};

/** Valeur affichée : texte et unité (« — » seul quand il n'y a rien). */
const valueText = (data) => {
	const text = num(data.text);
	return text === "—" || !data.unit ? text : `${text} ${data.unit}`;
};

/** Texte dans un anneau / arc : le nombre seul pour un pourcentage, sinon la valeur complète (jamais cachée). */
export function gaugeText(data) {
	return data.unit === "%" ? num(data.text) : valueText(data);
}

/** Anneau (cercle complet) ou arc (demi-cercle) : tracé de fond + tracé de valeur sur une longueur de 100. */
function curve(kind) {
	const ring = kind === "ring";
	const svg = svgEl("svg", { viewBox: ring ? "0 0 100 100" : "0 0 100 60", class: "gsvg", "aria-hidden": "true" });
	const shape = ring
		? () => svgEl("circle", { cx: 50, cy: 50, r: 42, pathLength: 100, transform: "rotate(-90 50 50)" })
		: () => svgEl("path", { d: "M 10 52 A 40 40 0 0 1 90 52", pathLength: 100 });
	const track = shape();
	track.setAttribute("class", "gtrack");
	const value = shape();
	value.setAttribute("class", "gval");
	const text = svgEl("text", { x: 50, y: ring ? 52 : 46, class: "gtext", "text-anchor": "middle", "dominant-baseline": "middle" });
	svg.append(track, value, text);
	return {
		node: svg,
		set(m, data) {
			value.setAttribute("stroke-dasharray", `${m.pct ?? 0} 100`);
			text.textContent = gaugeText(data);
		},
	};
}

/** Barre horizontale ou verticale. */
function bar(vertical) {
	const node = el("div", vertical ? "gbarv" : "gbar");
	const fill = el("i");
	node.append(fill);
	return {
		node,
		set(m) {
			fill.style[vertical ? "height" : "width"] = `${m.pct ?? 0}%`;
		},
	};
}

/** 10 segments, en ligne ou en colonne (le premier en bas). */
function segments(vertical) {
	const node = el("div", vertical ? "gsegs gsegsv" : "gsegs");
	const segs = Array.from({ length: SEGMENTS }, () => el("span"));
	node.append(...segs);
	return {
		node,
		set(m) {
			const lit = litSegments(m.pct);
			segs.forEach((s, i) => s.classList.toggle("on", i < lit));
		},
	};
}

/**
 * Case dessinée dans un style. `null` pour `card` ou un style inconnu (l'appelant garde la carte).
 * @param {string} style
 * @param {{label: string, text: string, unit: string, percent?: number, level?: string}} data
 * @param {number} size largeur en cases 1× (0.5 = un emplacement)
 */
export function renderGauge(style, data, size = 1) {
	if (style === "tape") return renderTape(data, size);
	let part;
	switch (style) {
		case "ring":
		case "arc":
			part = curve(style);
			break;
		case "bar":
		case "vbar":
			part = bar(style === "vbar");
			break;
		case "segments":
		case "vsegments":
			part = segments(style === "vsegments");
			break;
		case "number":
		case "line":
			// Ligne : nom à gauche, valeur à droite, sur la hauteur d'une barre (pas de barre).
			part = null;
			break;
		default:
			return null;
	}
	const sz = size <= 0.5 ? "gss" : size >= 2 ? "gs2" : "gs1";
	const root = el("div", `gauge g-${style} ${sz}`);
	root.setAttribute("role", "img");
	const label = el("div", "glabel");
	const value = el("div", "gvalue");
	// Anneau et arc portent la valeur dans le dessin ; les autres l'affichent à côté.
	const showValue = style !== "ring" && style !== "arc";
	if (part) root.append(part.node);
	if (showValue) root.append(value);
	root.append(label);

	const update = (d) => {
		const m = gaugeModel(d);
		root.className = `gauge g-${style} ${sz} level-${m.pct === null && style !== "number" ? "none" : m.level}`;
		label.textContent = d.label ?? "";
		// Valeur sans pourcentage (style mal choisi, ou réglé par l'API) : la valeur reste lisible.
		value.textContent = valueText(d);
		part?.set(m, d);
		root.setAttribute("aria-label", `${d.label ?? ""} ${valueText(d)}`.trim());
	};
	update(data);
	return { el: root, update };
}
