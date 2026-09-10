// @vitest-environment node
/* Verifies that the state mirror ALWAYS matches the core's own.
   A one-slot drift used to make you play a different card than the
   one you dragged (the Chaos Sorcerer bug). Port of check-sync.mjs. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as X from '../../src/vendor/ocgcore.bundle.js'
import { scriptReader } from '../../src/vendor/scripts.bundle.js'
import { GoatDuel } from '../../src/engine/duel'
import { makeAutoPlayer } from '../../src/engine/autopilot'
import { makeTrivialResolver } from '../../src/engine/trivial'
import { buildCardDb, type CardsSubset, type NamesSubset } from '../../src/types/cards'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const raw: CardsSubset = JSON.parse(readFileSync(here('../../src/vendor/cards.subset.json'), 'utf-8'))
const names: NamesSubset = JSON.parse(readFileSync(here('../../src/vendor/names.subset.json'), 'utf-8'))
const { deck, extra } = JSON.parse(readFileSync(here('../../src/vendor/deck.json'), 'utf-8')) as { deck: number[]; extra: number[] }
const cardDb = buildCardDb(raw)
const nm = (c: number) => names[c]?.name ?? '#' + c

const T = X.OcgMessageType
const LISTS = ['summons', 'special_summons', 'monster_sets', 'spell_sets', 'activates', 'pos_changes', 'attacks'] as const

describe('sincronía motor ↔ interfaz (GoatDuel mirror vs ocgcore)', () => {
  it('el espejo local coincide con el core en 6 partidas jugadas por el piloto automático', async () => {
    const failures: string[] = []
    let checks = 0, games = 0, totalTurns = 0

    for (let p = 0; p < 6; p++) {
      const lib = await X.default({ sync: true })
      const duel = new GoatDuel({ lib, X, cardDb, scriptReader, onEvent: () => {} })
      const shuffle = (a: number[]) => {
        const b = [...a]
        for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[b[i], b[j]] = [b[j], b[i]] }
        return b
      }
      await duel.create({
        deck0: shuffle(deck), deck1: shuffle(deck), extra0: extra, extra1: extra,
        seed: [BigInt(1000 + p * 97), 7n, 13n, 29n],
      })
      const ai = makeAutoPlayer(X), tr = makeTrivialResolver(X)
      let last: unknown = null, att = 0
      for (let step = 0; step < 8000; step++) {
        const q = await duel.run()
        if (duel.finished || !q) break
        // CHECK: every card the core offers must exist in our mirror,
        // at the position it says and with the same code
        if (q.type === T.SELECT_IDLECMD || q.type === T.SELECT_BATTLECMD) {
          for (const k of LISTS) {
            for (const l of ((q[k] as Array<{ code: number; controller: number; location: number; sequence: number }> | undefined) ?? [])) {
              checks++
              const direct = duel.at(l.controller, l.location, l.sequence)
              if (!direct || direct.code !== l.code) {
                failures.push(`game ${p} · ${k}: the core says ${nm(l.code)} at `
                  + `zone ${l.location}[${l.sequence}] and the mirror had `
                  + (direct ? nm(direct.code) : 'nothing'))
              }
            }
          }
        }
        if (q !== last) { last = q; att = 0 }
        const r = tr(q) ?? ai(q, att++)
        if (!r) break
        duel.respond(r)
        if (duel.turnCount > 26) break
      }
      games++
      totalTurns += duel.turnCount
    }

    expect(games).toBe(6)
    expect(checks).toBeGreaterThan(0)
    expect(failures, failures.slice(0, 8).join('\n')).toEqual([])
    expect(totalTurns).toBeGreaterThan(0)
  }, 60_000)
})
