namespace ScTelemetryVoice.Tests;

public sealed class GameStateTests
{
	[Fact]
	public void ApplyState_reads_percents_ship_and_words()
	{
		var s = new GameState();
		s.ApplyState(Samples.State(gearState: "on"));
		Assert.True(s.InShip);
		Assert.Equal("Titan", s.ShipName);
		Assert.Equal(62, s.Percent("shields"));
		Assert.Equal(18, s.Percent("hydrogen"));
		Assert.Equal(90, s.Percent("oxygen"));
		var gear = s.Function("gear")!;
		Assert.Equal("SORTI", gear.Word);
		Assert.Equal("on", gear.State);
		Assert.Equal("RENTRÉ", gear.Off);
		Assert.Equal("Train", gear.Label);
	}

	[Fact]
	public void Missing_percent_is_null()
	{
		var s = new GameState();
		s.ApplyState(Samples.State(hull: null));
		Assert.Null(s.Percent("hull"));
		Assert.Null(s.Percent("quantum"));
	}

	[Fact]
	public void Label_of_known_key()
	{
		var s = new GameState();
		s.ApplyState(Samples.State());
		Assert.Equal("Hydrogène", s.Label("hydrogen"));
		Assert.Equal("Oxygène", s.Label("oxygen"));
	}

	[Fact]
	public void ApplyStatus_live()
	{
		var s = new GameState();
		Assert.False(s.Live);
		s.ApplyStatus(Samples.Status(live: true));
		Assert.True(s.Live);
		s.ApplyStatus(Samples.Status(live: false));
		Assert.False(s.Live);
	}

	[Fact]
	public void Unknown_fields_and_bad_json_ignored()
	{
		var s = new GameState();
		s.ApplyState("{oops");
		s.ApplyState("""{"other":1}""");
		s.ApplyStatus("[]");
		Assert.False(s.InShip);
		Assert.False(s.Live);
		Assert.Null(s.Function("gear"));
	}

	[Fact]
	public void Leaving_ship_sets_in_ship_false()
	{
		var s = new GameState();
		s.ApplyState(Samples.State());
		s.ApplyState(Samples.State(inShip: false));
		Assert.False(s.InShip);
	}
}
