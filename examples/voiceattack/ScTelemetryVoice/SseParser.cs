// SPDX-License-Identifier: MPL-2.0
using System.Text;

namespace ScTelemetryVoice;

/// <summary>Découpe un flux Server-Sent Events ligne par ligne (spécification WHATWG, sans id ni retry).</summary>
public sealed class SseParser
{
	private string _event = "";
	private readonly StringBuilder _data = new();
	private bool _hasData;

	/// <summary>Donne une ligne (sans fin de ligne) ; renvoie l'événement complet quand la ligne est vide.</summary>
	public IEnumerable<(string Event, string Data)> Feed(string line)
	{
		if (line.Length == 0)
		{
			if (!_hasData) { _event = ""; return []; }
			var ev = (_event.Length == 0 ? "message" : _event, _data.ToString());
			_event = "";
			_data.Clear();
			_hasData = false;
			return [ev];
		}
		if (line[0] == ':') return [];
		var colon = line.IndexOf(':');
		var field = colon < 0 ? line : line[..colon];
		var value = colon < 0 ? "" : line[(colon + 1)..];
		if (value.StartsWith(' ')) value = value[1..];
		switch (field)
		{
			case "event":
				_event = value;
				break;
			case "data":
				if (_hasData) _data.Append('\n');
				_data.Append(value);
				_hasData = true;
				break;
		}
		return [];
	}
}
