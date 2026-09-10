// @vitest-environment node
/* Port of the logic-testable intent of check-ai.mjs ("the AI must be
   alive") and check-bots.mjs's two behavioral (non-UI) assertions. The
   originals mostly regex-scrape the built goat.html for menu/CSS wiring
   (bot-mode screen, chain-mode button cycling, mobile breakpoints, medal
   CSS...) — none of that exists yet in the React port, so it isn't ported
   here; it belongs in the UI-port phase. What IS ported: that the brain
   actually drives a real duel to completion (check-ai.mjs's stated
   purpose), and the "never chain into your own card" rule check-bots.mjs
   asserted by regexing the source — tested here as real behavior instead. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as X from '../../src/vendor/ocgcore.bundle.js'
import { scriptReader } from '../../src/vendor/scripts.bundle.js'
import { GoatDuel, LOC } from '../../src/engine/duel'
import { makeTrivialResolver } from '../../src/engine/trivial'
import { createBrain } from '../../src/engine/ai/brain'
import { buildCardDb, type CardsSubset, type NamesSubset } from '../../src/types/cards'
import type { OcgMessage } from '../../src/types/ocgcore'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const raw: CardsSubset = JSON.parse(readFileSync(here('../../src/vendor/cards.subset.json'), 'utf-8'))
const names: NamesSubset = JSON.parse(readFileSync(here('../../src/vendor/names.subset.json'), 'utf-8'))
const { deck, extra } = JSON.parse(readFileSync(here('../../src/vendor/deck.json'), 'utf-8')) as { deck: number[]; extra: number[] }
const cardDb = buildCardDb(raw)

describe('la IA está viva', () => {
  it('createBrain juega una partida completa (ambos lados) sin lanzar y avanza turnos', async () => {
    const lib = await X.default({ sync: true })
    const duel = new GoatDuel({ lib, X, cardDb, scriptReader, onEvent: () => {} })
    await duel.create({ deck0: [...deck], deck1: [...deck], extra0: extra, extra1: extra, seed: [42n, 7n, 13n, 29n] })
    const trivial = makeTrivialResolver(X)
    const brain0 = createBrain({ X, duel, db: cardDb, names, level: 'experto', me: 0 })
    const brain1 = createBrain({ X, duel, db: cardDb, names, level: 'experto', me: 1 })

    let last: OcgMessage | null = null, att = 0
    for (let step = 0; step < 4000; step++) {
      const q = await duel.run()
      if (duel.finished || !q) break
      if (q !== last) { last = q; att = 0 }
      const player = (q.player as number | undefined) ?? duel.turnPlayer
      const brain = player === 0 ? brain0 : brain1
      const r = trivial(q) ?? brain(q, att++)
      if (!r) break
      duel.respond(r)
      if (duel.turnCount > 40) break
    }

    expect(duel.turnCount).toBeGreaterThan(0)
  }, 60_000)
})

describe('la IA no se encadena a su propia carta', () => {
  it('cadena() rechaza responder cuando el eslabón de arriba es del propio bot', () => {
    const T = X.OcgMessageType
    const emptySide = () => ({
      [LOC.DECK]: [], [LOC.HAND]: [], [LOC.GRAVE]: [], [LOC.REMOVED]: [],
      [LOC.EXTRA]: [], [LOC.MZONE]: new Array(5).fill(null),
      [LOC.SZONE]: new Array(6).fill(null), [LOC.FZONE]: new Array(1).fill(null),
    })
    const fakeDuel = {
      zones: { 0: emptySide(), 1: emptySide() },
      lp: { 0: 8000, 1: 8000 },
      turnPlayer: 0,
      turnCount: 3,
      phase: 8,
      chainLinks: [{ code: 41420027 /* Trap Dustshoot */, controller: 1, uid: 999 }],
      resolve: () => null,
    }
    const brain = createBrain({ X, duel: fakeDuel as unknown as GoatDuel, db: cardDb, names, level: 'experto', me: 1 })
    const m = {
      type: T.SELECT_CHAIN, forced: false,
      selects: [{ code: 41420027, controller: 1, location: LOC.SZONE, sequence: 0 }],
    }
    const r = brain(m, 0)
    expect(r).toEqual({ type: X.OcgResponseType.SELECT_CHAIN, index: null })
  })
})
