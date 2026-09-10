// @vitest-environment node
/* ════════════════════════════════════════════════════════════════
   CARD BATTERY

   Hand-assembled scenarios to see what the engine does with specific
   cards. Each one answers a question that was open, or an interaction
   that, if it breaks, ruins an entire game.

   ALWAYS asks the engine (`duelQueryLocation`), never the mirror.
   Port of check-cartas.mjs.
   ════════════════════════════════════════════════════════════════ */
import { describe, expect, it } from 'vitest'
import { setUp, code, nameOf, X, P, T } from '../support/scenario'
import type { OcgMessage } from '../../src/types/ocgcore'

const R = X.OcgResponseType, IA = X.SelectIdleCMDAction, BA = X.SelectBattleCMDAction

/* ── shortcuts for writing scripts ── */
/* The database has two codes per card (normal and "(GOAT)"/"(Pre-Errata)")
   and the pool one is usually the second: when comparing names the
   parenthetical has to be stripped, or "Sangan" is never equal to
   "Sangan (GOAT)". */
const baseName = (n: string) => String(n).replace(/\s*\((GOAT|Pre-Errata|Anime)\)\s*$/i, '').trim()
const has = (list: Array<{ name: string }>, name: string) => list.some((c) => baseName(c.name) === name)
const idx = (list: Array<{ code: number }> | undefined, name: string) => (list ?? []).findIndex((a) => a.code === code(name))
const passIdle = (m: OcgMessage) => ({ type: R.SELECT_IDLECMD, action: m.to_ep ? IA.TO_EP : IA.TO_BP, index: null })
const toBattle = (m: OcgMessage) => ({ type: R.SELECT_IDLECMD, action: m.to_bp ? IA.TO_BP : IA.TO_EP, index: null })
const passBattle = (m: OcgMessage) => ({ type: R.SELECT_BATTLECMD, action: m.to_ep ? BA.TO_EP : BA.TO_M2, index: null })
const activate = (m: OcgMessage, name: string) => { const i = idx(m.activates as never, name); return i < 0 ? null : { type: R.SELECT_IDLECMD, action: IA.SELECT_ACTIVATE, index: i } }
const flip = (m: OcgMessage, name: string) => { const i = idx(m.pos_changes as never, name); return i < 0 ? null : { type: R.SELECT_IDLECMD, action: IA.SELECT_POS_CHANGE, index: i } }
const attackWith = (m: OcgMessage, name: string) => { const i = idx(m.attacks as never, name); return i < 0 ? null : { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: i } }
const choose = (_m: OcgMessage, i = 0) => ({ type: R.SELECT_CARD, indicies: [i] })

