// SPDX-License-Identifier: MIT
using System.Text.Json;

namespace ScTelemetryVoice;

/// <summary>Seuils d'alerte en pourcentage (une alerte part quand la valeur passe dessous).</summary>
public sealed record AlertThresholds(int Shields = 25, int Hull = 50, int Hydrogen = 20, int Oxygen = 25, int Health = 30, int Thirst = 25);

/// <summary>Réglages lus dans <c>sctd-voice.json</c>, à côté de la DLL.</summary>
public sealed record VoiceConfig(string Url, string Token, string Lang, AlertThresholds Thresholds);

public static class ConfigLoader
{
	public const string DefaultUrl = "http://127.0.0.1:8743";

	/// <summary>
	/// Lit le fichier de réglages. Renvoie <c>null</c> et un message FR / EN (sans jamais le jeton) si le
	/// fichier manque ou est invalide.
	/// </summary>
	public static VoiceConfig? Load(string path, out string error)
	{
		error = "";
		if (!File.Exists(path))
		{
			error = $"sctd-voice.json introuvable / not found: {path}";
			return null;
		}
		try
		{
			using var doc = JsonDocument.Parse(File.ReadAllText(path));
			var root = doc.RootElement;
			var token = Str(root, "token");
			if (string.IsNullOrWhiteSpace(token))
			{
				error = "sctd-voice.json : jeton manquant (« token ») / missing token";
				return null;
			}
			var lang = (Str(root, "lang") ?? "fr").Trim().ToLowerInvariant();
			if (lang is not ("fr" or "en"))
			{
				error = "sctd-voice.json : « lang » doit valoir fr ou en / must be fr or en";
				return null;
			}
			var url = (Str(root, "url") ?? DefaultUrl).Trim().TrimEnd('/');
			var t = new AlertThresholds();
			if (root.TryGetProperty("alerts", out var a) && a.ValueKind == JsonValueKind.Object)
			{
				t = new AlertThresholds(
					Int(a, "shields") ?? t.Shields,
					Int(a, "hull") ?? t.Hull,
					Int(a, "hydrogen") ?? t.Hydrogen,
					Int(a, "oxygen") ?? t.Oxygen,
					Int(a, "health") ?? t.Health,
					Int(a, "thirst") ?? t.Thirst);
			}
			return new VoiceConfig(url, token.Trim(), lang, t);
		}
		catch (Exception e) when (e is JsonException or IOException or UnauthorizedAccessException or InvalidOperationException)
		{
			error = "sctd-voice.json illisible / unreadable (JSON)";
			return null;
		}
	}

	private static string? Str(JsonElement o, string name) =>
		o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

	private static int? Int(JsonElement o, string name) =>
		o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) ? i : null;
}
