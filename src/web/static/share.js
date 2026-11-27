// SPDX-License-Identifier: MPL-2.0
// « Ma vue » : fenêtres Exporter / Importer. Le serveur fait tout le travail (/api/v1/views/export et /import) ;
// ici : choix, téléchargement du fichier .json, copie du code SCTD1:…, aperçu avant import (dry_run).

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};
const button = (cls, text) => {
	const b = el("button", cls, text);
	b.type = "button";
	return b;
};
const counts = (v) => [v.sections.length, v.sections.reduce((n, s) => n + s.items.length, 0)];
/** Nom de fichier simple : minuscules sans accents, a-z0-9 et tirets. */
const slug = (s) =>
	String(s)
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "vue";
/** Date locale AAAA-MM-JJ (pas UTC : un export à 0 h 30 en France porte la date du jour, pas celle de la veille). */
const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Compare deux versions x.y.z (-1, 0, 1), `null` si l'une est illisible. */
export function compareVersions(a, b) {
	const parse = (v) => (/^\d+(\.\d+)*$/.test(String(v ?? "")) ? String(v).split(".").map(Number) : null);
	const x = parse(a);
	const y = parse(b);
	if (!x || !y) return null;
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		const d = (x[i] ?? 0) - (y[i] ?? 0);
		if (d) return Math.sign(d);
	}
	return 0;
}

function dialog(title) {
	const dlg = el("dialog", "vshare-dlg");
	dlg.append(el("h2", "", title));
	dlg.addEventListener("close", () => dlg.remove());
	return dlg;
}
function footer(dlg, t, ...extra) {
	const foot = el("div", "lan-foot vshare-foot");
	const close = button("", t("close"));
	close.addEventListener("click", () => dlg.close());
	foot.append(...extra, close);
	dlg.append(foot);
}

/** Copie : presse-papiers, sinon sélection + execCommand (page en HTTP sur le réseau local), sinon à la main. */
async function copy(area) {
	try {
		await navigator.clipboard.writeText(area.value);
		return true;
	} catch {
		area.focus();
		area.select();
		try {
			return document.execCommand("copy");
		} catch {
			return false;
		}
	}
}

/**
 * @param {object} ctx
 * @param {(key: string) => string} ctx.t
 * @param {(key: string, ...args: unknown[]) => string} ctx.fmt
 * @param {(path: string, init?: RequestInit) => Promise<Response>} ctx.api
 * @param {(text: string) => void} ctx.showMessage
 * @param {{ id: string, name: string, sections: object[] }} current vue affichée
 * @param {object[]} all toutes les vues
 */
