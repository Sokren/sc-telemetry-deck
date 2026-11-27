namespace ScTelemetryVoice.Tests;

public sealed class AlertEngineTests
{
	private const string Shields = "((SCTD alert shields))";
	private DateTime _clock = new(2026, 11, 26, 20, 0, 0);
	private readonly GameState _s = new();
	private AlertEngine _e;

	public AlertEngineTests()
	{
		_e = new AlertEngine(new AlertThresholds(), () => _clock);
		_s.ApplyStatus(Samples.Status(live: true));
	}

	private void Set(int? shields, bool inShip = true, int? oxygen = 90, int? thirst = 80) =>
		_s.ApplyState(Samples.State(inShip: inShip, shields: shields, oxygen: oxygen, hydrogen: 60, thirst: thirst));

	private void Live(bool live) => _s.ApplyStatus(Samples.Status(live));

	[Fact]
	public void Crossing_below_fires_once()
	{
		Set(30); Assert.Empty(_e.Evaluate(_s));
		Set(24); Assert.Equal([Shields], _e.Evaluate(_s));
		Assert.Empty(_e.Evaluate(_s));
	}

	[Fact]
	public void Starting_below_fires()
	{
		Set(10);
		Assert.Contains(Shields, _e.Evaluate(_s));
	}

	[Fact]
	public void Oscillation_does_not_refire_before_rearm()
	{
		Set(24); _e.Evaluate(_s);
		Set(26); _e.Evaluate(_s);
		Set(24); Assert.Empty(_e.Evaluate(_s));
		Set(35); _e.Evaluate(_s);
		_clock += TimeSpan.FromSeconds(31);
		Set(24); Assert.Equal([Shields], _e.Evaluate(_s));
	}

	[Fact]
	public void Cooldown_30s_even_after_rearm()
	{
		Set(24); _e.Evaluate(_s);
		Set(40); _e.Evaluate(_s);
		_clock += TimeSpan.FromSeconds(10);
		Set(20); Assert.Empty(_e.Evaluate(_s));
	}

	[Fact]
	public void No_ship_alert_outside_ship()
	{
		Set(5, inShip: false);
		Assert.DoesNotContain(Shields, _e.Evaluate(_s));
	}

	[Fact]
	public void Oxygen_fires_on_foot()
	{
		Set(null, inShip: false, oxygen: 20);
		Assert.Contains("((SCTD alert oxygen))", _e.Evaluate(_s));
	}

	[Fact]
	public void Thirst_fires_on_foot_below_25()
	{
		Set(null, inShip: false, thirst: 30); Assert.DoesNotContain("((SCTD alert thirst))", _e.Evaluate(_s));
		Set(null, inShip: false, thirst: 20); Assert.Contains("((SCTD alert thirst))", _e.Evaluate(_s));
	}

	[Fact]
	public void Nothing_when_not_live_except_lost()
	{
		Set(80); _e.Evaluate(_s);
		Live(false); Set(5);
		Assert.Equal(["((SCTD game lost))"], _e.Evaluate(_s));
	}

	[Fact]
	public void Connected_on_live()
	{
		var e = new AlertEngine(new AlertThresholds(), () => _clock);
		Live(false); e.Evaluate(_s);
		Live(true);
		Assert.Contains("((SCTD connected))", e.Evaluate(_s));
	}

	[Fact]
	public void First_evaluation_not_live_is_silent()
	{
		var e = new AlertEngine(new AlertThresholds(), () => _clock);
		Live(false);
		Assert.Empty(e.Evaluate(_s));
	}

	[Fact]
	public void First_evaluation_live_does_not_say_connected()
	{
		Set(80);
		Assert.Empty(_e.Evaluate(_s));
	}

	[Fact]
	public void Null_value_neither_fires_nor_rearms()
	{
		Set(24); _e.Evaluate(_s);
		Set(null); _e.Evaluate(_s);
		_clock += TimeSpan.FromSeconds(60);
		Set(24); Assert.Empty(_e.Evaluate(_s));
	}

	[Fact]
	public void Leaving_ship_then_back_below_does_not_burst()
	{
		Set(24); _e.Evaluate(_s);
		Set(24, inShip: false); _e.Evaluate(_s);
		_clock += TimeSpan.FromSeconds(60);
		Set(24); Assert.Empty(_e.Evaluate(_s));
	}

	[Fact]
	public void Custom_threshold()
	{
		var e = new AlertEngine(new AlertThresholds(Shields: 40), () => _clock);
		Set(35);
		Assert.Equal([Shields], e.Evaluate(_s));
	}

	[Fact]
	public void Order_is_fixed()
	{
		_s.ApplyState(Samples.State(shields: 10, hull: 10, hydrogen: 10, oxygen: 10, health: 10));
		Assert.Equal(
			["((SCTD alert shields))", "((SCTD alert hull))", "((SCTD alert fuel))", "((SCTD alert oxygen))", "((SCTD alert health))"],
			_e.Evaluate(_s));
	}
}
