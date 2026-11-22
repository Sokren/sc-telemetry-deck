// Applique le thème enregistré sur cet appareil avant l'affichage de la page (script classique, chargé dans <head>),
// pour éviter un éclair aux couleurs par défaut. Même format que themes.js.
(function () {
	try {
		var o = JSON.parse(localStorage.getItem("sctd-theme") || "{}") || {};
		var ids = ["green", "amber", "blue", "light"];
		if (ids.indexOf(o.id) >= 0) document.documentElement.dataset.theme = o.id;
		if (/^#[0-9a-f]{6}$/i.test(o.accent || "")) document.documentElement.style.setProperty("--accent", o.accent);
	} catch (e) {
		/* stockage indisponible : thème par défaut */
	}
})();
