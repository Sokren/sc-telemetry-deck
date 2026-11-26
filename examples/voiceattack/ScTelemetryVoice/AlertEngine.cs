namespace ScTelemetryVoice;

/// <summary>
/// Décide quelles commandes d'alerte du profil lancer. Une alerte part quand la valeur passe sous son seuil,
/// puis se tait jusqu'à remonter de 10 points au-dessus (réarmement) ; jamais deux fois en moins de 30 s.
/// Rien quand le jeu n'envoie pas de données ; les alertes vaisseau se taisent hors vaisseau.
/// </summary>
public sealed class AlertEngine
{
	public const string Connected = "((SCTD connecté))";
	public const string Lost = "((SCTD jeu perdu))";
	private const int Rearm = 10;
	private static readonly TimeSpan Cooldown = TimeSpan.FromSeconds(30);

	private sealed class Rule(string command, string key, bool shipOnly, int threshold)
	{
		public string Command { get; } = command;
		public string Key { get; } = key;
		public bool ShipOnly { get; } = shipOnly;
		public int Threshold { get; } = threshold;
		public bool Armed { get; set; } = true;
		public DateTime? LastFired { get; set; }
	}

	private readonly Func<DateTime> _now;
	private readonly Rule[] _rules;
	private bool? _wasLive;

	public AlertEngine(AlertThresholds t, Func<DateTime> now)
	{
		_now = now;
		_rules =
		[
			new("((SCTD alerte boucliers))", "shields", true, t.Shields),
			new("((SCTD alerte coque))", "hull", true, t.Hull),
			new("((SCTD alerte carburant))", "hydrogen", true, t.Hydrogen),
			new("((SCTD alerte oxygène))", "oxygen", false, t.Oxygen),
			new("((SCTD alerte santé))", "health", false, t.Health),
		];
	}

	/// <summary>Noms des commandes VoiceAttack à lancer maintenant, dans un ordre fixe.</summary>
	public IReadOnlyList<string> Evaluate(GameState s)
	{
		var fire = new List<string>();
		var live = s.Live;
		if (_wasLive is { } was && was != live) fire.Add(live ? Connected : Lost);
		_wasLive = live;
		if (!live) return fire;

		var inShip = s.InShip;
		var now = _now();
		foreach (var r in _rules)
		{
			if (r.ShipOnly && !inShip) continue;
			if (s.Percent(r.Key) is not { } value) continue;
			if (value >= r.Threshold + Rearm) { r.Armed = true; continue; }
			if (value >= r.Threshold || !r.Armed) continue;
			if (r.LastFired is { } last && now - last < Cooldown) continue;
			r.Armed = false;
			r.LastFired = now;
			fire.Add(r.Command);
		}
		return fire;
	}
}
