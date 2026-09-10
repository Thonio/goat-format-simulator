/* Smoke test: starts a real GameEngine (same data as
   tests/game/gameEngine.test.ts) and mounts <DuelScreen> on top, letting
   it advance a few autopilot-driven ticks. Doesn't check pixels, just
   that the React layer doesn't explode rendering real duels. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as X from '../../src/vendor/ocgcore.bundle.js'
import { scriptReader } from '../../src/vendor/scripts.bundle.js'
import { GameEngine } from '../../src/game/gameEngine'
import { DuelScreen } from '../../src/components/simulator/DuelScreen'
import type { CardsSubset, NamesSubset } from '../../src/types/cards'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const cardsRaw: CardsSubset = JSON.parse(readFileSync(here('../../src/vendor/cards.subset.json'), 'utf-8'))
const names: NamesSubset = JSON.parse(readFileSync(here('../../src/vendor/names.subset.json'), 'utf-8'))
const { deck, extra } = JSON.parse(readFileSync(here('../../src/vendor/deck.json'), 'utf-8')) as { deck: number[]; extra: number[] }

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

describe('DuelScreen', () => {
  afterEach(() => { vi.useRealTimers() })

  it('renderiza un duelo real varios ticks sin lanzar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const engine = new GameEngine()
    const bootPromise = engine.boot({
      X, scriptReader, cardsRaw, names, deck: [...deck], extra: [...extra],
      config: { chainMode: 'nunca' },
    })

    const { container } = render(<DuelScreen engine={engine} useImages={false} />)
    expect(container.querySelector('#grid')).toBeTruthy()

    for (let i = 0; i < 60 && !engine.getSnapshot().finished; i++) {
      await act(async () => { await vi.runAllTimersAsync() })
      if (engine.getSnapshot().finished) break
      act(() => { driveOneStep(engine) })
    }
    await act(async () => { await vi.runAllTimersAsync() })

    // there's still a real board, with real cards inside
    expect(container.querySelector('#grid')).toBeTruthy()
    expect(container.querySelectorAll('.card').length).toBeGreaterThan(0)

    await bootPromise
  }, 60_000)
})
