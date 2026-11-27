namespace ScTelemetryVoice;

/// <summary>Ordre demandé par une commande VoiceAttack (contexte du plugin).</summary>
public abstract record Order;

/// <summary><c>function:&lt;id&gt;[:on|off|toggle]</c> — fonction vaisseau (train, phares…).</summary>
public sealed record FunctionOrder(string Id, string Mode) : Order;

/// <summary><c>action:&lt;nom&gt;</c> — action du jeu par son nom (ex. v_lights_toggle).</summary>
public sealed record ActionOrder(string Name) : Order;

/// <summary><c>say:&lt;clé&gt;</c> — valeur à dire (hydrogen, shields, oxygen, thirst…).</summary>
public sealed record SayOrder(string Id) : Order;

public static class ContextParser
{
	/// <summary>Décode le contexte ; <c>null</c> s'il est vide ou mal formé.</summary>
	public static Order? Parse(string? context)
	{
		if (string.IsNullOrWhiteSpace(context)) return null;
		var parts = context.Trim().Split(':');
		var kind = parts[0].Trim().ToLowerInvariant();
		var arg = parts.Length > 1 ? parts[1].Trim() : "";
		if (arg.Length == 0) return null;
		switch (kind)
		{
			case "function" when parts.Length <= 3:
				var mode = parts.Length == 3 ? parts[2].Trim().ToLowerInvariant() : "toggle";
				return mode is "on" or "off" or "toggle" ? new FunctionOrder(arg.ToLowerInvariant(), mode) : null;
			case "action" when parts.Length == 2:
				return new ActionOrder(arg);
			case "say" when parts.Length == 2:
				return new SayOrder(arg.ToLowerInvariant());
			default:
				return null;
		}
	}
}
