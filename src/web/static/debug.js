// Onglet 🐞 Debug (activé dans ⚙ Options → Avancé) : tout ce que le jeu envoie, brut, en lecture seule.
// Sections avec leur âge, arbre complet fusionné avec le schéma (champs prévus mais pas envoyés en gris),
// filtre, figer, copier, enregistrer le flux en JSON, derniers événements. Rien n'est jamais envoyé au jeu.

const POLL_MS = 400;
const ALL = "all";

/** Nombre lisible : entiers tels quels, décimaux à 6 chiffres significatifs. */
export function formatNumber(v) {
	if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
	return String(Number(v.toPrecision(6)));
}

/** Nom de fichier d'un enregistrement, ex. `sc-telemetry-debug-2026-11-23-0705.json`. */
export function recordingFileName(date) {
	const p = (n) => String(n).padStart(2, "0");
	return `sc-telemetry-debug-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.json`;
}

/**
 * Lignes de l'arbre : la valeur reçue fusionnée avec les champs du schéma. Chaque ligne :
 * `{ path, key, depth, kind: "object"|"value"|"absent"|"default"|"never", value?, size?, type? }`.
 * `closed` : chemins pliés ; `showAbsent` : montrer les champs du schéma non envoyés.
 */
export function treeRows(value, schemaFields, { path = "", depth = 0, closed = new Set(), showAbsent = true } = {}) {
	const rows = [];
	const walk = (val, fields, base, d) => {
		const keys = [];
		const seen = new Set();
		for (const f of fields ?? []) {
			keys.push([f.name, f]);
			seen.add(f.name);
		}
		if (val && typeof val === "object" && !Array.isArray(val)) for (const k of Object.keys(val)) if (!seen.has(k)) keys.push([k, undefined]);
		for (const [k, f] of keys) {
			const p = base ? `${base}.${k}` : k;
			const v = val?.[k];
			if (v === undefined) {
				// Champ simple : le jeu n'envoie pas false / 0 / vide, la valeur actuelle est donc la valeur par défaut
				// (ex. phares éteints = false). Toujours affiché : c'est un vrai état, pas un champ manquant.
				if (f && "default" in f) {
					rows.push({ path: p, key: k, depth: d, kind: "default", value: f.default, type: f.type });
					continue;
				}
				if (!showAbsent) continue;
				// Absent : un champ optional (ou un message) n'est pas envoyé.
				const kind = f && !f.optional && !f.repeated && f.kind !== "message" ? "default" : "absent";
				rows.push({ path: p, key: k, depth: d, kind, type: f ? (f.repeated ? `${f.type}[]` : f.type) : "" });
				continue;
			}
			if (v && typeof v === "object") {
				const size = Array.isArray(v) ? v.length : Object.keys(v).length;
				rows.push({ path: p, key: k, depth: d, kind: "object", size, array: Array.isArray(v), type: f?.type ?? "" });
				if (closed.has(p)) continue;
				if (Array.isArray(v)) {
					v.forEach((item, i) => {
						const ip = `${p}[${i}]`;
						if (item && typeof item === "object") {
							rows.push({ path: ip, key: `[${i}]`, depth: d + 1, kind: "object", size: Object.keys(item).length, type: f?.type ?? "" });
							if (!closed.has(ip)) walk(item, f?.fields, ip, d + 2);
						} else rows.push({ path: ip, key: `[${i}]`, depth: d + 1, kind: "value", value: item });
					});
				} else walk(v, f?.fields, p, d + 1);
			} else rows.push({ path: p, key: k, depth: d, kind: "value", value: v, type: f?.type ?? "" });
		}
	};
	walk(value, schemaFields, path, depth);
	return rows;
}

/** Filtre : garde les lignes dont le chemin contient le texte, plus leurs parents (pour le contexte). */
export function filterRows(rows, text) {
	const q = text.trim().toLowerCase();
	if (!q) return rows;
	const hits = rows.filter((r) => r.path.toLowerCase().includes(q) || (r.kind === "value" && String(r.value).toLowerCase().includes(q)));
	const keep = new Set();
	for (const r of hits) {
		keep.add(r.path);
		// Parents : chaque préfixe « a », « a.b », « a.b[0] »…
		const parts = r.path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
		let acc = "";
		for (const part of parts) {
			acc = part.startsWith("[") ? acc + part : acc ? `${acc}.${part}` : part;
			keep.add(acc);
		}
	}
	return rows.filter((r) => keep.has(r.path));
}

