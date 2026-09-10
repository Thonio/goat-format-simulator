/* State evaluation: how well the game is going for the bot. */
import { getCardInfo, type CardInfo } from './knowledge'
import type { CardView, DuelView } from './view'

export const atk = (c?: CardView | null) => c?.data?.attack ?? 0
export const def = (c?: CardView | null) => c?.data?.defense ?? 0
// What a monster contributes while defending or attacking
export const power = (c?: CardView | null) => (c?.isDefense ? def(c) : atk(c))

export function cardValue(c?: CardView | null): number {
  if (!c?.name) return 1.0 // unknown: average value
  return getCardInfo(c.name, c.data).value ?? 1.0
}
export function roleOf(c?: CardView | null): string {
  if (!c?.name) return 'unknown'
  return getCardInfo(c.name, c.data).role
}
export function infoOf(c?: CardView | null): Partial<CardInfo> {
  if (!c?.name) return {}
  return getCardInfo(c.name, c.data)
}

/* Card advantage: the metric that decides Goat games. */
export function advantage(v: DuelView): number {
  const mine = v.hand.length + v.monsters.length + v.backrow.length
  const theirs = v.opponentHand.count + v.opponentMonsters.length + v.opponentBackrow.length
  return mine - theirs
}

/* Board pressure, counting only what's visible. */
export function pressure(v: DuelView): number {
  const mine = v.monsters.reduce((s, c) => s + power(c), 0)
  const theirs = v.opponentMonsters.reduce((s, c) => s + (c.faceDown ? 1200 : power(c)), 0)
  return (mine - theirs) / 1000
}

export function evaluate(v: DuelView): number {
  return advantage(v) * 3.0 + pressure(v) * 1.2 + (v.lp.mine - v.lp.opponent) / 2500
}

/* Can I kill this monster in combat without losing mine? */
export function winsCombat(attacker: CardView, defender: CardView): boolean {
  if (defender.faceDown) return atk(attacker) > 1600 // reasonable bet
  return defender.isDefense ? atk(attacker) > def(defender) : atk(attacker) > atk(defender)
}
export function diesAttacking(attacker: CardView, defender: CardView): boolean {
  if (defender.faceDown) return false
  return !defender.isDefense && atk(defender) >= atk(attacker)
}
