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

The project is distributed under the [Mozilla Public License 2.0](LICENSE).

By submitting a contribution (pull request, patch, code in an issue), you confirm that you wrote it or have the right
to submit it, and you agree that:

1. it is distributed under the Mozilla Public License 2.0, like the rest of the project;
2. the maintainer may also publish it, in later versions of the project, under another open source license (for
   example MIT), without asking you again.

Versions already published keep their license. If you do not agree with point 2, say so in your pull request before
it is merged.
