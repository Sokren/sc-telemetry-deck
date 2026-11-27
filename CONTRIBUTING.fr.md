# Contribuer à SC Telemetry Deck

**EN** [English](CONTRIBUTING.md) · 🇫🇷 **Français**

Merci de votre intérêt ! Signalements, idées et pull requests sont les bienvenus.

## Avant de commencer

- **Bugs et idées** : ouvrez d'abord une issue. Indiquez le canal et le build du jeu (LIVE / PTU, numéro de build
  visible sur la première ligne de la console de l'appli web) et la version de SC Telemetry Deck.
- **Gros changements** : parlez-en dans une issue avant d'écrire du code, pour que votre travail aille dans le sens du
  projet.
- Le projet utilise uniquement l'**API de télémétrie locale** du jeu. Une contribution qui lit la mémoire du jeu ou
  modifie ses fichiers ne sera pas acceptée.

## Pull requests

- Code en TypeScript (strict). Identifiants en anglais ; tout texte visible en **français et en anglais**.
- `npm test`, `npm run build`, `npm run build:web` et `streamdeck validate com.sokren.sc-telemetry.sdPlugin` doivent
  passer. Ajoutez des tests pour ce que vous changez.
- Le plugin Stream Deck doit continuer à marcher : un changement pour l'appli web ne doit pas le casser.
- Un sujet par pull request, avec une courte description de ce qui change et de la façon dont vous l'avez testé (en jeu
  ou non).

## Licence des contributions

Le projet est distribué sous la [Mozilla Public License 2.0](LICENSE) ; les exemples de `examples/` sont sous licence
MIT.

En proposant une contribution (pull request, correctif, code dans une issue), vous confirmez que vous l'avez écrite ou
que vous avez le droit de la proposer, et vous acceptez qu'elle soit distribuée sous la licence des fichiers qu'elle
modifie (MPL 2.0, ou MIT dans `examples/`).

Si le mainteneur souhaite un jour publier le projet sous une autre licence open source, il vous demandera votre accord
explicite pour toute contribution importante, dans sa pull request ou plus tard. Sans cet accord, votre contribution
reste sous sa licence d'origine. Les versions déjà publiées gardent toujours leur licence.

## Forks

Un fichier repris de ce projet garde son en-tête de licence (MPL 2.0 §3.4). Les fichiers neufs de votre fork sont à
vous : ce projet ne leur impose ni en-tête, ni contrôle, ni licence.
