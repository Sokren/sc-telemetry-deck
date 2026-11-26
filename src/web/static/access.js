// Fenêtre « Accès externes » : jetons nommés pour les autres logiciels (VoiceAttack, overlay, bot…), chacun avec
// un niveau (Lecture, Pilotage, Pilotage complet) et l'option réseau local. Sur le PC seulement (l'API répond
// 403 ailleurs). Un jeton n'est montré qu'une fois, juste après sa création.

const LEVELS = ["read", "pilot", "pilot_full"];
/** Rafraîchissement de la liste et des journaux pendant que la fenêtre est ouverte. */
const POLL_MS = 2000;
/** Indicateur de la barre du haut, fenêtre fermée. */
const POLL_BAR_MS = 5000;
/** Dernier appel vu dans le journal de chaque jeton (sur cet appareil) : les erreurs plus récentes sont signalées. */
const SEEN_KEY = "sctd-access-seen";

function readSeen() {
	try {
		const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
		return v && typeof v === "object" && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
}

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

/**
 * @param {object} ctx
 * @param {(key: string) => string} ctx.t
 * @param {() => string} ctx.token jeton de l'appli
 * @param {() => string} ctx.lang langue de la page (dates)
 */
/**
 * Appel à signaler (rouge et ⚠) : refusé (401, 403), requête invalide (400) ou erreur de l'appli ou du jeu (5xx).
 * Une réponse normale comme 404 (aucune donnée du jeu) ou 409 (rien à arrêter) reste neutre.
 */
export const isAlert = (status) => status === 400 || status === 401 || status === 403 || status >= 500;

export function createAccess(ctx) {
	const { t } = ctx;
	const openBtn = document.getElementById("access-open");
	const pill = document.getElementById("access-pill");
	const dialog = document.getElementById("access");
	/** @type {{id: string, name: string, level: string, lan: boolean, last4: string, created: string}[] | null} */
	let tokens = null;
	/** @type {Record<string, {entries: {at: string, method: string, path: string, status: number, sensitive?: true}[], refused: number, lastUsed: string | null}>} */
	let logs = {};
	/** Formulaire ouvert : `null`, `"new"` ou l'id du jeton modifié. */
	let form = null;
	let draft = { name: "", level: "read", lan: false };
	/** Jeton tout juste créé ou renouvelé : `{name, secret, renewed?}`, montré une seule fois. */
	let created = null;
	let openLog = null;
	/** @type {Record<string, string>} */
	const seen = readSeen();
	/** Jeton dont on choisit la durée du stop, sinon `null`. */
	let stopping = null;
	let notice = "";
	let busy = false;
	let timer;
	let barTimer;

	/** Message d'erreur : en rouge, bien visible (un message simple reste discret). */
	const bad = (text) => ({ bad: true, text });
	const fmt = (key, ...args) => args.reduce((s, a, i) => s.replace(`{${i}}`, () => a), t(key));
	const api = (path, init = {}) =>
		fetch(path, { ...init, headers: { authorization: `Bearer ${ctx.token()}`, ...(init.body ? { "content-type": "application/json" } : {}) } });
	const when = (iso, timeStyle = "short") => {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(ctx.lang(), { dateStyle: "short", timeStyle });
	};

	async function load() {
		try {
			const r = await api("/api/v1/access/tokens");
			if (r.status !== 200) return false;
			const list = (await r.json()).tokens;
			const next = {};
			await Promise.all(list.map((tok) => loadLog(tok.id, next)));
			tokens = list;
			logs = next;
			return true;
		} catch {
			return false;
		}
	}

	async function loadLog(id, into = logs) {
		try {
			const r = await api(`/api/v1/access/tokens/${encodeURIComponent(id)}/log`);
			if (r.ok) into[id] = await r.json();
			else if (logs[id]) into[id] = logs[id];
		} catch {
			if (logs[id]) into[id] = logs[id]; // appli arrêtée : on garde l'ancien journal
		}
	}

	/** Journal en direct : redessiné seulement si quelque chose a changé, jamais pendant une saisie. */
	async function poll() {
		clearTimeout(timer);
		if (!dialog.open) return;
		// Le temps restant d'un stop compte aussi : la pastille se met à jour chaque minute.
		const snapshot = () => JSON.stringify([tokens, logs, (tokens ?? []).map(stopText)]);
		const before = snapshot();
		if (!busy && form === null && (await load()) && dialog.open && form === null && snapshot() !== before) render();
		timer = setTimeout(poll, POLL_MS);
	}

	async function send(path, method, body) {
		busy = true;
		notice = "";
		render();
		let r = null;
		try {
			r = await api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
		} catch {
			/* appli arrêtée */
		}
		busy = false;
		return r;
	}

	async function save() {
		const name = draft.name.trim();
		if (!name) {
			notice = bad(t("accessNameMissing"));
			return render();
		}
		// Même nom qu'un autre jeton (majuscules ignorées) : refusé tout de suite, l'appli le refuserait aussi.
		if ((tokens ?? []).some((x) => x.id !== form && x.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
			notice = bad(fmt("accessNameTaken", name));
			return render();
		}
		if (draft.level === "pilot_full" && !confirm(draft.lan ? t("accessFullLanConfirm") : t("accessFullConfirm"))) return;
		const body = { name, level: draft.level, lan: draft.lan };
		const isNew = form === "new";
		const r = await send(isNew ? "/api/v1/access/tokens" : `/api/v1/access/tokens/${encodeURIComponent(form)}`, isNew ? "POST" : "PUT", body);
		if (r && (r.status === 201 || r.status === 200)) {
			if (isNew) created = { name, secret: (await r.json()).secret };
			else notice = fmt("accessSaved", name);
			form = null;
		} else if (r?.status === 409) notice = (await r.json().catch(() => ({}))).error === "name_taken" ? bad(fmt("accessNameTaken", name)) : bad(t("accessTooMany"));
		else notice = r?.status === 400 ? bad(t("accessInvalid")) : bad(t("accessFailed"));
		await load();
		render();
	}

	async function revoke(tok) {
		if (!confirm(fmt("accessRevokeConfirm", tok.name))) return;
		const r = await send(`/api/v1/access/tokens/${encodeURIComponent(tok.id)}`, "DELETE");
		notice = r && (r.status === 204 || r.status === 404) ? fmt("accessRevoked", tok.name) : bad(t("accessFailed"));
		if (form === tok.id) form = null;
		await load();
		render();
	}

	async function renew(tok) {
		if (!confirm(fmt("accessRenewConfirm", tok.name))) return;
		const r = await send(`/api/v1/access/tokens/${encodeURIComponent(tok.id)}/renew`, "POST");
		if (r?.status === 200) {
			created = { name: tok.name, secret: (await r.json()).secret, renewed: true };
			form = null;
		} else notice = bad(t("accessFailed"));
		await load();
		render();
	}

	async function copy(text) {
		try {
			await navigator.clipboard.writeText(text);
			notice = t("lanCopied");
		} catch {
			const area = el("textarea");
			area.value = text;
			area.style.position = "fixed";
			area.style.opacity = "0";
			document.body.append(area);
			area.select();
			const ok = document.execCommand("copy");
			area.remove();
			notice = ok ? t("lanCopied") : bad(t("lanCopyFailed"));
		}
		render();
	}

	/** Pastille de niveau (rouge pour Pilotage complet). */
	/** Minutes restantes d'un stop temporaire ; `null` = sans limite ; 0 = en marche. */
	const stopLeft = (tok) => {
		if (!tok.stopped) return 0;
		if (tok.stopped.until === null) return null;
		return Math.max(0, Math.ceil((Date.parse(tok.stopped.until) - Date.now()) / 60_000));
	};
	const stopText = (tok) => {
		const left = stopLeft(tok);
		return left === 0 ? t("accessRunning") : left === null ? `⏹ ${t("accessStopped")}` : `⏹ ${fmt("accessStoppedFor", left < 60 ? `${left} min` : `${Math.floor(left / 60)} h ${String(left % 60).padStart(2, "0")}`)}`;
	};

	async function stop(tok, minutes) {
		const r = await send(`/api/v1/access/tokens/${encodeURIComponent(tok.id)}/stop`, "POST", minutes ? { minutes } : {});
		notice = r?.status === 200 ? fmt("accessStopDone", tok.name) : bad(t("accessFailed"));
		stopping = null;
		await load();
		render();
	}

	async function start(tok) {
		const r = await send(`/api/v1/access/tokens/${encodeURIComponent(tok.id)}/start`, "POST");
		notice = r?.status === 200 ? fmt("accessStartDone", tok.name) : bad(t("accessFailed"));
		await load();
		render();
	}

	const levelBadge = (level) => el("span", `acc-badge acc-${level}`, t(`accessLevel_${level}`));

	function renderForm() {
		const box = el("div", "acc-form");
		box.append(el("h3", "", form === "new" ? t("accessNew") : t("accessEdit")));
		const nameLabel = el("label", "acc-name", `${t("accessName")} `);
		const name = el("input");
		name.maxLength = 32;
		name.value = draft.name;
		name.placeholder = "VoiceAttack";
		name.addEventListener("input", () => (draft.name = name.value));
		nameLabel.append(name);
		box.append(nameLabel);

		const levels = el("div", "acc-levels");
		levels.setAttribute("role", "radiogroup");
		levels.setAttribute("aria-label", t("accessLevel"));
		for (const level of LEVELS) {
			const card = button(`acc-level acc-${level}`);
			card.setAttribute("role", "radio");
			card.setAttribute("aria-checked", String(draft.level === level));
			card.append(el("b", "", t(`accessLevel_${level}`)), el("small", "", t(`accessLevelDesc_${level}`)));
			card.addEventListener("click", () => {
				draft.level = level;
				render();
			});
			levels.append(card);
		}
		box.append(levels);

		const lan = el("label", "opt-check acc-lan");
		const lanInput = el("input");
		lanInput.type = "checkbox";
		lanInput.checked = draft.lan;
		lanInput.addEventListener("change", () => {
			draft.lan = lanInput.checked;
			render();
		});
		lan.append(lanInput, el("span", "", ` ${t("accessLan")}`));
		box.append(lan);
		if (draft.level === "pilot_full") box.append(el("p", "acc-warn", draft.lan ? t("accessFullLanWarn") : t("accessFullWarn")));

		const row = el("div", "lan-row");
		const ok = button("acc-primary", form === "new" ? t("accessCreate") : t("accessSave"));
		ok.disabled = busy;
		ok.addEventListener("click", save);
		const cancel = button("", t("accessCancel"));
		cancel.addEventListener("click", () => {
			form = null;
			notice = "";
			render();
		});
		row.append(ok, cancel);
		box.append(row);
		queueMicrotask(() => {
			if (document.activeElement === document.body || !box.contains(document.activeElement)) name.focus();
		});
		return box;
	}

	/** Journal ouvert : tout ce qu'il montre est vu. */
	function markSeen(id) {
		const last = logs[id]?.entries.at(-1)?.at;
		if (!last || seen[id] === last) return;
		seen[id] = last;
		try {
			localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
		} catch {
			/* stockage indisponible : signalé de nouveau au prochain chargement */
		}
	}
	/** Appels arrivés depuis la dernière ouverture du journal de ce jeton. */
	const unseenCalls = (id) => (logs[id]?.entries ?? []).filter((e) => !seen[id] || e.at > seen[id]);

	/** Indicateur « 🔑 N appels » de la barre du haut : du nouveau dans les journaux ; orange s'il y a des erreurs. */
	function renderPill() {
		const fresh = (tokens ?? []).map((tok) => ({ tok, calls: unseenCalls(tok.id) })).filter((x) => x.calls.length);
		const calls = fresh.reduce((n, x) => n + x.calls.length, 0);
		pill.hidden = !calls;
		if (!calls) return;
		const errors = fresh.reduce((n, x) => n + x.calls.filter((e) => isAlert(e.status)).length, 0);
		pill.className = `plg-pill ${errors ? "warn" : "ok"}`;
		pill.textContent = `🔑 ${fmt(calls === 1 ? "accessPillOne" : "accessPillMany", calls)}${errors ? ` · ⚠ ${errors}` : ""}`;
		pill.title = fresh
			.map(({ tok, calls: c }) => {
				const bad = c.filter((e) => isAlert(e.status)).length;
				return fmt(bad ? "accessPillTokenErr" : "accessPillToken", tok.name, c.length, bad);
			})
			.join(" · ");
	}

	/** Fenêtre fermée : l'indicateur suit les journaux. */
	async function pollBar() {
		clearTimeout(barTimer);
		if (!dialog.open && (await load())) renderPill();
		barTimer = setTimeout(pollBar, POLL_BAR_MS);
	}

	/** Erreurs (statut 400 ou plus) arrivées depuis la dernière ouverture du journal. */
	const unseenErrors = (id) => (logs[id]?.entries ?? []).filter((e) => isAlert(e.status) && (!seen[id] || e.at > seen[id])).length;

	function renderLog(tok) {
		const log = logs[tok.id];
		const box = el("div", "acc-log");
		if (!log || !log.entries.length) {
			box.append(el("p", "acc-livebadge", `● ${t("accessLive")}`), el("p", "acc-muted", t("accessLogEmpty")));
			return box;
		}
		box.append(el("p", "acc-livebadge", `● ${t("accessLive")}`));
		if (log.refused) box.append(el("p", "acc-refused", fmt("accessRefused", log.refused)));
		const list = el("ol", "acc-entries");
		for (const e of [...log.entries].reverse()) {
			const li = el("li", isAlert(e.status) ? "bad" : "");
			li.append(el("span", "acc-at", when(e.at, "medium")), el("code", "", `${e.method} ${e.path}`), el("span", "acc-status", String(e.status)));
			if (e.sensitive) li.append(el("span", "acc-sensitive", `⚠ ${t("accessSensitive")}`));
			list.append(li);
		}
		box.append(list, el("p", "acc-muted acc-live", t("accessLogNote")));
		return box;
	}

	function renderToken(tok) {
		const item = el("li", "acc-item");
		const head = el("div", "acc-head");
		const id = el("div", "acc-id");
		id.append(el("b", "", tok.name), el("span", "acc-last4", `…${tok.last4}`));
		const tags = el("div", "acc-tags");
		const left = stopLeft(tok);
		tags.append(el("span", `acc-badge acc-run${left === 0 ? " on" : left === null ? " off" : " tmp"}`, stopText(tok)), levelBadge(tok.level));
		if (openLog === tok.id) markSeen(tok.id);
		const errors = unseenErrors(tok.id);
		if (errors) {
			const warn = button("acc-badge acc-errors", `⚠ ${errors}`);
			warn.title = fmt("accessErrors", errors);
			warn.setAttribute("aria-label", fmt("accessErrors", errors));
			warn.addEventListener("click", () => {
				openLog = tok.id;
				render();
			});
			tags.prepend(warn);
		}
		if (tok.lan) tags.append(el("span", `acc-badge acc-lanb${tok.level === "pilot_full" ? " danger" : ""}`, `📶 ${t("accessLanShort")}`));
		head.append(id, tags);
		const used = logs[tok.id]?.lastUsed;
		const meta = el("div", "acc-muted", `${fmt("accessCreated", when(tok.created))} · ${used ? fmt("accessUsed", when(used)) : t("accessNeverUsed")}`);
		const row = el("div", "lan-row acc-actions");
		const logBtn = button(errors ? "acc-log-warn" : "", openLog === tok.id ? t("accessLogHide") : errors ? `${t("accessLog")} ⚠` : t("accessLog"));
		logBtn.addEventListener("click", async () => {
			openLog = openLog === tok.id ? null : tok.id;
			if (openLog) await loadLog(tok.id);
			render();
		});
		const edit = button("", t("accessEditBtn"));
		edit.disabled = busy;
		edit.addEventListener("click", () => {
			form = tok.id;
			draft = { name: tok.name, level: tok.level, lan: tok.lan };
			notice = "";
			render();
		});
		const again = button("", t("accessRenew"));
		again.disabled = busy;
		again.addEventListener("click", () => renew(tok));
		const del = button("acc-revoke", t("accessRevoke"));
		del.disabled = busy;
		del.addEventListener("click", () => revoke(tok));
		const power = button(left === 0 ? "" : "acc-primary", left === 0 ? `⏹ ${t("accessStop")}` : `▶ ${t("accessStart")}`);
		power.disabled = busy;
		power.addEventListener("click", () => {
			if (left !== 0) return start(tok);
			stopping = stopping === tok.id ? null : tok.id;
			render();
		});
		row.append(power, logBtn, edit, again, del);
		item.append(head, meta, row);
		if (stopping === tok.id && left === 0) {
			const choice = el("div", "lan-row acc-stop");
			choice.append(el("span", "acc-muted", t("accessStopFor")));
			for (const [label, minutes] of [["15 min", 15], ["1 h", 60], [t("accessStopNoLimit"), undefined]]) {
				const b = button(minutes ? "" : "acc-revoke", label);
				b.disabled = busy;
				b.addEventListener("click", () => stop(tok, minutes));
				choice.append(b);
			}
			const cancel = button("", t("accessCancel"));
			cancel.addEventListener("click", () => ((stopping = null), render()));
			choice.append(cancel);
			item.append(choice);
		}
		if (form === tok.id) item.append(renderForm());
		if (openLog === tok.id) item.append(renderLog(tok));
		return item;
	}

	function render() {
		renderPill();
		if (!dialog.open) return;
		const box = el("div", "acc-dlg");
		box.append(el("h2", "", t("accessTitle")), el("p", "lan-sub", t("accessSub")));

		if (created) {
			const once = el("div", "acc-once");
			once.append(el("b", "", fmt(created.renewed ? "accessRenewedTitle" : "accessOnceTitle", created.name)), el("p", "", t(created.renewed ? "accessRenewedOnce" : "accessOnce")));
			const code = el("code", "acc-secret", created.secret);
			const copyBtn = button("acc-primary", t("accessCopy"));
			const secret = created.secret;
			copyBtn.addEventListener("click", () => copy(secret));
			const done = button("", t("accessOnceDone"));
			done.addEventListener("click", () => {
				created = null;
				notice = "";
				render();
			});
			const row = el("div", "lan-row");
			row.append(copyBtn, done);
			once.append(code, row);
			box.append(once);
		}

		if (tokens === null) box.append(el("p", "acc-muted", t("accessLoading")));
		else if (!tokens.length && form !== "new") box.append(el("p", "acc-muted", t("accessNone")));
		else if (tokens.length) {
			const list = el("ul", "acc-list");
			list.append(...tokens.map(renderToken));
			box.append(list);
		}

		if (form === "new") box.append(renderForm());
		else if (tokens && !created) {
			const add = button("acc-primary acc-add", `＋ ${t("accessNew")}`);
			add.disabled = busy || tokens.length >= 20;
			add.addEventListener("click", () => {
				form = "new";
				draft = { name: "", level: "read", lan: false };
				notice = "";
				render();
			});
			box.append(add);
		}
		if (notice) box.append(el("p", notice.bad ? "lan-notice acc-notice-bad" : "lan-notice", notice.bad ? `⚠ ${notice.text}` : notice));

		const notes = el("div", "lan-note");
		for (const key of ["accessNoteHeader", "accessNoteApp", "accessNoteLan"]) notes.append(el("div", "", t(key)));
		box.append(notes);

		const foot = el("form", "lan-foot");
		foot.method = "dialog";
		const close = el("button", "", t("close"));
		close.type = "submit";
		foot.append(close);
		box.append(foot);
		const scroll = dialog.scrollTop;
		const logScroll = dialog.querySelector(".acc-entries")?.scrollTop ?? 0;
		dialog.replaceChildren(box);
		dialog.scrollTop = scroll;
		const entries = dialog.querySelector(".acc-entries");
		if (entries) entries.scrollTop = logScroll;
	}

	async function open() {
		form = null;
		created = null;
		openLog = null;
		stopping = null;
		notice = "";
		dialog.showModal();
		render();
		if (!(await load())) notice = bad(t("accessFailed"));
		render();
		timer = setTimeout(poll, POLL_MS);
	}
	openBtn.addEventListener("click", open);
	pill.addEventListener("click", open);
	dialog.addEventListener("close", () => {
		clearTimeout(timer);
		renderPill();
		// Le jeton créé n'est plus jamais affiché une fois la fenêtre fermée.
		created = null;
		form = null;
	});

	return {
		/** Bouton visible seulement sur le PC avec le jeton de l'appli ; à rappeler après un changement de jeton. */
		async check() {
			let ok = false;
			try {
				ok = (await api("/api/v1/access/tokens")).status === 200;
			} catch {
				/* appli arrêtée */
			}
			openBtn.hidden = !ok;
			document.getElementById("opt-access").hidden = !ok;
			clearTimeout(barTimer);
			if (ok) pollBar();
			else pill.hidden = true;
		},
		applyTexts() {
			openBtn.textContent = t("accessButton");
			document.getElementById("opt-h-access").textContent = t("accessTitle");
			dialog.setAttribute("aria-label", t("accessTitle"));
			render();
		},
	};
}
