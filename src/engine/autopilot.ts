/* Minimal automatic player, shared by the test suite and the opponent AI. */
import type { OcgMessage, OcgNamespace } from '../types/ocgcore'

export function makeAutoPlayer(X: OcgNamespace) {
  const { OcgMessageType: T, OcgResponseType: R, OcgLocation,
    SelectIdleCMDAction: IA, SelectBattleCMDAction: BA, OcgPosition } = X
  return function decide(m: OcgMessage, attempt = 0): Record<string, unknown> | null {
    switch (m.type) {
      case T.SELECT_IDLECMD: {
        const plan: Array<{ action: number; index: number | null }> = []
        if ((m.summons as unknown[] | undefined)?.length) plan.push({ action: IA.SELECT_SUMMON, index: 0 })
        if ((m.activates as unknown[] | undefined)?.length) plan.push({ action: IA.SELECT_ACTIVATE, index: 0 })
        if ((m.spell_sets as unknown[] | undefined)?.length) plan.push({ action: IA.SELECT_SPELL_SET, index: 0 })
        if ((m.monster_sets as unknown[] | undefined)?.length) plan.push({ action: IA.SELECT_MONSTER_SET, index: 0 })
        plan.push({ action: m.to_bp ? IA.TO_BP : IA.TO_EP, index: null })
        return { type: R.SELECT_IDLECMD, ...plan[Math.min(attempt, plan.length - 1)] }
      }
      case T.SELECT_BATTLECMD: {
        const attacks = m.attacks as unknown[] | undefined
        if (attacks?.length && attempt < attacks.length)
          return { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: attempt }
        return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? BA.TO_M2 : BA.TO_EP, index: null }
      }
      case T.SELECT_CHAIN: {
        const N = (m.selects as unknown[] | undefined)?.length ?? 0
        if (m.forced && N) return { type: R.SELECT_CHAIN, index: attempt % N }
        if (attempt > 0 && N) return { type: R.SELECT_CHAIN, index: (attempt - 1) % N }
        return { type: R.SELECT_CHAIN, index: null }
      }
      case T.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: attempt === 0 }
      case T.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: attempt === 0 }
      case T.SELECT_OPTION: return { type: R.SELECT_OPTION, index: attempt % ((m.options as unknown[] | undefined)?.length || 1) }
      case T.SELECT_POSITION: {
        const opts = [OcgPosition.FACEUP_ATTACK, OcgPosition.FACEUP_DEFENSE, OcgPosition.FACEDOWN_DEFENSE]
          .filter((p) => (m.positions as number) & p)
        return {
          type: R.SELECT_POSITION,
          position: opts[attempt % Math.max(1, opts.length)] ?? OcgPosition.FACEUP_ATTACK,
        }
      }
      case T.SELECT_PLACE:
      case T.SELECT_DISFIELD: {
        // the mask is relative to the player being asked: bytes 0-1 own side, 2-3 opponent's
        const self = m.player as number, foe = 1 - self, mask = (m.field_mask as number) >>> 0
        const places: Array<{ player: number; location: number; sequence: number }> = []
        for (const [byte, player, location] of [
          [0, self, OcgLocation.MZONE], [1, self, OcgLocation.SZONE],
          [2, foe, OcgLocation.MZONE], [3, foe, OcgLocation.SZONE],
        ] as const) {
          const b = (mask >>> (byte * 8)) & 0xff
          for (let seq = 0; seq < 5; seq++) if (!((b >>> seq) & 1)) places.push({ player, location, sequence: seq })
        }
        const n = Math.max(1, (m.count as number) ?? 1)
        const off = attempt % Math.max(1, places.length - n + 1)
        return {
          type: m.type === T.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD,
          places: places.slice(off, off + n),
        }
      }
      case T.SELECT_UNSELECT_CARD: {
        const N = (m.select_cards as unknown[] | undefined)?.length ?? 0
        if (m.can_finish && attempt >= N) return { type: R.SELECT_UNSELECT_CARD, index: null }
        return { type: R.SELECT_UNSELECT_CARD, index: N ? attempt % N : null }
      }
      case T.SELECT_CARD:
      case T.SELECT_TRIBUTE: {
        const N = (m.selects as unknown[] | undefined)?.length ?? 0
        if (!N) return { type: R.SELECT_CARD, indicies: null }
        const min = Math.max(1, (m.min as number) ?? 1), max = Math.min((m.max as number) ?? min, N)
        const count = Math.min(Math.max(min, 1), Math.max(max, 1))
        const window = Math.max(1, N - count + 1)
        if (attempt >= window && m.can_cancel) return { type: R.SELECT_CARD, indicies: null }
        const start = attempt % window
        return {
          type: m.type === T.SELECT_TRIBUTE ? R.SELECT_TRIBUTE : R.SELECT_CARD,
          indicies: Array.from({ length: count }, (_, i) => start + i),
        }
      }
      case T.SORT_CARD: return { type: R.SORT_CARD, order: null }
      case T.ANNOUNCE_RACE: {
        const bits: bigint[] = []
        const a = BigInt(m.available as number)
        for (let i = 0n; i < 64n; i++) if ((a >> i) & 1n) bits.push(1n << i)
        return { type: R.ANNOUNCE_RACE, races: bits.slice(attempt, attempt + ((m.count as number) ?? 1)) }
      }
      case T.ANNOUNCE_ATTRIB: {
        const bits: number[] = []
        for (let i = 0; i < 32; i++) if (((m.available as number) >> i) & 1) bits.push(1 << i)
        return { type: R.ANNOUNCE_ATTRIB, attributes: bits.slice(attempt, attempt + ((m.count as number) ?? 1)) }
      }
      case T.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: attempt }
      case T.ANNOUNCE_CARD:
        // last resort: the brain and the interface resolve this before it gets here
        return { type: R.ANNOUNCE_CARD, card: 55144522 }
      default: return null
    }
  }
}
