// Jauges de « Ma vue » : anneau, arc, barres, segments et chiffre. Dessin construit une fois, puis mis à jour sur
// place à chaque frame (longueur de l'arc, taille de la barre, segments allumés, texte). Couleurs par classes
// `level-*` et variables du thème (style.css) : aucune couleur ici.

export const STYLES = ["card", "ring", "arc", "bar", "vbar", "segments", "vsegments", "number"];
const STYLED_KINDS = ["vital", "instrument", "character_info", "ship_info"];
const SEGMENTS = 10;
const SVG = "http://www.w3.org/2000/svg";

/**
 * Styles proposés pour une case. `isGauge` : la donnée a un pourcentage (`true`), n'en a pas (`false`), ou on ne
 * sait pas encore (`null`, pas de données) → tout est proposé.
 * @param {string} kind
 * @param {boolean | null} isGauge
 */
export function stylesFor(kind, isGauge) {
	if (!STYLED_KINDS.includes(kind)) return ["card"];
	return isGauge === false ? ["card", "number"] : [...STYLES];
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
const valueText = (data) => (data.text === "—" || !data.unit ? data.text : `${data.text} ${data.unit}`);

/** Texte dans un anneau / arc : le nombre seul pour un pourcentage, sinon la valeur complète (jamais cachée). */
export function gaugeText(data) {
	return data.unit === "%" ? data.text : valueText(data);
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
 * @param {1 | 2} size
 */
export function renderGauge(style, data, size = 1) {
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
			part = null;
			break;
		default:
			return null;
	}
	const root = el("div", `gauge g-${style} gs${size}`);
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
		root.className = `gauge g-${style} gs${size} level-${m.pct === null && style !== "number" ? "none" : m.level}`;
		label.textContent = d.label ?? "";
		// Valeur sans pourcentage (style mal choisi, ou réglé par l'API) : la valeur reste lisible.
		value.textContent = valueText(d);
		part?.set(m, d);
		root.setAttribute("aria-label", `${d.label ?? ""} ${valueText(d)}`.trim());
	};
	update(data);
	return { el: root, update };
}
