# Goat Format Simulator

A playable Yu-Gi-Oh! **Goat Format** (April 2005) simulator built with
React + TypeScript + Vite. The rules are not hand-written: the app runs
**ocgcore**, the same rules engine EDOPro uses, compiled to WebAssembly and
started in `MODE_GOAT`, so 2005-era rulings — SEGOC, the six damage-step
timings, ignition priority, attack replays, one Field Spell for both players —
behave the way they did back then.

This is a React/TypeScript port of the original single-HTML-file project,
which is kept for reference under [`legacy/`](legacy/) (see below).

---

## Repo layout

**Entry points**

| Path | What it is |
|---|---|
| `index.html` | simulator HTML entry (Vite) |
| `deckbuilder.html` | deck builder HTML entry (Vite) |
| `src/main.tsx` | entry point for the simulator (`index.html`) |
| `src/deckbuilder-main.tsx` | entry point for the deck builder (`deckbuilder.html`) |
| `src/App.tsx` | simulator root: menu/boot/play screen switch, engine bootstrap |

**`src/engine/`** — game rules, ported from the original `engine/browser/src`

| Path | What it is |
|---|---|
| `duel.ts` | **the adapter** — wraps ocgcore, emits generic events (`move`, `summon`, `chain`, `attack`, `damage`, `phase`...) |
| `autopilot.ts` | drives a duel programmatically (used by bots/tests) |
| `trivial.ts` | auto-resolves trivial forced decisions |
| `ai/brain.ts` | bot logic — one "clean" brain; lower difficulties are the same brain with specific, measurable flaws |
| `ai/knowledge.ts` | card/board knowledge the AI reasons over |
| `ai/evaluate.ts` | board/position evaluation heuristics |
| `ai/view.ts` | AI's read of the generic duel events |

**`src/game/`** — orchestrator, no DOM

| Path | What it is |
|---|---|
| `gameEngine.ts` | engine + adapter + AI orchestrator — port of the original `main.js`. Exposes raw state (not CSS), consumed by React through `useSyncExternalStore` |
| `useGameEngine.ts` | React hook wrapping `GameEngine` with `useSyncExternalStore` |

**`src/components/`** — UI

| Path | What it is |
|---|---|
| `simulator/Board.tsx`, `Card.tsx`, `DuelScreen.tsx`, `Hud.tsx`, `Modals.tsx`, `PromptPanel.tsx` | board, hand, HUD, prompts, modals |
| `simulator/menu/` | `Home`, `Play`, `Bots`, `Options` screens + saved config |
| `deckbuilder/DeckBuilderApp.tsx` | the deck builder UI |

**`src/` — rendering, i18n, data, misc**

| Path | What it is |
|---|---|
| `render/layout.ts` | board/card transform + position math (kept out of `gameEngine.ts` on purpose — see file header) |
| `i18n/i18n.ts` | English / Spanish strings |
| `hooks/useDrag.ts` | drag-and-drop for playing cards from hand |
| `styles/` | `global.css`, `deckbuilder.css` |
| `data/` | card database, legal pool (`goat-pool.json`), copy limits (`goat-limites.json`), decks (`mazos.json`), avatars, `pool_cards.json` / `pool_texts.json` |
| `vendor/` | `ocgcore.bundle.js` (wasm engine) + `scripts.bundle.js` (bundled Lua card scripts), cards/names subsets, cardback |
| `types/` | `cards.ts`, `ocgcore.ts` — shared TypeScript types |

**`tests/`**

| Path | What it is |
|---|---|
| `engine/` | `duel.test.ts`, `ai.test.ts`, `cards.test.ts`, `i18n.test.ts`, `rules.test.ts` |
| `game/gameEngine.test.ts` | orchestrator tests |
| `render/` | `App.test.tsx`, `DuelScreen.test.tsx` |
| `support/scenario.ts` | builds an exact board state (specific cards in field/hand/graveyard/deck), drives it with a script, and queries ocgcore directly — used to pin down rulings on specific card interactions |
| `setup.ts` | vitest/jsdom setup |

**Other top-level**

| Path | What it is |
|---|---|
| `legacy/` | the **original** project this was ported from: a self-contained, no-build vanilla-JS/HTML version. Kept as a reference and historical record — not built or run as part of this app. See [`legacy/README.md`](legacy/README.md) |
| `public/` | static assets served as-is (favicon) |

### Architecture

```
ocgcore (wasm)  →  duel.ts (adapter)  →  generic events  →  gameEngine.ts (orchestrator)
                                                          →  ai/brain.ts (bots)
                                                          →  React components (via useGameEngine)
```

`duel.ts` translates ocgcore's messages into generic events (`move`, `summon`,
`chain`, `attack`, `damage`, `phase`, ...). `gameEngine.ts` is the orchestrator
(no DOM) that drives the duel loop and exposes state; React components never
talk to ocgcore directly, only to `gameEngine.ts` through `useGameEngine`
(`useSyncExternalStore`). This mirrors the adapter/view split from the
original project (see `legacy/README.md`), now split across `engine/`, `game/`
and `components/` instead of `duel.mjs`/`main.js`/`view.js`.

The bots (`engine/ai/brain.ts`) are heuristic, not search-based — ocgcore
cannot clone or serialize a duel, so there is no forward simulation or MCTS.
There is a single "clean" brain; lower difficulties are the same brain with
specific, measurable flaws (see `legacy/README.md` for the methodology and
numbers behind the difficulty ladder, which the port preserves).

## Building and running

```bash
npm run dev       # vite dev server, both entry points (simulator + deck builder)
npm run build      # tsc -b && vite build -> dist/, two HTML entry points
npm run preview    # serve the production build locally
npm run lint       # oxlint
npm run test       # vitest (jsdom), runs tests/
```

Two independent Vite entry points mirror the original project's two
self-contained HTML files: `index.html` (simulator, `src/main.tsx`) and
`deckbuilder.html` (deck builder, `src/deckbuilder-main.tsx`) — see
`vite.config.ts`.

The engine bundles under `src/vendor/` (`ocgcore.bundle.js`,
`scripts.bundle.js`) are large (>1MB each) and are loaded lazily in the
background when the app mounts; see the comment in `src/App.tsx`.

## Known limits

- No forward search in the AI — ocgcore cannot serialize a duel state.
- Card art is fetched at runtime from ygoprodeck by passcode; offline, cards
  fall back to a name/ATK/DEF/level tile.
- Single-player only, against bots — no multiplayer.

## Licence

The rules engine (**ocgcore**) and the **CardScripts** are AGPL-3.0, so this
project is AGPL-3.0 too — see [LICENSE](LICENSE). Card names, text and
artwork are Konami's; nothing here is sold and no assets are redistributed
beyond the card database needed to run the engine.
