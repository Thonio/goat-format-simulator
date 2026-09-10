/* ════════════════════════════════════════════════════════════
   LAYOUT — pure port of layoutAll/fitBoard (view.js).

   The original read slot positions from the real DOM
   (`slot.offsetLeft/offsetTop`) and wrote `el.style.transform`
   directly. Here it's split into two halves:
     - Board (the component) measures the real slots via refs and
       builds the `zonePos` map — that's still DOM, because the
       positions come from a real CSS Grid, not a formula.
     - The functions here are PURE: they take that position map
       plus the duel state and return, per card, the
       `transform`/`zIndex`/classes to apply. No DOM at all.
   ════════════════════════════════════════════════════════════ */
import { LOC, type DuelCard, type DuelSide } from '../engine/duel'

export type ZoneKey = 'deck' | 'hand' | 'm' | 'st' | 'gy' | 'banish' | 'extra' | 'field'

export const ZKEY: Record<number, ZoneKey> = {
  [LOC.DECK]: 'deck', [LOC.HAND]: 'hand', [LOC.MZONE]: 'm', [LOC.SZONE]: 'st',
  [LOC.GRAVE]: 'gy', [LOC.REMOVED]: 'banish', [LOC.EXTRA]: 'extra', [LOC.FZONE]: 'field',
}
/** Locations iterated for the layout, in the same order as the original. */
export const LAYOUT_LOCS = [LOC.DECK, LOC.HAND, LOC.GRAVE, LOC.REMOVED, LOC.EXTRA, LOC.MZONE, LOC.SZONE, LOC.FZONE]

const TILT = 11
const isFD = (p: number) => !!(p & 0x0a)
const isDef = (p: number) => !!(p & 0x0c)

/** Under 2005 rules the Field Spell lives in slot 5 of S/T, not in
 *  FZONE — without this translation it gets drawn outside the "Field" slot. */
export function slotOf(loc: number, idx: number): [ZoneKey, number] {
  if (loc === LOC.SZONE && idx === 5) return ['field', 0]
  return [ZKEY[loc], idx]
}

export interface ZonePos { x: number; y: number }
export type ZonePosLookup = (owner: number, zone: ZoneKey, slot: number) => ZonePos

export interface PendingPlacement { uid: number; owner: number; zone: string; slot: number }

export interface LayoutInput {
  me: 0 | 1
  zones: { 0: DuelSide; 1: DuelSide }
  cw: number
  gridW: number
  gridH: number
  myHandScale: number
  oppHandScale: number
  zonePos: ZonePosLookup
  preview: PendingPlacement | null
  revealed: Set<number>
  /** Your hand's uids, already in visual order (see useHandOrder). */
  myHandOrder: number[]
}

export interface CardVisual {
  transform: string
  zIndex: number
  hidden: boolean
  display: boolean
  classes: string[]
}

function sortHand(arr: DuelCard[], order: number[]): DuelCard[] {
  const idx = (uid: number) => { const i = order.indexOf(uid); return i < 0 ? order.length : i }
  return [...arr].sort((a, b) => idx(a.uid) - idx(b.uid))
}