/** Codes de refus du jeu (ou de la connexion) → clé du texte ; `null` = erreur générique. */
const FAILURES = [
	[/FILTERED$/, "Filtered"],
	[/FAILED$/, "Failed"],
	[/UNKNOWN_ACTION$/, "Unknown"],
	[/MAP_INACTIVE$/, "MapInactive"],
	[/RATE_LIMITED$/, "RateLimited"],
	[/HOLD_NOT_ALLOWED$/, "Hold"],
	[/^DEADLINE_EXCEEDED$/, "Timeout"],
	[/^UNAVAILABLE$/, "Unavailable"],
];

/**
 * Raison lisible d'un refus du jeu (journal et info-bulle des boutons) : `[phrase, détail (code), mot court]`.
 * Le mot court sert dans la colonne étroite du journal.
 */
export function failureText(reason, message, t) {
	const r = String(reason ?? "");
	const key = FAILURES.find(([re]) => re.test(r))?.[1] ?? "Other";
	const code = r.replace(/^TRIGGER_GAME_ACTION_STATUS_/, "");
	return [t(`fail${key}`), message ? `${code} — ${message}` : code, t(`fail${key}Short`)];
}

/** Copie dans le presse-papiers, aussi en http sur le réseau local (pas de contexte sécurisé). */
async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.opacity = "0";
		document.body.append(ta);
		ta.select();
		const ok = document.execCommand("copy");
		ta.remove();
		return ok;
	}
}

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};

/**
 * Onglet Debug dans `panel`. `t(key)` : textes ; `request(method, url)` : appel authentifié (Response) ;
 * `onUnauthorized()` : jeton refusé.
 */
