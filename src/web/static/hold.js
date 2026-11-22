// Appui maintenu (ex. éjection) : il faut rester appuyé HOLD_MS ; un anneau rouge montre le temps restant ;
// relâcher (ou glisser hors du bouton) avant la fin annule. Même règle que les touches du plugin (src/game/dangerous.ts).

/** Actions à appui maintenu (copie de HOLD_ACTIONS côté serveur). */
export const HOLD_ACTIONS = new Set(["v_eject"]);
export const HOLD_MS = 1500;

/**
 * Rend `el` « à maintenir » : `onDone()` n'est appelé qu'après HOLD_MS d'appui continu.
 * `enabled()` : faux = comportement normal (clic), géré ailleurs. Renvoie une fonction de nettoyage.
 */
export function holdToPress(el, onDone, enabled = () => true) {
	let timer;
	let start = 0;
	let raf = 0;
	const ring = document.createElement("span");
	ring.className = "hold-ring";
	ring.setAttribute("aria-hidden", "true");
	el.append(ring);

	const stop = () => {
		clearTimeout(timer);
		cancelAnimationFrame(raf);
		timer = undefined;
		el.classList.remove("holding");
		el.style.removeProperty("--hold");
	};
	const frame = () => {
		const p = Math.min(1, (performance.now() - start) / HOLD_MS);
		el.style.setProperty("--hold", String(p));
		ring.dataset.left = ((HOLD_MS * (1 - p)) / 1000).toFixed(1);
		if (p < 1 && timer) raf = requestAnimationFrame(frame);
	};
	const begin = (e) => {
		if (!enabled() || timer) return;
		e.preventDefault();
		start = performance.now();
		el.classList.add("holding");
		frame();
		timer = setTimeout(() => {
			stop();
			onDone();
		}, HOLD_MS);
	};

	el.addEventListener("pointerdown", (e) => {
		if (e.button !== 0) return;
		begin(e);
		el.setPointerCapture?.(e.pointerId);
	});
	for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(type, stop);
	el.addEventListener("pointerleave", stop);
	// Clavier : maintenir Entrée ou Espace.
	el.addEventListener("keydown", (e) => {
		if ((e.key === "Enter" || e.key === " ") && !e.repeat) begin(e);
	});
	el.addEventListener("keyup", (e) => {
		if (e.key === "Enter" || e.key === " ") stop();
	});
	// Le clic (relâchement) ne déclenche jamais rien seul.
	el.addEventListener(
		"click",
		(e) => {
			if (enabled()) {
				e.preventDefault();
				e.stopImmediatePropagation();
			}
		},
		true,
	);
	el.addEventListener("contextmenu", (e) => enabled() && e.preventDefault());
	return stop;
}
