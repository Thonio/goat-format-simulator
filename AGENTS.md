# Project context for AI agents

## What this is

A single-player **Yu-Gi-Oh! Goat Format (April 2005)** simulator that ships as a
single self-contained HTML file. No server, no install: download, double-click,
play. It runs the real **ocgcore** rules engine (EDOPro/Project Ignis) compiled
to WebAssembly in `MODE_GOAT`, so 2005 rulings are engine-driven, not hand-written.

- Full rules engine in wasm, 1,685 legal cards, 1,364 bundled Lua card scripts.
- 20 tournament decks, deck builder (YDK import/export), 4 bot difficulties.
- English + Spanish, mobile-friendly. Only card artwork is fetched from the
  network (ygoprodeck); offline fallback tiles exist.

## The single most important rule

**`goat-simulador.html` and `deckbuilder.html` are GENERATED files. NEVER edit
them by hand.** Edit the sources under `engine/`, rebuild, then sync the output
to the root. The root copies are the deployed/served files and are committed.

## How to build

There is **no `engine/rebuild.sh`** despite the README mentioning one. Real flow:

```bash
cd engine/browser
node build-scripts.mjs ../data/goat-pool.json   # bundles Lua scripts → out/scripts.bundle.js
node build-html.mjs                             # → out/goat.html
node bundle.mjs                                 # only if vendor/ wasm changed → ocgcore.bundle.js
```

Deck builder:

```bash
cd engine/deckbuilder
node build.mjs                                  # → deckbuilder.html (in that folder)
```

Sync the generated files to the root (the deployable copies):

```bash
cp engine/browser/out/goat.html goat-simulador.html
cp engine/deckbuilder/deckbuilder.html deckbuilder.html
```

Note: `build-scripts.mjs` reads Lua scripts from a `CardScripts-master/` checkout
next to the repo (not committed). The bundled `out/scripts.bundle.js` is committed,
so you only need that checkout to regenerate the bundle.

## Architecture

```
ocgcore (wasm)  →  src/duel.mjs (adapter)  →  generic events  →  view.js (UI)
                                                          →  ai/ (bots)
```

- `src/duel.mjs` — THE ADAPTER. Translates ocgcore messages into generic events
  (`move`, `summon`, `chain`, `attack`, `damage`, `phase`). The UI never mentions
  ocgcore; a different engine could be swapped in with a new adapter.
- `src/view.js` — board, animations, drag & drop, phase/damage-step display.
- `src/main.js` — orchestrator: menus, decisions, log download, boot.
- `src/i18n.js` — English/Spanish. Loaded FIRST in the bundle; leaves `__T` global.
- `src/ai/` — `knowledge.js` (game facts) · `view.js` (engine-event view) ·
  `evaluar.js` (position eval) · `brain.js` (one clean heuristic brain).
- `src/autopilot.mjs` / `src/trivial.js` — scripted/trivial play helpers for tests.

### How the single HTML is assembled (`build-html.mjs`)

Every source module goes into its own IIFE scope (minified one-letter
identifiers would collide otherwise); `export`s are stripped, cross-module
`import`s removed from the AI files (they are concatenated in dependency order:
knowledge → view → evaluar → brain). The wasm core's trailing `export{...}`
is turned into a `return {...}`. Card/name/deck/mazo/avatar data are inlined as
JSON. `build-html.mjs:44-47` contains a comment about a historical trap: deck
data must be read from `../data/mazos.json` (canonical), not `out/`.

## Language conventions

- Code comments are in **Spanish** (project idiom). Keep them that way.
- `README.md`, `CONTRIBUTING.md`, issues are in **English**.
- Card names/keys stay in their canonical form (passcodes as numbers).

## Testing

No browser in CI — the suite runs the **real built HTML** against a small DOM
stub (`domstub.mjs`). Every check exists because a bug got through without it.
Run from `engine/browser/`:

```bash
node jugar.mjs          # plays a game as a human would: the most important one
node check-dom.mjs      # elements exist in real HTML, no orphan ids
node check-sync.mjs     # our state mirror matches the engine (6 games)
node check-reglas.mjs   # 2005 rule switches are on, and behave
node check-cartas.mjs   # 17 rulings on 10 specific cards
node torneo.mjs 250     # difficulty ladder is still a ladder
node escenario.mjs      # build any board state and ask the ENGINE what happens
```

Other scripts: `medir-lastres.mjs` (measure each bot flaw's value), `torneo.mjs`
(level vs level tournaments), `duelo-versiones.mjs` (new brain vs previous),
`analizar.mjs` (statistics over many games), `check-*.mjs` (~25 more targeted checks).

### AI work must be measured

If you touch the bots, measure before and after: `torneo.mjs` with **at least
250 games per pairing** (at 60 games noise is ±13 points — meaningless). The
ladder is: one clean brain + specific measurable flaws (`sinCadenas`,
`cadenaTonta`, `objetivoTonto`, `combateTonto`, `malaSeleccion`, `error`) chosen
because they actually cost games, per the table in README.

## Directory map

```
engine/
  browser/            simulator: sources (src/), build scripts, ~35 test scripts, out/
  data/               card DB, pool, copy limits, banlist, decks (mazos.json), avatars
  deckbuilder/        app.js, build.mjs, plantilla.html, estilo.css, deckbuilder.html
  vendor/             NOT committed — ocgcore-wasm dist goes here (bundle.mjs needs it)
mazos/                20 .ydk tournament deck files (source for data/mazos.json data)
docs/                 decklist format, publishing, reddit post notes
```

## Gotchas / things that have bitten before

- **Two HTML files are generated** — see top rule. A fix to `data/mazos.json`
  once silently never reached the HTML because the build read a stale copy.
- `build-html.mjs` imports AI modules via string concatenation; reorder the
  `juntarIA()` list if you add imports between AI files.
- The engine cannot clone/serialise a duel: **no forward search / MCTS**, bots
  are heuristic by necessity (same as Master Duel's AI).
- ~10% of bot-vs-bot games hit the 60-turn cap (Goat mirrors grind).
- No multiplayer. Single-player client vs bots by design.

## License

AGPL-3.0 (inherited from ocgcore + CardScripts). Card names/text/art belong to
Konami; nothing is sold. See LICENSE.
