// @vitest-environment node
/* Smoke test: a full duel driven entirely through GameEngine's public
   API (without touching duel.mjs directly, unlike jugar.mjs/duel.test.ts).
   Confirms the ask()→state→response bridge works end to end, including
   pause/resume for the human side. Uses simulated timers because drain()
   uses real sleep(ms) for animation pacing (~dozens of times per turn). */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as X from '../../src/vendor/ocgcore.bundle.js'
import { scriptReader } from '../../src/vendor/scripts.bundle.js'
import { GameEngine } from '../../src/game/gameEngine'
import type { CardsSubset, NamesSubset } from '../../src/types/cards'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const cardsRaw: CardsSubset = JSON.parse(readFileSync(here('../../src/vendor/cards.subset.json'), 'utf-8'))
const names: NamesSubset = JSON.parse(readFileSync(here('../../src/vendor/names.subset.json'), 'utf-8'))
const { deck, extra } = JSON.parse(readFileSync(here('../../src/vendor/deck.json'), 'utf-8')) as { deck: number[]; extra: number[] }

/** Takes the simplest action available for whatever is pending on the
 *  human side — the goal is to reach `finished`, not to play well (same
 *  as what autopilot.mjs does with duel.mjs directly, but here going
 *  through GameEngine's public API: dropCard/clickIdleCard/declareAttack/
 *  toggleSelectCard/… instead of raw duel.respond). */
function driveOneStep(engine: GameEngine): void {
  const s = engine.getSnapshot()
  if (s.finished) return
  if (s.confirm) return engine.resolveConfirm(false)
  if (s.choiceMenu) return void s.choiceMenu.options[0]?.run()
  if (s.selectCards) {
    const sc = s.selectCards
    if (!sc.multi) return engine.toggleSelectCard(0)
    for (let i = sc.chosen.length; i < sc.min && i < sc.list.length; i++) engine.toggleSelectCard(i)
    if (engine.getSnapshot().selectCards) engine.confirmSelectCards()
    return
  }
  if (s.announceCard) return engine.chooseAnnouncedCard(s.announceCard.candidates[0])
  if (s.idle) return void (s.idle.toBattlePhase ? engine.advancePhase() : engine.endTurn())
  if (s.battle) return void (s.battle.toMainPhase2 ? engine.advancePhase() : engine.endTurn())
  if (s.panel?.options.length) return void s.panel.options[s.panel.options.length - 1].run()
}

describe('GameEngine', () => {
  afterEach(() => { vi.useRealTimers() })

  it('un duelo completo, guiado por la API pública, llega a finished', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const engine = new GameEngine()
    const bootPromise = engine.boot({
      X, scriptReader, cardsRaw, names, deck: [...deck], extra: [...extra],
      config: { chainMode: 'nunca' },
    })
    for (let i = 0; i < 4000 && !engine.getSnapshot().finished; i++) {
      await vi.runAllTimersAsync()
      if (engine.getSnapshot().finished) break
      driveOneStep(engine)
    }
    await vi.runAllTimersAsync()
    expect(engine.getSnapshot().finished).toBe(true)
    expect(engine.getSnapshot().result).not.toBeNull()
    await bootPromise
  }, 60_000)

  it('una decisión del lado humano pausa loop() hasta que se responde', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const engine = new GameEngine()
    const bootPromise = engine.boot({ X, scriptReader, cardsRaw, names, deck: [...deck], extra: [...extra], config: { chainMode: 'nunca' } })

    let sawPending = false
    let confirmedStable = false
    for (let i = 0; i < 4000 && !engine.getSnapshot().finished; i++) {
      await vi.runAllTimersAsync()
      const s = engine.getSnapshot()
      if (s.finished) break
      if (!confirmedStable && (s.idle || s.battle || s.panel)) {
        sawPending = true
        // with no action taken, one more turn of "time" must NOT produce a
        // single commit(): getSnapshot() has to return the SAME reference.
        // This is the proof that the loop is actually stopped, not just
        // finishing quickly by coincidence.
        const before = engine.getSnapshot()
        await vi.runAllTimersAsync()
        expect(engine.getSnapshot()).toBe(before)
        confirmedStable = true
      }
      driveOneStep(engine)
    }
    await vi.runAllTimersAsync()
    expect(sawPending).toBe(true)
    expect(confirmedStable).toBe(true)
    expect(engine.getSnapshot().finished).toBe(true)
    await bootPromise
  }, 60_000)
})
