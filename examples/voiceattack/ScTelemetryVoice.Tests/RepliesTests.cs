namespace ScTelemetryVoice.Tests;

public sealed class RepliesTests
{
	private static readonly FunctionWords GearOff = new("off", "RENTRÉ", "SORTI", "RENTRÉ", "Train");
	private static readonly FunctionWords GearOffEn = new("off", "RETRACTED", "DEPLOYED", "RETRACTED", "Landing gear");
	private static readonly ApiResponse Sent = new(200, """{"decision":"sent","action":"v_gear_deploy","ok":true}""");

	[Fact]
	public void Sent_toggle_says_target_state() =>
		Assert.Equal(new OrderResult(OrderOutcome.Sent, "Train : sorti."), Replies.ForFunction("fr", Sent, GearOff, "toggle"));

	[Fact]
	public void Sent_on_says_on_word() =>
		Assert.Equal("Train : sorti.", Replies.ForFunction("fr", Sent, GearOff with { State = "on", Word = "SORTI" }, "on").Reply);

	[Fact]
	public void Sent_toggle_while_moving_on_targets_off() =>
		Assert.Equal("Train : rentré.", Replies.ForFunction("fr", Sent, GearOff with { State = "moving-on" }, "toggle").Reply);

	[Fact]
	public void Noop_says_already() =>
		Assert.Equal(new OrderResult(OrderOutcome.Noop, "Train : déjà rentré."), Replies.ForFunction("fr", new(200, """{"decision":"noop"}"""), GearOff, "off"));

	[Fact]
	public void Refused_unavailable() =>
		Assert.Equal(new OrderResult(OrderOutcome.Refused, "Ce vaisseau n'en a pas."),
			Replies.ForFunction("fr", new(409, """{"decision":"refused","code":"unavailable","reason":"x"}"""), GearOff, "toggle"));

	[Fact]
	public void Refused_no_command_uses_reason() =>
		Assert.Equal("Pas de commande.",
			Replies.ForFunction("fr", new(409, """{"decision":"refused","code":"no_command","reason":"Pas de commande."}"""), GearOff, "toggle").Reply);

	[Fact]
	public void Dangerous_is_protected()
	{
		var r = Replies.ForFunction("fr", new(403, """{"error":"forbidden","reason":"dangerous_action"}"""), GearOff, "toggle");
		Assert.Equal(OrderOutcome.Protected, r.Outcome);
		Assert.Equal("Action protégée.", r.Reply);
	}

	[Theory]
	[InlineData(401, "{}")]
	[InlineData(403, """{"error":"forbidden","reason":"level"}""")]
	[InlineData(403, """{"error":"forbidden","reason":"stopped"}""")]
	public void Token_refused(int status, string body) =>
		Assert.Equal(new OrderResult(OrderOutcome.Error, "Jeton refusé."), Replies.ForFunction("fr", new(status, body), GearOff, "toggle"));

	[Theory]
	[InlineData("UNAVAILABLE")]
	[InlineData("DEADLINE_EXCEEDED")]
	public void Bad_gateway_unreachable(string reason) =>
		Assert.Equal(new OrderResult(OrderOutcome.Error, "Jeu injoignable."),
			Replies.ForFunction("fr", new(502, "{\"ok\":false,\"reason\":\"" + reason + "\"}"), GearOff, "toggle"));

	[Fact]
	public void Bad_gateway_refused_by_game() =>
		Assert.Equal("Le jeu a refusé.",
			Replies.ForFunction("fr", new(502, """{"decision":"sent","action":"v_gear_deploy","ok":false,"reason":"TRIGGER_GAME_ACTION_STATUS_FAILED"}"""), GearOff, "toggle").Reply);

	[Fact]
	public void App_closed() =>
		Assert.Equal(new OrderResult(OrderOutcome.Error, "Appli fermée."), Replies.ForFunction("fr", new(0, ""), GearOff, "toggle"));

	[Fact]
	public void English() =>
		Assert.Equal("Landing gear: deployed.", Replies.ForFunction("en", Sent, GearOffEn, "toggle").Reply);

	[Fact]
	public void No_words_yet_says_sent() =>
		Assert.Equal(new OrderResult(OrderOutcome.Sent, "Commande envoyée."), Replies.ForFunction("fr", Sent, null, "toggle"));

	[Fact]
	public void Unknown_state_toggle_says_sent() =>
		Assert.Equal("Commande envoyée.", Replies.ForFunction("fr", Sent, GearOff with { State = "unknown" }, "toggle").Reply);

	[Fact]
	public void Action_sent() =>
		Assert.Equal(new OrderResult(OrderOutcome.Sent, "Commande envoyée."), Replies.ForAction("fr", new(200, """{"ok":true}"""), "v_lights_on"));

	[Fact]
	public void Action_refused_by_game() =>
		Assert.Equal(new OrderResult(OrderOutcome.Error, "Le jeu a refusé."),
			Replies.ForAction("fr", new(502, """{"ok":false,"reason":"TRIGGER_GAME_ACTION_STATUS_FAILED"}"""), "v_open_all_doors"));

	[Fact]
	public void Action_protected() =>
		Assert.Equal(OrderOutcome.Protected, Replies.ForAction("fr", new(403, """{"error":"forbidden","reason":"dangerous_action"}"""), "v_eject").Outcome);

	[Fact]
	public void Say_percent()
	{
		var s = new GameState();
		s.ApplyState(Samples.State(hydrogen: 18));
		Assert.Equal("Hydrogène : 18 %.", Replies.ForSay("fr", s, "hydrogen"));
	}

	[Fact]
	public void Say_percent_english_uses_api_label()
	{
		var s = new GameState();
		s.ApplyState(Samples.State(hydrogen: 18));
		Assert.Equal("Hydrogène: 18 percent.", Replies.ForSay("en", s, "hydrogen"));
	}

	[Fact]
	public void Say_unavailable() => Assert.Equal("Pas de donnée.", Replies.ForSay("fr", new GameState(), "hydrogen"));

	[Fact]
	public void Unknown_command() => Assert.Equal("Unknown command.", Replies.Unknown("en"));
}
