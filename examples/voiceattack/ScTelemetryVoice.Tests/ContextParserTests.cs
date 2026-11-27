// SPDX-License-Identifier: MPL-2.0
namespace ScTelemetryVoice.Tests;

public sealed class ContextParserTests
{
	[Theory]
	[InlineData("function:gear", "gear", "toggle")]
	[InlineData("function:lights:on", "lights", "on")]
	[InlineData(" FUNCTION:Gear:OFF ", "gear", "off")]
	public void Parse_function(string ctx, string id, string mode) =>
		Assert.Equal(new FunctionOrder(id, mode), ContextParser.Parse(ctx));

	[Fact]
	public void Parse_action() =>
		Assert.Equal(new ActionOrder("v_lights_toggle"), ContextParser.Parse("action:v_lights_toggle"));

	[Fact]
	public void Parse_say() => Assert.Equal(new SayOrder("hydrogen"), ContextParser.Parse("say:hydrogen"));

	[Theory]
	[InlineData(null)]
	[InlineData("")]
	[InlineData("function:")]
	[InlineData("function:gear:maybe")]
	[InlineData("xyz")]
	[InlineData("action:")]
	[InlineData("say:")]
	public void Parse_invalid_is_null(string? ctx) => Assert.Null(ContextParser.Parse(ctx));
}