export function openExport(ctx, current, all) {
	const { t, fmt, api } = ctx;
	const dlg = dialog(t("exportTitle"));
	const choice = el("div", "vshare-choice");
	const option = (value, label, hint, checked) => {
		const row = el("label");
		const radio = el("input");
		Object.assign(radio, { type: "radio", name: "vshare-what", value, checked });
		const text = el("span", "", label);
		text.append(el("small", "", hint));
		row.append(radio, text);
		choice.append(row);
		radio.addEventListener("change", refresh);
	};
	option("one", fmt("exportThis", current.name), fmt("viewCounts", ...counts(current)), true);
	if (all.length > 1) option("all", fmt("exportAll", all.length), t("exportAllHint"), false);
	const area = el("textarea", "vshare-code");
	area.readOnly = true;
	area.rows = 3;
	const meta = el("p", "lan-notice");
	const download = button("primary", t("downloadJson"));
	const copyBtn = button("", t("copyCode"));
	const row = el("div", "vshare-row");
	row.append(download, copyBtn);
	dlg.append(choice, row, area, meta);
	footer(dlg, t);

	const one = () => choice.querySelector("input:checked")?.value !== "all";
	const query = () => (one() ? `?id=${encodeURIComponent(current.id)}` : "");
	let seq = 0;
	async function refresh() {
		const mine = ++seq;
		area.value = "";
		try {
			const r = await api(`/api/v1/views/export${query()}${query() ? "&" : "?"}as=code`);
			if (!r.ok) throw new Error();
			const { code, app_version } = await r.json();
			// Choix changé entre-temps : seule la dernière réponse compte (sinon on copierait l'autre export).
			if (mine !== seq) return;
			area.value = code;
			meta.textContent = fmt("exportedWith", app_version);
		} catch {
			if (mine === seq) meta.textContent = t("viewSaveFailed");
		}
	}
	download.addEventListener("click", async () => {
		try {
			const r = await api(`/api/v1/views/export${query()}`);
			if (!r.ok) throw new Error();
			const blob = new Blob([`${JSON.stringify(await r.json(), null, "\t")}\n`], { type: "application/json" });
			const a = el("a");
			a.href = URL.createObjectURL(blob);
			a.download = `sc-telemetry-deck-${one() ? slug(current.name) : "views"}-${today()}.json`;
			document.body.append(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
		} catch {
			ctx.showMessage(t("viewSaveFailed"));
		}
	});
	copyBtn.addEventListener("click", async () => {
		if (!area.value) return;
		const ok = await copy(area);
		meta.textContent = ok ? t("codeCopied") : t("copyByHand");
		if (!ok) area.select();
	});
	document.body.append(dlg);
	dlg.showModal();
	refresh();
}

/**
 * @param {object} ctx voir `openExport`
 * @param {(ids: string[]) => void} onImported vues créées (dans l'ordre)
 */
export function openImport(ctx, onImported) {
	const { t, fmt, api } = ctx;
	const dlg = dialog(t("importTitle"));
	const area = el("textarea", "vshare-code");
	area.rows = 3;
	area.placeholder = t("pasteCode");
	const drop = el("div", "vshare-drop");
	const file = el("input");
	Object.assign(file, { type: "file", accept: ".json,application/json", hidden: true });
	const choose = button("", t("chooseFile"));
	choose.addEventListener("click", () => file.click());
	drop.append(el("div", "", t("dropFile")), choose, file);
	const result = el("div", "vshare-result");
	const go = button("primary", t("importBtn"));
	go.disabled = true;
	dlg.append(area, el("div", "vshare-or", t("or")), drop, result);
	footer(dlg, t, go);

	/** Corps à envoyer (code collé ou document lu dans le fichier) ; `null` : rien. */
	let body = null;
	let seq = 0;
	const error = (text) => {
		go.disabled = true;
		go.textContent = t("importBtn");
		result.replaceChildren(el("div", "vshare-error", text));
	};
	const errorText = (r, json) =>
		json?.error === "unsupported_format"
			? t("importUnsupported")
			: json?.error === "too_many_views"
				? fmt("importNoRoom", json.free)
				: r.status === 401
					? t("badToken")
					: json?.error === "invalid_export"
						? t("importInvalid")
						: t("viewSaveFailed");

	async function preview() {
		const mine = ++seq;
		result.replaceChildren();
		go.disabled = true;
		if (!body) return;
		try {
			const r = await api("/api/v1/views/import?dry_run=1", { method: "POST", body: JSON.stringify(body) });
			const json = await r.json().catch(() => null);
			if (mine !== seq) return;
			if (!r.ok) return error(errorText(r, json));
			showPreview(json);
		} catch {
			if (mine === seq) error(t("viewSaveFailed"));
		}
	}

	function showPreview(p) {
		const box = el("div", "vshare-preview");
		if (p.views.length === 1) {
			const v = p.views[0];
			const head = el("div");
			head.append(el("b", "", fmt("quotedName", v.name)), ` — ${fmt("viewCounts", v.sections, v.items)}`);
			box.append(head);
		} else {
			box.append(el("b", "", fmt("importViewsCount", p.views.length)));
			const ul = el("ul");
			for (const v of p.views) ul.append(el("li", "", `${v.name} — ${fmt("viewCounts", v.sections, v.items)}`));
			box.append(ul);
		}
		const from = el("div", "vshare-from");
		const cmp = compareVersions(p.from_version, p.app_version);
		if (p.from_version === null) from.textContent = t("fromUnknown");
		else if (cmp === 0) from.textContent = fmt("fromSame", p.from_version);
		else {
			from.textContent = fmt("fromOther", p.from_version, p.app_version);
			if (cmp === 1) {
				from.classList.add("newer");
				from.append(` ${t("fromNewer")}`);
			}
		}
		box.append(from);
		const parts = [box];
		if (p.skipped.length) {
			const skip = el("div", "vshare-skipped");
			skip.append(el("b", "", p.skipped.length === 1 ? t("skippedOne") : fmt("skippedMany", p.skipped.length)));
			const ul = el("ul");
			for (const s of p.skipped) {
				const li = el("li");
				const where = [p.views.length > 1 ? s.view : null, s.section ? fmt("skipSection", s.section) : null].filter(Boolean).join(" · ");
				if (where) li.append(fmt("skipWhere", where));
				if (s.ref || s.kind) li.append(el("code", "", s.ref ?? s.kind), " — ");
				li.append(t(`skip_${s.reason}`));
				ul.append(li);
			}
			skip.append(ul);
			parts.push(skip);
		}
		if (p.views.length > 1) parts.push(el("p", "lan-notice", t("importAddsHint")));
		result.replaceChildren(...parts);
		go.textContent = p.skipped.length ? t("importAnyway") : p.views.length > 1 ? fmt("importBtnMany", p.views.length) : t("importBtn");
		go.disabled = false;
	}

	let timer;
	area.addEventListener("input", () => {
		// Tant que l'aperçu du nouveau texte n'est pas là, « Importer » enverrait l'ancien.
		go.disabled = true;
		++seq;
		clearTimeout(timer);
		timer = setTimeout(() => {
			body = area.value.trim() ? { code: area.value } : null;
			preview();
		}, 300);
	});
	async function readFile(f) {
		if (!f) return;
		clearTimeout(timer);
		++seq;
		area.value = "";
		try {
			body = JSON.parse(await f.text());
		} catch {
			body = null;
			return error(t("importInvalid"));
		}
		preview();
	}
	file.addEventListener("change", () => readFile(file.files?.[0]));
	drop.addEventListener("dragover", (e) => {
		e.preventDefault();
		drop.classList.add("over");
	});
	drop.addEventListener("dragleave", () => drop.classList.remove("over"));
	drop.addEventListener("drop", (e) => {
		e.preventDefault();
		drop.classList.remove("over");
		readFile(e.dataTransfer?.files?.[0]);
	});
	go.addEventListener("click", async () => {
		if (!body) return;
		go.disabled = true;
		try {
			const r = await api("/api/v1/views/import", { method: "POST", body: JSON.stringify(body) });
			const json = await r.json().catch(() => null);
			if (r.status !== 201) return error(errorText(r, json));
			dlg.close();
			ctx.showMessage(json.views.length === 1 ? fmt("imported", json.views[0].name) : fmt("importedMany", json.views.length));
			onImported(json.views.map((v) => v.id));
		} catch {
			error(t("viewSaveFailed"));
		}
	});
	document.body.append(dlg);
	dlg.showModal();
	area.focus();
}

/**
 * Fenêtre « Nouvelle vue » : Vierge, puis les modèles de l'appli (GET /api/v1/views/templates) avec leur
 * description et la taille d'écran conseillée. `onPick(null)` = vierge, `onPick({ id, name })` = modèle.
 */
export function openNewView(ctx, onPick) {
	const { t, fmt, api, lang } = ctx;
	const dlg = dialog(t("newViewTitle"));
	const list = el("div", "vnew-list");
	const choice = (title, text, extra, pick) => {
		const b = button("vnew-opt");
		b.append(el("b", "", title), el("span", "", text));
		if (extra) b.append(el("small", "", extra));
		b.addEventListener("click", () => {
			dlg.close();
			pick();
		});
		return b;
	};
	list.append(choice(t("templateBlank"), t("templateBlankText"), "", () => onPick(null)));
	const note = el("div", "vnew-note", t("templatesLoading"));
	dlg.append(el("p", "vnew-intro", t("newViewIntro")), list, note);
	footer(dlg, t);
	document.body.append(dlg);
	dlg.showModal();
	api(`/api/v1/views/templates?lang=${lang()}`)
		.then((r) => (r.ok ? r.json() : Promise.reject()))
		.then(({ templates }) => {
			note.remove();
			for (const tp of templates)
				list.append(choice(tp.name, tp.description, fmt("templateSize", tp.size.width, tp.size.height), () => onPick({ id: tp.id, name: tp.name })));
		})
		.catch(() => (note.textContent = t("templatesFailed")));
}
