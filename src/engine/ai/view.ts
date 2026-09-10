/* ══════════════════════════════════════════════════════════════════
   THE BOT'S LEGAL VIEW — plays clean.

   The AI runs in the same process as you, so it could technically read
   your hand. This module is the boundary: it trims the state down to
   what an honest player sees from their seat. If you ever want a
   cheating bot, this is the only place to change it.
   ══════════════════════════════════════════════════════════════════ */
import type { DuelCard, GoatDuel } from '../duel'
import type { CardRow, NamesSubset } from '../../types/cards'

const L = { DECK: 1, HAND: 2, MZONE: 4, SZONE: 8, GRAVE: 16, REMOVED: 32, EXTRA: 64 } as const
const isFaceDown = (p: number) => !!(p & 0x0a)

/** The subset of a card's shape the pure evaluation functions in evaluar.ts
 *  actually need. `BoardCardView` (from viewOf) satisfies it, and so does
 *  brain.ts's lighter `cardFromList()` projection over a decision-message
 *  card entry — they don't need a uid/position/sequence to be scored. */
export interface CardView {
  name: string | null
  data: CardRow | null
  isDefense: boolean
  faceDown: boolean
}

export interface BoardCardView extends CardView {
  uid: number
  code: number | null
  pos: number
  mine: boolean
  seq: number
}

export interface DuelView {
  me: number
  opponent: number
  lp: { mine: number; opponent: number }
  myTurn: boolean
  turn: number
  phase: number
  hand: BoardCardView[]
  opponentHand: { count: number }
  monsters: BoardCardView[]
  opponentMonsters: BoardCardView[]
  backrow: BoardCardView[]
  opponentBackrow: BoardCardView[]
  opponentHiddenCount: number
  graveyard: BoardCardView[]
  opponentGraveyard: BoardCardView[]
  banished: BoardCardView[]
  opponentBanished: BoardCardView[]
  extra: BoardCardView[]
  deckRemaining: number
}

export function viewOf(duel: GoatDuel, me: number, db: Map<number, CardRow>, names: NamesSubset): DuelView {
  const opponent = 1 - me
  const y = me as 0 | 1, r = opponent as 0 | 1
  const cardOf = (c: DuelCard | null, hidden: boolean): BoardCardView | null =>
    c && {
      uid: c.uid, code: hidden ? null : c.code,
      name: hidden ? null : (names[c.code]?.name ?? null),
      data: hidden ? null : db.get(c.code) ?? null,
      pos: c.position, faceDown: isFaceDown(c.position),
      isDefense: !!(c.position & 0x0c), mine: c.controller === me,
      seq: c.sequence,
    }
  const listOf = (p: 0 | 1, loc: typeof L.DECK | typeof L.HAND | typeof L.GRAVE | typeof L.REMOVED | typeof L.EXTRA, hidden = false): BoardCardView[] =>
    (duel.zones[p][loc] ?? []).filter(Boolean).map((c) => cardOf(c as DuelCard, hidden)!)
  const zoneOf = (p: 0 | 1, loc: typeof L.MZONE | typeof L.SZONE): Array<BoardCardView | null> =>
    (duel.zones[p][loc] ?? []).map((c) => (c ? cardOf(c, isFaceDown(c.position) && c.controller !== me) : null))

  return {
    me, opponent,
    lp: { mine: duel.lp[y], opponent: duel.lp[r] },
    myTurn: duel.turnPlayer === me,
    turn: duel.turnCount,
    phase: duel.phase,
    hand: listOf(y, L.HAND),
    opponentHand: { count: (duel.zones[r][L.HAND] ?? []).length }, // just the count
    monsters: zoneOf(y, L.MZONE).filter((c): c is BoardCardView => !!c),
    opponentMonsters: zoneOf(r, L.MZONE).filter((c): c is BoardCardView => !!c),
    backrow: zoneOf(y, L.SZONE).filter((c): c is BoardCardView => !!c),
    opponentBackrow: zoneOf(r, L.SZONE).filter((c): c is BoardCardView => !!c),
    // the opponent's set backrow: we know it exists, not what it is
    opponentHiddenCount: (duel.zones[r][L.SZONE] ?? []).filter((c) => c && isFaceDown(c.position)).length,
    graveyard: listOf(y, L.GRAVE),
    opponentGraveyard: listOf(r, L.GRAVE),
    banished: listOf(y, L.REMOVED),
    opponentBanished: listOf(r, L.REMOVED),
    extra: listOf(y, L.EXTRA),
    deckRemaining: (duel.zones[y][L.DECK] ?? []).length,
  }
}
