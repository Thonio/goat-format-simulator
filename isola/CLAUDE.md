# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A playable Yu-Gi-Oh! Goat Format (April 2005) simulator that ships as a single
self-contained HTML file (`goat-simulador.html`), plus a companion deck builder
(`deckbuilder.html`). No server, no build step for the end user — both are static
files. The rules engine is **ocgcore** (Project Ignis / EDOPro's engine, the same
one EDOPro uses) compiled to WebAssembly and run in `MODE_GOAT`, so 2005-era
rulings (SEGOC, damage-step timings, ignition priority, attack replays, one Field
Spell for both players) come from the real engine, not hand-coded logic.

**The two root HTML files are generated — never hand-edit them.** Edit the
sources under `engine/` and rebuild (see Building below).

## Repo layout

```
engine/
  data/          card database, legal pool (goat-pool.json), copy limits
                 (goat-limites.json), decks (mazos.json), avatars, the
                 official GOAT.lflist.conf banlist
  browser/       the simulator: source, build scripts, and the test suite
    src/duel.mjs        THE ADAPTER — translates ocgcore into generic events
    src/view.js         board rendering, animations, drag/drop
    src/main.js         orchestrator: menus, decisions, log
    src/i18n.js         English / Spanish strings
    src/ai/             brain.js (bot logic), knowledge.js, evaluar.js, view.js
    src/autopilot.mjs   drives a duel programmatically (used by bots/tests)
    src/trivial.js      auto-resolves trivial forced decisions
    src/template.html   HTML shell the build inlines everything into
    build-scripts.mjs   bundles the ~1,364 Lua card scripts into out/scripts.bundle.js
    build-html.mjs      assembles out/goat.html from src/ + out/ + engine/data/
    check-*.mjs         the test suite (see Testing)
    analizar.mjs        scans many games and reports statistics
    torneo.mjs          level-vs-level bot tournaments
    duelo-versiones.mjs pits the current AI brain against a previous version
    medir-lastres.mjs   measures the win-rate cost of each bot "flaw"
    escenario.mjs       builds an exact board state to test specific rulings
    out/                build artifacts (ocgcore.bundle.js, scripts.bundle.js,
                         cards.subset.json, names.subset.json, deck.json, goat.html)
  deckbuilder/   the deck builder app (app.js, build.mjs, check-builder.mjs)
mazos/           example .ydk decklists (also see docs/FORMATO-DECKLISTS.md)
docs/            contributor-facing docs (decklist format, publishing, Reddit post)
```

## Architecture

```
ocgcore (wasm)  →  duel.mjs (adapter)  →  generic events  →  view.js (interface)
                                                            →  ai/brain.js (bots)
```

`duel.mjs` is the important piece: it translates ocgcore's messages into
generic events (`move`, `summon`, `chain`, `attack`, `damage`, `phase`, ...).
**The view layer (`view.js`, `main.js`) never references ocgcore directly** —
it only consumes these generic events, and so does the AI. This separation is
intentional; a different card game could reuse `view.js`/`main.js` by writing
a different adapter that emits the same event shapes.

The bots (`ai/brain.js`) are heuristic, not search-based — ocgcore cannot
clone/serialize a duel, so there is no forward simulation or MCTS. There is a
single "clean" brain; lower difficulties are the same brain with specific,
measurable flaws (e.g. `sinCadenas` never responds during your turn,
`objetivoTonto` picks attack targets at random). Flaw strength is measured
empirically with `medir-lastres.mjs`, not asserted — see README.md for the
current numbers. Any AI change should be measured before/after with
`torneo.mjs` (≥250 games per pairing) or `duelo-versiones.mjs`; at 60 games
noise is ±13 points.

`escenario.mjs` builds an exact board state (specific cards in field/hand/
graveyard/deck) and drives the duel with a script, then queries **ocgcore
directly** (`duelQueryLocation`) rather than the app's own state mirror. Use
it to pin down how the engine actually rules a specific card interaction.

Card lookups by name in test/tooling code must be pool-aware: many cards
exist in the underlying database under two codes (a normal version and a
"(GOAT)"/"(Pre-Errata)" version), and only the pool version carries the Lua
script bundled for Goat. See the comment in `escenario.mjs` around `PORNOMBRE`.

## Building

From `engine/browser/`:

```bash
node build-scripts.mjs ../data/goat-pool.json   # bundles the Lua card scripts → out/scripts.bundle.js
node build-html.mjs                             # assembles out/goat.html
```

`build-html.mjs` reads from `out/` and `src/`, and pulls decks/avatars from
`engine/data/` directly (not from copies in `out/`) so that editing
`engine/data/mazos.json` is reflected without a separate sync step.

Rebuilding the Lua bundle needs a local copy of
[ProjectIgnis/CardScripts](https://github.com/ProjectIgnis/CardScripts) next
to the project; the bundled `out/scripts.bundle.js` output is committed, so
this is only needed when card scripts themselves change.

The deck builder has its own build (`engine/deckbuilder/build.mjs`), which
assembles `deckbuilder.html` from `app.js`, the Goat pool/limits data, and the
shared `i18n.js`.

## Testing

There is no browser in CI: the suite runs the **real built HTML** (`out/goat.html`)
against a minimal DOM stub (`domstub.mjs`), so a check only passes if the actual
shipped file works, not a simulated approximation of it. Run individual checks
directly with node from `engine/browser/`, e.g.:

```bash
node jugar.mjs          # plays a full game as a human would — the most important check
node check-dom.mjs      # every id the JS references exists in the real HTML
node check-sync.mjs     # the app's state mirror matches the engine, across 6 games
node check-reglas.mjs   # the 2005 rule switches are on and behave correctly
node check-cartas.mjs   # specific rulings on specific cards
node torneo.mjs 250     # the bot difficulty ladder still behaves like a ladder
```

Every `check-*.mjs` file targets a bug that once got through without it —
when fixing a bug, add or extend a check rather than only fixing the symptom.
The deck builder has its own equivalent, `engine/deckbuilder/check-builder.mjs`,
which runs the built `deckbuilder.html`'s own logic under a DOM stub.

## Decklists

`.ydk` (passcodes) is the preferred decklist format; a plain-text `3x Card
Name` format is also accepted using official English card names. See
`docs/FORMATO-DECKLISTS.md` for details. Decks used by the app/tests live in
`engine/data/mazos.json`, with example `.ydk` files in `mazos/`.

## Known limits

- No forward search in the AI — ocgcore cannot serialize a duel state.
- Card art is fetched at runtime from ygoprodeck by passcode; offline, cards
  fall back to a name/ATK/DEF/level tile.
- Single-player only, against bots — no multiplayer.
