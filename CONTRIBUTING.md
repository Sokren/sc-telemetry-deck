# Contributing to SC Telemetry Deck

**EN** English · 🇫🇷 [Français](CONTRIBUTING.fr.md)

Thanks for your interest! Bug reports, ideas and pull requests are welcome.

## Before you start

- **Bugs and ideas**: open an issue first. Say which game channel and build you play on (LIVE / PTU, build number from
  the first line of the web app's console) and which version of SC Telemetry Deck.
- **Big changes**: discuss them in an issue before writing code, so your work fits the project's direction.
- The project only uses the game's **local telemetry API**. Contributions that read the game's memory or modify its
  files will not be accepted.

## Pull requests

- Code in TypeScript (strict). Identifiers in English; every visible text in **French and English**.
- `npm test`, `npm run build`, `npm run build:web` and `streamdeck validate com.sokren.sc-telemetry.sdPlugin` must
  pass. Add tests for what you change.
- The Stream Deck plugin must keep working: a change for the web app must not break it.
- One topic per pull request, with a short description of what changes and how you tested it (in game or not).

## License of contributions

The project is distributed under the [Mozilla Public License 2.0](LICENSE); the examples in `examples/` are under the
MIT License.

By submitting a contribution (pull request, patch, code in an issue), you confirm that you wrote it or have the right
to submit it, and you agree that it is distributed under the license of the files it changes (MPL 2.0, or MIT in
`examples/`).

If the maintainer ever wishes to publish the project under another open source license, they will ask for your
explicit agreement for any substantial contribution, in its pull request or later. Without that agreement, your
contribution stays under its original license. Versions already published always keep their license.

## Forks

A file taken from this project keeps its license header (MPL 2.0 §3.4). The new files of your fork are yours: no
header, check or license is imposed on them by this project.
