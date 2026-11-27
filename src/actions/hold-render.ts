// SPDX-License-Identifier: MPL-2.0
// Image de touche pendant un appui maintenu (ex. éjection) : anneau rouge qui se remplit et temps restant.

const FONT = "Segoe UI, Arial, sans-serif";
const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** `progress` de 0 à 1 ; `remainingMs` affiché en secondes (une décimale). */
export function renderHoldKey(label: string, progress: number, remainingMs: number): string {
	const p = Math.min(1, Math.max(0, progress));
	const r = 52;
	const c = 2 * Math.PI * r;
	const seconds = (Math.max(0, remainingMs) / 1000).toFixed(1);
	const svg = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">`,
		`<rect width="144" height="144" fill="#2A1212"/>`,
		`<circle cx="72" cy="66" r="${r}" fill="none" stroke="#4A2020" stroke-width="10"/>`,
		`<circle cx="72" cy="66" r="${r}" fill="none" stroke="#E24B4A" stroke-width="10" stroke-linecap="round"`,
		` stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 72 66)"/>`,
		`<text x="72" y="76" font-family="${FONT}" font-size="30" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${seconds}</text>`,
		`<text x="72" y="136" font-family="${FONT}" font-size="17" font-weight="bold" fill="#F09595" text-anchor="middle">${escapeXml(label)}</text>`,
		`</svg>`,
	].join("");
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
