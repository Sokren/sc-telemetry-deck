namespace ScTelemetryVoice.Tests;

public sealed class ContextParserTests
{
	[Theory]
	[InlineData("fonction:gear", "gear", "toggle")]
	[InlineData("fonction:lights:on", "lights", "on")]
	[InlineData(" FONCTION:Gear:OFF ", "gear", "off")]
	public void Parse_function(string ctx, string id, string mode) =>
		Assert.Equal(new FunctionOrder(id, mode), ContextParser.Parse(ctx));

	[Fact]
	public void Parse_action() =>
		Assert.Equal(new ActionOrder("v_lights_toggle"), ContextParser.Parse("action:v_lights_toggle"));

	[Fact]
	public void Parse_say() => Assert.Equal(new SayOrder("hydrogen"), ContextParser.Parse("dire:hydrogen"));

	[Theory]
	[InlineData(null)]
	[InlineData("")]
	[InlineData("fonction:")]
	[InlineData("fonction:gear:maybe")]
	[InlineData("xyz")]
	[InlineData("action:")]
	[InlineData("dire:")]
	public void Parse_invalid_is_null(string? ctx) => Assert.Null(ContextParser.Parse(ctx));
}
