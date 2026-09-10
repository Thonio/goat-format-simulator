/* ════════════════════════════════════════════════════════════════
   Decisions with no real choice → resolve themselves.

   The core opens a response window at every timing, and announces every
   mandatory effect, even when the player has NOTHING to decide. Asking in
   those cases is what made the duel feel stuck. Master Duel, Duel Links
   and EDOPro do exactly this: if there's only one legal path, they take
   it without asking.
   ════════════════════════════════════════════════════════════════ */
import type { OcgMessage, OcgNamespace } from '../types/ocgcore'

export function makeTrivialResolver(X: OcgNamespace) {
  const T = X.OcgMessageType, R = X.OcgResponseType
  return function trivial(m: OcgMessage): Record<string, unknown> | null {
    switch (m.type) {
      case T.SELECT_CHAIN: {
        const n = (m.selects as unknown[] | undefined)?.length ?? 0
        // nothing to chain: the chain resolves on its own
        if (n === 0) return { type: R.SELECT_CHAIN, index: null }
        // mandatory with only one possible effect: no decision to make
        if (m.forced && n === 1) return { type: R.SELECT_CHAIN, index: 0 }
        return null
      }
      case T.SELECT_OPTION:
        return ((m.options as unknown[] | undefined)?.length ?? 0) <= 1 ? { type: R.SELECT_OPTION, index: 0 } : null
      case T.SELECT_POSITION: {
        const bits = [1, 2, 4, 8].filter((b) => (m.positions as number) & b)
        return bits.length <= 1 ? { type: R.SELECT_POSITION, position: bits[0] ?? 1 } : null
      }
      case T.SELECT_CARD:
      case T.SELECT_TRIBUTE: {
        const n = (m.selects as unknown[] | undefined)?.length ?? 0
        const min = (m.min as number) ?? 1, max = (m.max as number) ?? min
        // you have to take exactly all of them: no choice involved
        if (n > 0 && min === max && min === n)
          return {
            type: m.type === T.SELECT_TRIBUTE ? R.SELECT_TRIBUTE : R.SELECT_CARD,
            indicies: Array.from({ length: n }, (_, i) => i),
          }
        return null
      }
      case T.SELECT_UNSELECT_CARD: {
        const n = (m.select_cards as unknown[] | undefined)?.length ?? 0
        if (n === 1 && !m.can_finish) return { type: R.SELECT_UNSELECT_CARD, index: 0 }
        if (n === 0 && m.can_finish) return { type: R.SELECT_UNSELECT_CARD, index: null }
        return null
      }
      default: return null
    }
  }
}
