// Tuto « Activer la télémétrie » : les étapes pour Star Citizen 5.0 (user.cfg) et 4.10.3 (variable d'environnement).
// L'appli ne touche à aucun fichier du jeu : elle explique, le joueur crée user.cfg lui-même.

const CFG_LINE = "server.game.telemetry.enabled=1";
const DEFAULT_DIR = "C:\\Program Files\\Roberts Space Industries\\StarCitizen\\PTU\\";
const LIVE_COMMAND = "setx GRPC_CLIENT_SERVER_ENABLED true";
const LOG_LINE = "[User CFG ] server.game.telemetry.enabled=true";

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};

/**
 * @param {object} o
 * @param {HTMLDialogElement} o.dialog
 * @param {(key: string) => string} o.t
 * @param {() => string} o.readme lien vers la section du README dans la langue de la page
 */
export function createSetup({ dialog, t, readme }) {
	/** Ligne à copier : texte sélectionnable + bouton « Copier » (sélectionne le texte si le presse-papiers est refusé, ex. en http sur le réseau). */
	const copyLine = (text) => {
		const row = el("div", "setup-copy");
		const code = el("code", "", text);
		const b = el("button", "", t("copy"));
		b.type = "button";
		b.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText(text);
				b.textContent = t("copied");
				setTimeout(() => (b.textContent = t("copy")), 1500);
			} catch {
				const range = document.createRange();
				range.selectNodeContents(code);
				getSelection()?.removeAllRanges();
				getSelection()?.addRange(range);
			}
		});
		row.append(code, b);
		return row;
	};

	function render() {
		const steps = el("ol", "setup-steps");
		const step = (...parts) => {
			const li = el("li");
			li.append(...parts);
			steps.append(li);
		};
		step(t("setupStep1"));
		step(el("span", "", t("setupStep2")), copyLine(DEFAULT_DIR), el("small", "", t("setupStep2Hint")));
		step(t("setupStep3"));
		step(el("span", "", t("setupStep4")), copyLine(CFG_LINE));
		step(t("setupStep5"));

		const check = el("p", "setup-check", t("setupCheck"));
		check.append(el("code", "", LOG_LINE));

		const live = el("div", "setup-live");
		live.append(el("h3", "", t("setupLiveTitle")), el("p", "", t("setupLive")), copyLine(LIVE_COMMAND));

		const links = el("p", "links");
		const a = el("a", "", t("setupReadme"));
		a.href = readme();
		a.target = "_blank";
		a.rel = "noopener";
		links.append(a);

		const close = el("form");
		close.method = "dialog";
		const b = el("button", "", t("close"));
		b.type = "submit";
		close.append(b);

		const title = el("h2", "", t("setupTitle"));
		title.id = "setup-title";
		dialog.replaceChildren(title, el("p", "setup-intro", t("setupIntro")), steps, check, live, el("p", "setup-note", t("setupNote")), links, close);
	}

	return {
		open() {
			render();
			if (!dialog.open) dialog.showModal();
		},
		/** Changement de langue : refaire la fenêtre si elle est ouverte. */
		applyTexts() {
			if (dialog.open) render();
		},
	};
}
