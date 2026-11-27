// SPDX-License-Identifier: MIT
using System.Text.Json;

namespace ScTelemetryVoice;

public enum OrderOutcome { Sent, Noop, Refused, Protected, Error }

/// <summary>Résultat d'un ordre : ce qui s'est passé et la phrase que VoiceAttack peut dire.</summary>
public sealed record OrderResult(OrderOutcome Outcome, string Reply);

/// <summary>
/// Phrases courtes FR / EN. Elles disent « commande envoyée » (l'état visé), pas l'état confirmé : attendre
/// l'état réel bloquerait la commande plusieurs secondes (train d'atterrissage).
/// </summary>
public static class Replies
{
	private static readonly Dictionary<string, (string Fr, string En)> Texts = new()
	{
		["sent"] = ("Commande envoyée.", "Command sent."),
		["already"] = ("déjà", "already"),
		["unavailable"] = ("Ce vaisseau n'en a pas.", "This ship doesn't have it."),
		["no_command"] = ("Pas de commande pour ça.", "No command for that."),
		["protected"] = ("Action protégée.", "Protected action."),
		["token"] = ("Jeton refusé.", "Token refused."),
		["unreachable"] = ("Jeu injoignable.", "Game unreachable."),
		["game_refused"] = ("Le jeu a refusé.", "The game refused."),
		["app_closed"] = ("Appli fermée.", "App closed."),
		["error"] = ("Erreur.", "Error."),
		["no_data"] = ("Pas de donnée.", "No data."),
		["unknown"] = ("Commande inconnue.", "Unknown command."),
	};

	// Codes gRPC qui veulent dire « le jeu ne répond pas » (cf. src/game/client.ts) ; tout autre motif d'un
	// 502 est un refus du jeu (ex. TRIGGER_GAME_ACTION_STATUS_FAILED pour les portes en 5.0 PTU).
	private static readonly string[] UnreachableCodes = ["UNAVAILABLE", "DEADLINE_EXCEEDED"];

	public static OrderResult ForFunction(string lang, ApiResponse r, FunctionWords? words, string mode)
	{
		if (Failure(lang, r) is { } failure) return failure;
		var body = Parse(r.Body);
		var decision = Str(body, "decision");
		if (decision == "noop" && words is { Word.Length: > 0 })
			return new(OrderOutcome.Noop, Sentence(lang, words.Label, $"{T(lang, "already")} {words.Word.ToLowerInvariant()}"));
		if (decision == "noop") return new(OrderOutcome.Noop, T(lang, "sent"));
		var target = mode switch
		{
			"on" => words?.On,
			"off" => words?.Off,
			_ => words?.State switch
			{
				"on" or "moving-on" => words.Off,
				"off" or "moving-off" => words.On,
				_ => null,
			},
		};
		return new(OrderOutcome.Sent, words is not null && !string.IsNullOrEmpty(target)
			? Sentence(lang, words.Label, target.ToLowerInvariant())
			: T(lang, "sent"));
	}

	public static OrderResult ForAction(string lang, ApiResponse r, string name) =>
		Failure(lang, r) ?? new(OrderOutcome.Sent, T(lang, "sent"));

	/// <summary>« Hydrogène : 18 %. » / « Hydrogen: 18 percent. » ; « Pas de donnée. » si inconnu.</summary>
	public static string ForSay(string lang, GameState s, string key)
	{
		var pct = s.Percent(key);
		if (pct is null) return T(lang, "no_data");
		var label = s.Label(key) ?? key;
		return lang == "en" ? $"{label}: {pct} percent." : $"{label} : {pct} %.";
	}

	public static string Unknown(string lang) => T(lang, "unknown");

	private static OrderResult? Failure(string lang, ApiResponse r)
	{
		var body = Parse(r.Body);
		switch (r.Status)
		{
			case 0:
				return new(OrderOutcome.Error, T(lang, "app_closed"));
			case 401:
				return new(OrderOutcome.Error, T(lang, "token"));
			case 403:
				return Str(body, "reason") == "dangerous_action"
					? new(OrderOutcome.Protected, T(lang, "protected"))
					: new(OrderOutcome.Error, T(lang, "token"));
			case 409:
				return Str(body, "code") == "unavailable"
					? new(OrderOutcome.Refused, T(lang, "unavailable"))
					: new(OrderOutcome.Refused, Str(body, "reason") is { Length: > 0 } reason ? reason : T(lang, "no_command"));
			case 502:
				return UnreachableCodes.Contains(Str(body, "reason"))
					? new(OrderOutcome.Error, T(lang, "unreachable"))
					: new(OrderOutcome.Error, T(lang, "game_refused"));
			case >= 200 and < 300:
				return null;
			default:
				return new(OrderOutcome.Error, T(lang, "error"));
		}
	}

	private static string Sentence(string lang, string label, string rest) =>
		lang == "en" ? $"{label}: {rest}." : $"{label} : {rest}.";

	private static string T(string lang, string key) => lang == "en" ? Texts[key].En : Texts[key].Fr;

	private static JsonElement Parse(string body)
	{
		try
		{
			using var doc = JsonDocument.Parse(body);
			return doc.RootElement.Clone();
		}
		catch (JsonException)
		{
			return default;
		}
	}

	private static string? Str(JsonElement o, string name) =>
		o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