/** Port of layoutAll: for each live card, its transform/classes. */
export function computeLayout(input: LayoutInput): Map<number, CardVisual> {
  const { me, zones, cw: CW, gridW, gridH, myHandScale: MY_HAND_SCALE, oppHandScale: OPP_HAND_SCALE, zonePos, preview, revealed, myHandOrder } = input
  const out = new Map<number, CardVisual>()

  for (const p of [0, 1] as const) {
    for (const loc of LAYOUT_LOCS) {
      const raw = (zones[p] as unknown as Record<number, Array<DuelCard | null>>)[loc]
      if (!raw) continue
      let arr: DuelCard[] = raw.filter((c): c is DuelCard => !!c)
      if (loc === LOC.HAND && p === me) arr = sortHand(arr, myHandOrder)

      arr.forEach((card, idx) => {
        const mine = card.controller === me
        let x = 0, y = 0, rz = 0, rx = 0, tz = 0, sc = 1, z = 10
        let display = true

        const isPreviewing = !!(preview && preview.uid === card.uid && loc === LOC.HAND)
        const isRevealed = revealed.has(card.uid)

        if (isRevealed && loc === LOC.HAND && !mine) {
          const group = arr.filter((c) => revealed.has(c.uid))
          const k = group.findIndex((c) => c.uid === card.uid), n2 = Math.max(1, group.length)
          const step = Math.min(CW * 1.06, (gridW - CW) / n2)
          x = gridW / 2 - CW / 2 + (k - (n2 - 1) / 2) * step
          y = gridH * 0.16
          tz = 220; z = 400 + k; sc = 1.06
        } else if (isPreviewing && preview) {
          const p2 = zonePos(preview.owner, preview.zone as ZoneKey, preview.slot)
          x = p2.x; y = p2.y; tz = 26; z = 210
        } else if (loc === LOC.HAND) {
          const CH = CW * 1.46
          sc = mine ? MY_HAND_SCALE : OPP_HAND_SCALE
          const n = arr.length, off = idx - (n - 1) / 2
          const spread = Math.min(CW * 0.80 * sc, (gridW * 0.62) / Math.max(n, 1))
          x = gridW / 2 - CW / 2 + off * spread
          const arc = off * off * 2.2
          y = mine ? gridH - CH * (0.16 + 0.16 * sc) + arc : -CH * (0.30 + 0.30 * sc) - arc
          rz = (mine ? 1 : -1) * off * 2.6; rx = -TILT; tz = mine ? 90 : 110; z = 50 + idx
        } else if (loc === LOC.DECK || loc === LOC.GRAVE || loc === LOC.EXTRA || loc === LOC.REMOVED) {
          // only the top 3 cards of the pile are drawn
          const fromTop = arr.length - 1 - idx
          if (fromTop > 3) { out.set(card.uid, { transform: '', zIndex: 0, hidden: true, display: false, classes: [] }); return }
          const stacked = fromTop > 0
          const p2 = zonePos(card.controller, ZKEY[loc], 0)
          const k = Math.min(fromTop, 3)
          x = p2.x - k * 1.6; y = p2.y - k * 2.2; tz = -k * 0.5; z = 10 - k
          out.set(card.uid, finish(card, x, y, rz, rx, tz, sc, z, true, mine, loc, false, isRevealed, stacked))
          return
        } else {
          const [zk, zi] = slotOf(loc, idx)
          const p2 = zonePos(card.controller, zk, zi)
          x = p2.x; y = p2.y
          if (loc === LOC.MZONE && isDef(card.position)) rz = 90
        }
        out.set(card.uid, finish(card, x, y, rz, rx, tz, sc, z, display, mine, loc, isPreviewing, isRevealed, false))
      })
    }
  }
  return out
}

function finish(
  card: DuelCard, x: number, y: number, rz: number, rx: number, tz: number, sc: number, z: number,
  display: boolean, mine: boolean, loc: number, isPreviewing: boolean, isRevealed: boolean, stacked: boolean,
): CardVisual {
  // Visibility depends on the ZONE, not on the position bits: the core
  // marks every card in a hand as "face-down", so one coming back from
  // the graveyard to your hand (Magician of Faith) would arrive face-down
  // if the bit were checked instead of the zone.
  const hidden = loc === LOC.HAND ? !mine
    : (loc === LOC.DECK || loc === LOC.EXTRA) ? true
    : isFD(card.position)
  const classes: string[] = []
  if (loc === LOC.DECK || loc === LOC.GRAVE || loc === LOC.EXTRA || loc === LOC.REMOVED) classes.push('enMonton')
  if (stacked) classes.push('apilada')
  classes.push((isPreviewing || isRevealed) ? '' : hidden ? 'facedown' : '') // cleaned up below
  if (isPreviewing) classes.push('colocando')
  if (isRevealed) classes.push('revelada')
  if (loc === LOC.HAND && mine && !isPreviewing) classes.push('in-hand')
  if (loc === LOC.HAND && !mine && !isRevealed) classes.push('mano-rival')
  if (mine) classes.push('mine')
  return {
    transform: `translate3d(${x}px,${y}px,${tz}px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${sc})`,
    zIndex: z,
    hidden: (isPreviewing || isRevealed) ? false : hidden,
    display,
    classes: classes.filter(Boolean),
  }
}

/** Port of fitBoard: scale factor so the board (+ the hand hanging
 *  below it) fits in the available viewport. */
export function computeBoardScale(opts: {
  availW: number; availH: number; gridW: number; gridH: number; cw: number; myHandScale: number
}): number {
  const { availW, availH, gridW: w, gridH: h, cw: CW, myHandScale: esc } = opts
  if (!w || !h) return 1
  const overhang = CW * 1.46 * 0.80 * esc
  return Math.min(1, availW / w, availH / (h + overhang))
}

/** Keeps YOUR hand's visual order stable across repaints — this is
 *  purely a view concern: the engine keeps its own order untouched.
 *  Port of `ordenMano`/`manoOrdenada`/`moverEnMano`, without the module
 *  `let`: here it lives in an array the caller (a React hook) owns. */
export class HandOrder {
  private order: number[] = []
  sync(uids: number[]): number[] {
    this.order = this.order.filter((u) => uids.includes(u))
    for (const u of uids) if (!this.order.includes(u)) this.order.push(u)
    return this.order
  }
  moveTo(uid: number, dest: number) {
    const i = this.order.indexOf(uid)
    if (i < 0) return
    this.order.splice(i, 1)
    this.order.splice(Math.max(0, Math.min(dest, this.order.length)), 0, uid)
  }
  get current(): number[] { return this.order }
}