describe('cartas, una a una', () => {
  it('Magician of Faith deja elegir qué mágica recupera, y acaba en tu mano', async () => {
    const e = await setUp(
      { monsters: [{ card: 'Magician of Faith', pos: P.FACEDOWN_DEFENSE }], gy: ['Pot of Greed', 'Graceful Charity'] },
      {})
    let offered: string[] | null = null, flipped = false
    await e.run((m) => {
      /* We have to STOP as soon as it resolves: if the game is left to
         keep running, the hand-size discard takes the recovered card
         away and it looks like the effect didn't work. */
      if (m.type === T.SELECT_IDLECMD) {
        if (offered) return 'STOP'
        if (e.turnPlayer === 0 && !flipped) { const r = flip(m, 'Magician of Faith'); if (r) { flipped = true; return r } }
        return passIdle(m)
      }
      if (m.type === T.SELECT_CARD && flipped && !offered) {
        const selects = m.selects as Array<{ code: number }>
        offered = selects.map((s) => nameOf(s.code))
        return choose(m, Math.max(0, idx(selects, 'Pot of Greed')))
      }
      if (m.type === T.SELECT_BATTLECMD) return passBattle(m)
      return null
    }, 400)
    expect(offered).not.toBeNull()
    expect(offered!.length).toBe(2)
    expect(has(e.hand(0), 'Pot of Greed')).toBe(true)
  })

  it('Thousand-Eyes Restrict absorbe un monstruo tapado, y así se queda en 0 ATK', async () => {
    const e = await setUp(
      { monsters: [{ card: 'Thousand-Eyes Restrict', pos: P.FACEUP_ATTACK }] },
      { monsters: [{ card: 'Mystical Elf', pos: P.FACEDOWN_DEFENSE }, { card: 'Airknight Parshath', pos: P.FACEUP_ATTACK }] })
    let offered: string[] | null = null
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD) {
        const r = activate(m, 'Thousand-Eyes Restrict')
        if (r && !offered) return r
        return passIdle(m)
      }
      if (m.type === T.SELECT_CARD && !offered) {
        const selects = m.selects as Array<{ code: number; position?: number }>
        offered = selects.map((s) => `${nameOf(s.code)}${s.position && (s.position & 0x0a) ? ' (tapado)' : ''}`)
        const i = idx(selects, 'Mystical Elf') // deliberately the face-down one
        return choose(m, i < 0 ? 0 : i)
      }
      if (m.type === T.SELECT_BATTLECMD) return passBattle(m)
      return null
    }, 400)
    const ter = e.field(0).find((c) => baseName(c.name) === 'Thousand-Eyes Restrict')
    expect(offered).not.toBeNull()
    expect(offered!.some((o) => o.includes('(tapado)'))).toBe(true)
    expect(ter?.atk).toBe(0)
  })

  it('Trap Dustshoot ofrece los monstruos de la mano rival, y el elegido sale de la mano', async () => {
    const e = await setUp(
      { spellTrap: [{ card: 'Trap Dustshoot', pos: P.FACEDOWN_DEFENSE }] },
      { hand: ['Airknight Parshath', 'Sangan', 'Pot of Greed', 'Book of Moon'] })
    let seen: Array<{ name: string; zone: number }> | null = null
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD) return seen ? 'STOP' : passIdle(m)
      if (m.type === T.SELECT_CHAIN) {
        const i = idx(m.selects as never, 'Trap Dustshoot')
        if (i >= 0 && !seen) return { type: R.SELECT_CHAIN, index: i }
        return { type: R.SELECT_CHAIN, index: null }
      }
      if (m.type === T.SELECT_CARD && !seen) {
        const selects = m.selects as Array<{ code: number; location: number }>
        seen = selects.map((s) => ({ name: nameOf(s.code), zone: s.location }))
        return choose(m, 0)
      }
      if (m.type === T.SELECT_BATTLECMD) return passBattle(m)
      return null
    }, 500)
    expect(seen).not.toBeNull()
    expect(seen!.length).toBeGreaterThanOrEqual(1)
    expect(seen!.every((v) => v.zone === 2)).toBe(true)
    expect(has(e.hand(1), baseName(seen![0].name))).toBe(false)
  })

  it('Sangan destruido en combate busca en el Deck, y acaba en el cementerio', async () => {
    const e = await setUp(
      { monsters: [{ card: 'Sangan', pos: P.FACEUP_ATTACK }] },
      { monsters: [{ card: 'Airknight Parshath', pos: P.FACEUP_ATTACK }], deck: ['Mystical Elf'] })
    let searched: string[] | null = null, attacked = false
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD) return e.turnPlayer === 1 ? toBattle(m) : passIdle(m)
      if (m.type === T.SELECT_BATTLECMD) {
        if (!attacked) { const r = attackWith(m, 'Airknight Parshath'); if (r) { attacked = true; return r } }
        return passBattle(m)
      }
      if (m.type === T.SELECT_CARD && attacked && !searched && (m.selects as Array<{ location: number }>).every((s) => s.location === 1)) {
        searched = (m.selects as Array<{ code: number }>).map((s) => nameOf(s.code))
        return choose(m, 0)
      }
      return null
    }, 600)
    expect(attacked).toBe(true)
    expect(searched).not.toBeNull()
    expect(searched!.length).toBeGreaterThan(0)
    expect(has(e.gy(0), 'Sangan')).toBe(true)
  })

  it('Sinister Serpent se ofrece en tu Standby Phase, y vuelve a la mano', async () => {
    const e = await setUp({ gy: ['Sinister Serpent'] }, {})
    let offeredOnTurn: { turn: number; player: number; phase: number } | null = null
    await e.run((m) => {
      /* NOTE: it doesn't arrive as SELECT_CHAIN but as SELECT_EFFECTYN
         ("do you activate Sinister Serpent's effect?"). */
      if (m.type === T.SELECT_EFFECTYN && m.code === code('Sinister Serpent')) {
        if (offeredOnTurn === null) offeredOnTurn = { turn: e.turn, player: m.player as number, phase: e.phase }
        return { type: R.SELECT_EFFECTYN, yes: true }
      }
      if (m.type === T.SELECT_CHAIN) return { type: R.SELECT_CHAIN, index: null }
      if (m.type === T.SELECT_IDLECMD) return passIdle(m)
      if (m.type === T.SELECT_BATTLECMD) return passBattle(m)
      return null
    }, 600)
    expect(offeredOnTurn).not.toBeNull()
    expect(offeredOnTurn!.player).toBe(0)
    expect(offeredOnTurn!.phase).toBe(2)
    expect(has(e.hand(0), 'Sinister Serpent')).toBe(true)
  })

  it('Scapegoat deja cuatro fichas y bloquea tu invocación normal ese turno', async () => {
    const e = await setUp({ hand: ['Scapegoat', 'Airknight Parshath'] }, {})
    let activated = false, couldSummonAfter: boolean | null = null
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD) {
        if (!activated) { const r = activate(m, 'Scapegoat'); if (r) { activated = true; return r } }
        else if (couldSummonAfter === null && e.turnPlayer === 0) {
          couldSummonAfter = ((m.summons as unknown[] | undefined) ?? []).length > 0
          return 'STOP'
        }
        return passIdle(m)
      }
      return null
    }, 400)
    expect(e.field(0).length).toBe(4)
    expect(couldSummonAfter).toBe(false)
  })

  it('Snatch Steal pasa el monstruo a tu lado, y el rival cobra 1000 LP en su Standby', async () => {
    const e = await setUp({ hand: ['Snatch Steal'] }, { monsters: [{ card: 'Airknight Parshath', pos: P.FACEUP_ATTACK }] })
    let stolen = false, lpAfterStandby: number | null = null
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD) {
        if (!stolen) { const r = activate(m, 'Snatch Steal'); if (r) { stolen = true; return r } }
        if (stolen && e.turn >= 2 && lpAfterStandby === null) { lpAfterStandby = e.lp[1]; return 'STOP' }
        return passIdle(m)
      }
      if (m.type === T.SELECT_CARD) return choose(m, 0)
      if (m.type === T.SELECT_BATTLECMD) return passBattle(m)
      return null
    }, 600)
    expect(has(e.field(0), 'Airknight Parshath')).toBe(true)
    expect(lpAfterStandby).toBe(9000)
  })

  it('Book of Moon deja el objetivo boca abajo en defensa', async () => {
    const e = await setUp({ hand: ['Book of Moon'] }, { monsters: [{ card: 'Airknight Parshath', pos: P.FACEUP_ATTACK }] })
    let used = false
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD) {
        if (!used) { const r = activate(m, 'Book of Moon'); if (r) { used = true; return r } }
        if (used) return 'STOP'
        return passIdle(m)
      }
      if (m.type === T.SELECT_CARD) return choose(m, 0)
      return null
    }, 400)
    const target = e.field(1)[0]
    expect(used).toBe(true)
    expect(target).toBeDefined()
    expect((target!.pos & 0x08) !== 0).toBe(true)
  })

  it('con las cinco piezas de Exodia en la mano se gana', async () => {
    const pieces = ['Exodia the Forbidden One', 'Right Arm of the Forbidden One',
      'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One']
    const e = await setUp({ hand: pieces }, {})
    await e.run((m) => (m.type === T.SELECT_IDLECMD ? passIdle(m) : null), 300)
    expect(e.finished).toBe(true)
    expect(e.winner).toBe(0)
  })

  it('D.D. Warrior Lady se destierra a sí misma y al rival tras el combate', async () => {
    const e = await setUp(
      { monsters: [{ card: 'D.D. Warrior Lady', pos: P.FACEUP_ATTACK }] },
      { monsters: [{ card: 'Mystical Elf', pos: P.FACEUP_ATTACK }] })
    let attacked = false
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD) return e.turnPlayer === 0 ? toBattle(m) : passIdle(m)
      if (m.type === T.SELECT_BATTLECMD) {
        if (!attacked) { const r = attackWith(m, 'D.D. Warrior Lady'); if (r) { attacked = true; return r } }
        return passBattle(m)
      }
      if (m.type === T.SELECT_EFFECTYN) return { type: R.SELECT_EFFECTYN, yes: true }
      return null
    }, 600)
    expect(attacked).toBe(true)
    expect(has(e.zone(0, 32), 'D.D. Warrior Lady')).toBe(true)
    expect(has(e.zone(1, 32), 'Mystical Elf')).toBe(true)
  })
})