export function createDebug({ panel, t, request, onUnauthorized, lang = () => "en", top = null }) {
	let visible = false;
	let timer;
	let data;
	let current = ALL;
	let frozen = false;
	let showAbsent = true;
	let filter = "";
	const closed = new Set();
	let previous = new Map();
	let busy = false;
	let errorsOnly = false;

	// ---------- Squelette ----------
	panel.replaceChildren();
	const note = el("p", "dbg-note");
	const chips = el("div", "dbg-chips");
	const recbar = el("div", "dbg-recbar");
	recbar.hidden = true;
	const recText = el("span");
	const recStop = el("button", "btn-small");
	recStop.type = "button";
	recbar.append(recText, recStop);
	const tools = el("div", "dbg-tools");
	const search = el("input");
	search.type = "search";
	const absentLabel = el("label", "dbg-check");
	const absentBox = el("input");
	absentBox.type = "checkbox";
	absentBox.checked = true;
	const absentText = el("span");
	absentLabel.append(absentBox, absentText);
	const freezeLabel = el("label", "dbg-check");
	const freezeBox = el("input");
	freezeBox.type = "checkbox";
	const freezeText = el("span");
	freezeLabel.append(freezeBox, freezeText);
	const copyBtn = el("button", "btn-small");
	copyBtn.type = "button";
	const recBtn = el("button", "btn-small dbg-rec");
	recBtn.type = "button";
	tools.append(search, absentLabel, freezeLabel, copyBtn, recBtn);
	const cols = el("div", "dbg-cols");
	const treeBox = el("div", "dbg-box");
	const treeHead = el("h3");
	const tree = el("div", "dbg-tree");
	treeBox.append(treeHead, tree);
	const side = el("div", "dbg-side");
	// Journal (colonne de droite) : onglets Actions envoyées / Événements du jeu, et ⤢ pour l'agrandir.
	const logBox = el("div", "dbg-box dbg-log");
	const logHead = el("h3", "dbg-log-head");
	const tabActions = el("button", "dbg-logtab");
	tabActions.type = "button";
	const tabEvents = el("button", "dbg-logtab");
	tabEvents.type = "button";
	const wideBtn = el("button", "btn-small dbg-wide");
	wideBtn.type = "button";
	logHead.append(tabActions, tabEvents, wideBtn);
	const actTools = el("div", "dbg-log-tools");
	const actErrLabel = el("label", "dbg-check");
	const actErrBox = el("input");
	actErrBox.type = "checkbox";
	const actErrText = el("span");
	actErrLabel.append(actErrBox, actErrText);
	const actCopy = el("button", "btn-small");
	actCopy.type = "button";
	const actClear = el("button", "btn-small");
	actClear.type = "button";
	actTools.append(actErrLabel, actCopy, actClear);
	const actTable = el("table", "dbg-acts");
	const actWrap = el("div", "dbg-acts-wrap");
	actWrap.append(actTable);
	const evList = el("div", "dbg-events");
	logBox.append(logHead, actTools, actWrap, evList);
	const statBox = el("div", "dbg-box");
	const statHead = el("h3");
	const stats = el("dl", "dbg-stats");
	statBox.append(statHead, stats);
	side.append(logBox, statBox);
	cols.append(treeBox, side);
	// `top` : encart Performances, tenu à jour par la page (événement « state »).
	panel.append(note, ...(top ? [top] : []), chips, recbar, tools, cols);
	let logTab = "actions";
	let wide = false;
	/** Lignes du journal dépliées (vue compacte) : clé = heure + action. */
	const opened = new Set();
	const showLog = () => {
		tabActions.setAttribute("aria-pressed", String(logTab === "actions"));
		tabEvents.setAttribute("aria-pressed", String(logTab === "events"));
		actTools.hidden = actWrap.hidden = logTab !== "actions";
		evList.hidden = logTab !== "events";
		cols.classList.toggle("wide", wide);
		logBox.classList.toggle("compact", !wide);
		wideBtn.textContent = wide ? `⤡ ${t("dbgShrink")}` : `⤢ ${t("dbgEnlarge")}`;
	};
	tabActions.addEventListener("click", () => ((logTab = "actions"), showLog()));
	tabEvents.addEventListener("click", () => ((logTab = "events"), showLog()));
	wideBtn.addEventListener("click", () => {
		wide = !wide;
		showLog();
		renderActions();
	});
	actErrBox.addEventListener("change", () => {
		errorsOnly = actErrBox.checked;
		renderActions();
	});
	actCopy.addEventListener("click", async () => {
		const lines = shownActions().map((a) =>
			[new Date(Date.now() - a.ageMs).toLocaleTimeString(), a.action, a.origin, a.locomotion, a.ok ? "OK" : `${a.reason ?? ""}${a.message ? ` (${a.message})` : ""}`, `${a.ms} ms`].join("\t"),
		);
		flash(actCopy, await copyText(lines.join("\n")));
	});
	actClear.addEventListener("click", async () => {
		const r = await request("DELETE", "/api/v1/debug/actions");
		flash(actClear, r.ok);
		poll();
	});

	search.addEventListener("input", () => {
		filter = search.value;
		renderTree();
	});
	absentBox.addEventListener("change", () => {
		showAbsent = absentBox.checked;
		renderTree();
	});
	freezeBox.addEventListener("change", () => {
		frozen = freezeBox.checked;
		if (!frozen) renderAll();
	});
	copyBtn.addEventListener("click", async () => {
		const ok = await copyText(JSON.stringify(selection(), null, 2));
		flash(copyBtn, ok);
	});
	recBtn.addEventListener("click", startRecording);
	recStop.addEventListener("click", takeRecording);

	function flash(b, ok) {
		b.dataset.flash = ok ? "ok" : "bad";
		setTimeout(() => delete b.dataset.flash, 700);
	}

	/** Données de la sélection (une section ou toutes) pour « Copier le JSON ». */
	function selection() {
		if (!data) return null;
		if (current === ALL) return Object.fromEntries(data.sections.map((s) => [s.name, s.data]));
		return data.sections.find((s) => s.name === current)?.data ?? null;
	}

	// ---------- Textes ----------
	function applyTexts() {
		note.textContent = t("dbgNote");
		search.placeholder = t("dbgFilter");
		search.setAttribute("aria-label", t("dbgFilter"));
		absentText.textContent = t("dbgShowAbsent");
		freezeText.textContent = t("dbgFreeze");
		copyBtn.textContent = `📋 ${t("dbgCopy")}`;
		recBtn.textContent = `⏺ ${t("dbgRecord")}`;
		recStop.textContent = `⏹ ${t("dbgStopDownload")}`;
		actErrText.textContent = t("dbgErrorsOnly");
		actCopy.textContent = `📋 ${t("dbgCopyShort")}`;
		actClear.textContent = t("dbgClear");
		statHead.textContent = t("dbgStream");
		renderAll();
	}

	// ---------- Rendu ----------
	const age = (ms) => (ms === null ? t("dbgNever") : `${(ms / 1000).toFixed(1)} s`);

	function renderChips() {
		const list = data?.sections ?? [];
		const items = [{ name: ALL }, ...list];
		chips.replaceChildren(
			...items.map((s) => {
				const b = el("button", "dbg-chip");
				b.type = "button";
				b.setAttribute("aria-pressed", String(current === s.name));
				const dot = el("span", "dbg-dot");
				if (s.name === ALL) {
					b.classList.add(list.some((x) => !x.stale) ? "fresh" : "none");
					b.append(dot, el("b", "", t("dbgAll")));
				} else {
					b.classList.add(s.ageMs === null ? "none" : s.stale ? "stale" : "fresh");
					b.append(dot, el("span", "", s.name), el("span", "dbg-age", age(s.ageMs)));
				}
				b.addEventListener("click", () => {
					current = s.name;
					renderAll();
				});
				return b;
			}),
		);
	}

	function sectionRows() {
		if (!data) return [];
		const schemaOf = (name) => data.schema?.find((f) => f.name === name)?.fields;
		const one = (s, depth) => {
			if (s.data === null) return [{ path: s.name, key: s.name, depth, kind: "never" }];
			const head = { path: s.name, key: s.name, depth, kind: "object", size: Object.keys(s.data).length, stale: s.stale, ageMs: s.ageMs };
			if (current === ALL && closed.has(s.name)) return [head];
			const rows = treeRows(s.data, schemaOf(s.name), { path: s.name, depth: depth + (current === ALL ? 1 : 0), closed, showAbsent });
			return current === ALL ? [head, ...rows] : rows;
		};
		if (current === ALL) return data.sections.filter((s) => s.name !== "events").flatMap((s) => one(s, 0));
		const s = data.sections.find((x) => x.name === current);
		return s ? one(s, 0) : [];
	}

	function renderTree() {
		if (!data) return;
		const sec = data.sections.find((s) => s.name === current);
		treeHead.replaceChildren(el("span", "", current === ALL ? t("dbgAllTitle") : current));
		if (sec?.stale && sec.ageMs !== null) treeHead.append(el("small", "dbg-warn", ` ${t("dbgStale")}`));
		treeHead.append(el("small", "dbg-hint", t("dbgTreeHint")));
		const rows = filterRows(sectionRows(), filter);
		const next = new Map();
		const frag = document.createDocumentFragment();
		for (const r of rows) {
			const row = el("div", `dbg-row ${r.kind}`);
			row.style.paddingLeft = `${8 + r.depth * 16}px`;
			const key = el("span", "k", r.key);
			row.append(key);
			if (r.kind === "object") {
				key.classList.add("tog");
				if (closed.has(r.path)) row.classList.add("closed");
				key.tabIndex = 0;
				key.setAttribute("role", "button");
				key.setAttribute("aria-expanded", String(!closed.has(r.path)));
				const toggle = () => {
					if (closed.has(r.path)) closed.delete(r.path);
					else closed.add(r.path);
					renderTree();
				};
				key.addEventListener("click", toggle);
				key.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle()));
				const size = r.array ? `[${r.size}]` : r.size ? `{${r.size}}` : t("dbgEmptyObject");
				row.append(el("span", "v meta", size));
				if (r.stale) row.append(el("span", "t dbg-warn", `${t("dbgStale")} · ${age(r.ageMs)}`));
				else if (r.type) row.append(el("span", "t", r.type));
			} else if (r.kind === "value" || (r.kind === "default" && "value" in r)) {
				const v = r.value;
				const type = typeof v === "number" ? "num" : typeof v === "boolean" ? "bool" : /^[A-Z0-9_]+$/.test(String(v)) ? "enum" : "str";
				const text = typeof v === "number" ? formatNumber(v) : typeof v === "string" && type === "str" ? `"${v}"` : String(v);
				row.append(el("span", `v ${type}`, text));
				// Valeur par défaut : c'est bien l'état actuel (ex. phares éteints = false), le jeu ne l'envoie juste pas.
				if (r.kind === "default") row.append(el("span", "d", t("dbgImplicit")));
				if (r.type) row.append(el("span", "t", r.type));
				const json = JSON.stringify(v);
				next.set(r.path, json);
				if (previous.size && previous.has(r.path) && previous.get(r.path) !== json) row.classList.add("flash");
			} else if (r.kind === "never") {
				row.append(el("span", "v", t("dbgNeverSection")));
			} else {
				row.append(el("span", "v", r.kind === "default" ? t("dbgDefault") : t("dbgNotSent")));
				if (r.type) row.append(el("span", "t", r.type));
			}
			if (r.kind !== "never") {
				const copy = el("button", "copy", t("dbgCopyPath"));
				copy.type = "button";
				copy.addEventListener("click", async () => flash(copy, await copyText(r.path)));
				row.append(copy);
			}
			frag.append(row);
		}
		if (!rows.length) frag.append(el("p", "dbg-empty", filter ? t("dbgNoMatch") : t("dbgNoData")));
		tree.replaceChildren(frag);
		previous = next;
	}

	function renderEvents() {
		const list = data?.events ?? [];
		const now = Date.now();
		evList.replaceChildren(
			...(list.length
				? [...list].reverse().map((e) => {
						const row = el("div", "dbg-ev");
						const { type, ...rest } = e.event;
						row.append(
							el("span", "h", new Date(now - e.ageMs).toLocaleTimeString()),
							el("span", "e", String(type ?? "?").replace(/^GAME_EVENT_TYPE_/, "")),
						);
						if (Object.keys(rest).length) row.append(el("span", "c", JSON.stringify(rest)));
						return row;
					})
				: [el("p", "dbg-empty", t("dbgNoEvents"))]),
		);
	}

	function renderStats() {
		if (!data) return;
		const pairs = [
			[t("dbgFps"), String(data.framesPerSecond)],
			// Numéro de trame (build 13273298) : seulement si le jeu l'envoie.
			...(data.sequence?.last != null
				? [
						[t("dbgSequence"), String(data.sequence.last)],
						[t("dbgLost"), String(data.sequence.lost)],
						...(data.sequence.gameTime ? [[t("dbgGameTime"), new Date(data.sequence.gameTime).toLocaleTimeString()]] : []),
					]
				: []),
			[t("dbgApp"), data.app],
			[t("dbgSchema"), data.schema ? data.schemaVersion : `${data.schemaVersion} (${t("dbgNoSchema")})`],
		];
		stats.replaceChildren(...pairs.flatMap(([k, v]) => [el("dt", "", k), el("dd", "", v)]));
	}

	const shownActions = () => (data?.actions ?? []).filter((a) => !errorsOnly || !a.ok);

	function renderActions() {
		// Onglets du journal : nombre d'erreurs à côté de « Actions », nombre d'événements à côté de « Événements ».
		const errors = (data?.actions ?? []).filter((a) => !a.ok).length;
		tabActions.textContent = errors ? `${t("dbgActions")} · ${errors} ⚠` : t("dbgActions");
		tabEvents.textContent = data?.events?.length ? `${t("dbgEvents")} · ${data.events.length}` : t("dbgEvents");
		showLog();
		const list = shownActions();
		// Vue compacte (colonne de droite) : heure, action, résultat ; un clic sur une ligne montre le détail.
		if (!wide) {
			const rows = list.flatMap((a) => {
				const key = `${a.at}|${a.action}`;
				const tr = el("tr", `row${a.ok ? "" : " fail"}${opened.has(key) ? " open" : ""}`);
				tr.tabIndex = 0;
				tr.append(el("td", "when", new Date(Date.now() - a.ageMs).toLocaleTimeString()));
				tr.append(el("td", "act", a.label));
				const res = el("td", a.ok ? "res ok" : "res bad", a.ok ? "✔" : `⚠ ${failureText(a.reason, a.message, t)[2]}`);
				tr.append(res);
				const toggle = () => {
					if (opened.has(key)) opened.delete(key);
					else opened.add(key);
					renderActions();
				};
				tr.addEventListener("click", toggle);
				tr.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle()));
				if (!opened.has(key)) return [tr];
				const role = a.crewRole && a.crewRole !== "none" ? (t(`role_${a.crewRole}`) ?? a.crewRole) : null;
				const detail = [
					a.action,
					t(`origin_${a.origin}`) ?? a.origin,
					[t(`loco_${a.locomotion}`) ?? a.locomotion, role].filter(Boolean).join(" · "),
					a.ok ? null : failureText(a.reason, a.message, t).slice(0, 2).join(" — "),
					`${a.ms} ms`,
				].filter(Boolean);
				const more = el("tr", "detail");
				const td = el("td", "", detail.join(" · "));
				td.colSpan = 3;
				more.append(td);
				return [tr, more];
			});
			if (!rows.length) {
				const tr = el("tr");
				const td = el("td", "dbg-empty", errorsOnly ? t("dbgNoErrors") : t("dbgNoActions"));
				td.colSpan = 3;
				tr.append(td);
				rows.push(tr);
			}
			const tbody = el("tbody");
			tbody.append(...rows);
			actTable.replaceChildren(tbody);
			return;
		}
		const head = el("tr");
		const cols6 = [
			["dbgColTime", ""],
			["dbgColAction", ""],
			["dbgColOrigin", "opt"],
			["dbgColPosition", "opt"],
			["dbgColResult", ""],
			["dbgColMs", "opt num"],
		];
		for (const [key, cls] of cols6) head.append(el("th", cls, t(key)));
		const rows = list.map((a) => {
			const tr = el("tr", a.ok ? "" : "fail");
			tr.append(el("td", "when", new Date(Date.now() - a.ageMs).toLocaleTimeString()));
			const act = el("td", "act");
			act.append(el("b", "", a.label), el("span", "code", a.action));
			tr.append(act);
			tr.append(el("td", "opt", t(`origin_${a.origin}`) ?? a.origin));
			const role = a.crewRole && a.crewRole !== "none" ? (t(`role_${a.crewRole}`) ?? a.crewRole) : null;
			tr.append(el("td", "opt", [t(`loco_${a.locomotion}`) ?? a.locomotion, role].filter(Boolean).join(" · ")));
			const res = el("td", a.ok ? "res ok" : "res bad");
			if (a.ok) res.textContent = "✔ OK";
			else {
				const [title, detail] = failureText(a.reason, a.message, t);
				res.append(el("span", "", `⚠ ${title}`), el("small", "", detail));
			}
			tr.append(res);
			tr.append(el("td", "opt num", `${a.ms} ms`));
			return tr;
		});
		if (!rows.length) {
			const tr = el("tr");
			const td = el("td", "dbg-empty", errorsOnly ? t("dbgNoErrors") : t("dbgNoActions"));
			td.colSpan = 6;
			tr.append(td);
			rows.push(tr);
		}
		const thead = el("thead");
		thead.append(head);
		const tbody = el("tbody");
		tbody.append(...rows);
		actTable.replaceChildren(thead, tbody);
	}

	function renderRecording() {
		const r = data?.recording;
		const on = !!r && (r.active || r.full);
		recbar.hidden = !on;
		recBtn.disabled = on;
		if (!on) return;
		const secs = (r.ms / 1000).toFixed(1);
		recText.textContent = r.full ? t("dbgRecFull").replace("{frames}", r.frames) : t("dbgRecOn").replace("{s}", secs).replace("{frames}", r.frames);
	}

	function renderAll() {
		renderChips();
		renderRecording();
		renderStats();
		if (frozen) return;
		renderTree();
		renderEvents();
		renderActions();
	}

	// ---------- Données ----------
	async function poll() {
		if (busy) return;
		busy = true;
		try {
			const r = await request("GET", `/api/v1/debug?lang=${lang()}`);
			if (r.status === 401) return onUnauthorized();
			if (r.ok) {
				data = await r.json();
				if (current !== ALL && !data.sections.some((s) => s.name === current)) current = ALL;
				renderAll();
			}
		} catch {
			/* appli arrêtée : on réessaie au tour suivant */
		} finally {
			busy = false;
		}
	}

	async function startRecording() {
		const r = await request("POST", "/api/v1/debug/recording");
		flash(recBtn, r.ok);
		poll();
	}

	async function takeRecording() {
		const r = await request("DELETE", `/api/v1/debug/recording?lang=${lang()}`);
		if (!r.ok) return flash(recStop, false);
		const body = await r.json();
		const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 1)], { type: "application/json" }));
		const a = el("a");
		a.href = url;
		a.download = recordingFileName(new Date());
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 5000);
		poll();
	}

	return {
		applyTexts,
		/** Onglet affiché ou non : on n'interroge l'appli que pendant qu'il est visible. */
		setVisible(on) {
			if (on === visible) return;
			visible = on;
			clearInterval(timer);
			if (on) {
				previous = new Map();
				poll();
				timer = setInterval(poll, POLL_MS);
			}
		},
	};
}
