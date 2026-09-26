/* The difficulty ids, chain-mode ids and the "opponent deck" sentinel ids
   were renamed from Spanish to English. They are persisted in
   `goatConfig` and used as keys in `goatProgreso`, so a browser that
   already has the old values stored would otherwise silently fall back to
   the defaults and lose the player's settings and bot-mode progress.
   These cover the mapping in src/components/simulator/menu/config.ts. */
import { beforeEach, describe, expect, it } from 'vitest'
import { loadConfig, progress } from '../../src/components/simulator/menu/config'

describe('legacy localStorage migration', () => {
  beforeEach(() => localStorage.clear())

  it('maps a pre-rename Spanish config forward', () => {
    localStorage.setItem('goatConfig', JSON.stringify({
      level: 'experto', chainMode: 'nunca', chainTimeout: 30,
      deck: 'i3', opponentDeck: '__azar__', avatar: 'roland', language: 'es',
    }))
    const cfg = loadConfig()
    expect(cfg.level).toBe('expert')
    expect(cfg.chainMode).toBe('never')
    expect(cfg.opponentDeck).toBe('__random__')
    // untouched fields survive
    expect(cfg.chainTimeout).toBe(30)
    expect(cfg.deck).toBe('i3')
    expect(cfg.avatar).toBe('roland')
  })

  it('maps every legacy difficulty', () => {
    for (const [oldLvl, newLvl] of [['novato', 'rookie'], ['duro', 'tough'], ['experto', 'expert']] as const) {
      localStorage.setItem('goatConfig', JSON.stringify({ level: oldLvl }))
      expect(loadConfig().level).toBe(newLvl)
    }
  })

  it('keeps already-English values', () => {
    localStorage.setItem('goatConfig', JSON.stringify({ level: 'tough', chainMode: 'always', opponentDeck: '__same__' }))
    expect(loadConfig()).toMatchObject({ level: 'tough', chainMode: 'always', opponentDeck: '__same__' })
  })

  it('falls back to the defaults on unrecognised values', () => {
    localStorage.setItem('goatConfig', JSON.stringify({ level: 'nonsense', chainMode: 'nonsense' }))
    expect(loadConfig()).toMatchObject({ level: 'tough', chainMode: 'auto' })
  })

  it('defaults when nothing is stored', () => {
    expect(loadConfig()).toMatchObject({ level: 'tough', chainMode: 'auto', opponentDeck: '__random__' })
  })

  it('migrates legacy progress keys', () => {
    localStorage.setItem('goatProgreso', JSON.stringify({ i0: { duro: true, novato: true }, i1: { experto: true } }))
    expect(progress()).toEqual({ i0: { tough: true, rookie: true }, i1: { expert: true } })
  })

  it('leaves English progress keys alone', () => {
    localStorage.setItem('goatProgreso', JSON.stringify({ i0: { tough: true, expert: true } }))
    expect(progress()).toEqual({ i0: { tough: true, expert: true } })
  })
})
