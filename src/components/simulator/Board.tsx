/* Port of buildBoard/layoutAll/fitBoard/telegraphAttack/animateBattle
   (view.js). The slot grid is real JSX (just like the original built
   .slot divs); card positions/transforms are computed with
   render/layout.ts and applied imperatively to the real nodes via refs
   in a useLayoutEffect — the same "declarative structure / measured
   position" split the original had, just through React refs instead of
   document.querySelector. */
import { useLayoutEffect, useMemo, useReducer, useRef, type RefObject } from 'react'
import type { DuelCard } from '../../engine/duel'
import { LOC } from '../../engine/duel'
import type { CardRow, NamesSubset } from '../../types/cards'
import type { GameSnapshot, GameEngine } from '../../game/gameEngine'
import { computeBoardScale, computeLayout, HandOrder, type ZoneKey } from '../../render/layout'
import { CardEl, CardFront } from './Card'
import { useDrag } from '../../hooks/useDrag'
import { T } from '../../i18n/i18n'

function useBump() {
  return useReducer((x: number) => x + 1, 0)
}

interface SlotDesc { owner: 0 | 1; zone: ZoneKey; slot: number; cls: string; label?: string }
type Cell = SlotDesc | { blank: true } | { divider: true }

function buildSlots(me: 0 | 1): Cell[] {
  const foe = (1 - me) as 0 | 1
  const blank = (): Cell => ({ blank: true })
  const s = (owner: 0 | 1, zone: ZoneKey, slot: number, cls: string, label?: string): Cell => ({ owner, zone, slot, cls, label })
  const cells: Cell[] = []
  cells.push(blank())
  cells.push(s(foe, 'deck', 0, 'special', 'Deck'))
  for (let i = 4; i >= 0; i--) cells.push(s(foe, 'st', i, 'st', 'M/T'))
  cells.push(s(foe, 'extra', 0, 'special', 'Extra'))
  cells.push(blank())

  cells.push(s(foe, 'banish', 0, 'banish', 'Desterradas'))
  cells.push(s(foe, 'gy', 0, 'special', 'Cementerio'))
  for (let i = 4; i >= 0; i--) cells.push(s(foe, 'm', i, '', 'Monstruo'))
  cells.push(s(foe, 'field', 0, 'special', 'Campo'))
  cells.push(blank())

  cells.push({ divider: true })

  cells.push(blank())
  cells.push(s(me, 'field', 0, 'special', 'Campo'))
  for (let i = 0; i < 5; i++) cells.push(s(me, 'm', i, '', 'Monstruo'))
  cells.push(s(me, 'gy', 0, 'special', 'Cementerio'))
  cells.push(s(me, 'banish', 0, 'banish', 'Desterradas'))

  cells.push(blank())
  cells.push(s(me, 'extra', 0, 'special', 'Extra'))
  for (let i = 0; i < 5; i++) cells.push(s(me, 'st', i, 'st', 'M/T'))
  cells.push(s(me, 'deck', 0, 'special', 'Deck'))
  cells.push(blank())
  return cells
}

const COUNTED: ZoneKey[] = ['deck', 'gy', 'extra', 'banish']
const LOCNUM: Partial<Record<ZoneKey, number>> = { deck: LOC.DECK, gy: LOC.GRAVE, extra: LOC.EXTRA, banish: LOC.REMOVED }

export interface BoardProps {
  engine: GameEngine
  snapshot: GameSnapshot
  db: Map<number, CardRow>
  names: NamesSubset
  useImages: boolean
  onCardClick: (card: DuelCard) => void
  onCardHover: (card: DuelCard) => void
  onSlotClick: (owner: 0 | 1, zone: ZoneKey) => void
  handOrder: HandOrder
  /** LP badges, phase strip, historial, toasts, prompt panel, controles…
   *  In the original (template.html) all of these live INSIDE `#stage`,
   *  which is the `position:relative` their absolute coordinates hang off
   *  of (`.lp{top:20px;left:20px}`, etc). If they're rendered outside
   *  `#stage` (as siblings under `#wrap`, which has no `position`), those
   *  coordinates end up relative to the viewport and the LP badges end up
   *  floating over `#side` instead of over the corner of the board. */
  children?: React.ReactNode
}

export function Board({ engine, snapshot, db, names, useImages, onCardClick, onCardHover, onSlotClick, handOrder, children }: BoardProps) {
  const me = snapshot.me
  const cells = useMemo(() => buildSlots(me), [me])

  const stageRef = useRef<HTMLDivElement | null>(null)
  const planeRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const zoneRefs = useRef<Map<string, HTMLElement>>(new Map())
  const cardElRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [, force] = useBump()

  const allCards: DuelCard[] = useMemo(() => {
    const out: DuelCard[] = []
    for (const p of [0, 1] as const) {
      for (const loc of [LOC.DECK, LOC.HAND, LOC.GRAVE, LOC.REMOVED, LOC.EXTRA, LOC.MZONE, LOC.SZONE, LOC.FZONE]) {
        const arr = (snapshot.zones as unknown as Record<0 | 1, Record<number, Array<DuelCard | null>>>)?.[p]?.[loc]
        if (!arr) continue
        for (const c of arr) if (c) out.push(c)
      }
    }
    return out
    // NOTE: `snapshot.zones` is the same duel.zones object, mutated in
    // place — its reference never changes between commits, so memoizing on
    // it would never invalidate. `snapshot` IS a new object on every
    // commit() (see gameEngine.ts), so that's the correct dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  const playable = snapshot.idle?.playable ?? new Set<number>()
  const drag = useDrag({
    engine, me, db, handOrder, playable,
    zoneRefs, handRefs: cardHandRefsFrom(cardElRefs, snapshot, me),
    bumpLayout: force,
  })

  // ── fitBoard: scale the board so it fits, with the hand hanging off it ──
  useLayoutEffect(() => {
    const fit = () => {
      const st = stageRef.current, pl = planeRef.current, gr = gridRef.current
      if (!st || !pl || !gr) return
      const availW = st.clientWidth - 24, availH = st.clientHeight - 16
      const root = getComputedStyle(document.documentElement)
      const CW = parseFloat(root.getPropertyValue('--cw')) || 116
      const esc = parseFloat(root.getPropertyValue('--mano-mia')) || 1
      const k = computeBoardScale({ availW, availH, gridW: gr.offsetWidth, gridH: gr.offsetHeight, cw: CW, escMia: esc })
      pl.style.transform = `scale(${k.toFixed(3)}) rotateX(var(--tilt))`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  })

  // ── layoutAll: each card's position/transform, applied to the real nodes ──
  useLayoutEffect(() => {
    const gr = gridRef.current
    if (!gr || !snapshot.zones) return
    const root = getComputedStyle(document.documentElement)
    const CW = parseFloat(root.getPropertyValue('--cw')) || 116
    const ESC_MIA = parseFloat(root.getPropertyValue('--mano-mia')) || 1
    const ESC_RIVAL = parseFloat(root.getPropertyValue('--mano-rival')) || 1
    const orden = handOrder.sync(allCards.filter((c) => c.location === LOC.HAND && c.controller === me).map((c) => c.uid))
    const zonePos = (owner: number, zone: ZoneKey, slot: number) => {
      const el = zoneRefs.current.get(`${owner}:${zone}:${slot}`)
      return el ? { x: el.offsetLeft, y: el.offsetTop } : { x: 0, y: 0 }
    }
    const layout = computeLayout({
      me, zones: snapshot.zones!, cw: CW, gridW: gr.offsetWidth, gridH: gr.offsetHeight,
      escMia: ESC_MIA, escRival: ESC_RIVAL, zonePos,
      previa: snapshot.pendingPlacement ? { uid: snapshot.pendingPlacement.uid, owner: snapshot.pendingPlacement.owner, zone: snapshot.pendingPlacement.zone, slot: snapshot.pendingPlacement.slot } : null,
      revelados: snapshot.revealed, manoOrdenMia: orden,
    })
    for (const [uid, el] of cardElRefs.current) {
      const v = layout.get(uid)
      if (!v) { el.style.display = 'none'; continue }
      el.style.display = v.display ? '' : 'none'
      if (!v.display) continue
      el.style.zIndex = String(v.zIndex)
      el.style.transform = v.transform
      const extra = extraClasses(uid, snapshot, drag)
      el.className = `card ${cardBaseClass(uid, allCards, db)} ${v.classes.join(' ')} ${extra}`.trim()
    }
  })

  return (
    <div id="stage" ref={stageRef} onPointerLeave={() => {}}>
      <div id="plane" ref={planeRef}>
        <div id="grid" ref={gridRef}>
          {cells.map((cell, i) => {
            if ('blank' in cell) return <div key={i} className="slot blank" />
            if ('divider' in cell) return <div key={i} className="divider" />
            return <SlotEl key={i} cell={cell} snapshot={snapshot} onRef={(k, el) => { if (el) zoneRefs.current.set(k, el); else zoneRefs.current.delete(k) }}
              onSlotClick={onSlotClick} />
          })}
        </div>
        <div id="cardLayer">
          {allCards.map((card) => (
            <CardEl key={card.uid} card={card} db={db} names={names} useImages={useImages}
              style={{ transform: 'translate3d(0,0,0)', zIndex: 0 }} className=""
              ref={(el) => { if (el) cardElRefs.current.set(card.uid, el); else cardElRefs.current.delete(card.uid) }}
              onClick={onCardClick} onPointerEnter={onCardHover}
              onPointerDown={drag.onCardPointerDown} />
          ))}
        </div>
      </div>
      {drag.dragging && (
        <div id="ghost" style={{ display: 'block', left: drag.dragging.x, top: drag.dragging.y }}>
          <div className="card" style={{ position: 'static', width: '100%', height: '100%' }}>
            <div className="inner"><div className="face front">
              {(() => { const c = allCards.find((c) => c.uid === drag.dragging!.uid); return c ? <CardFront code={c.code} db={db} names={names} useImages={useImages} /> : null })()}
            </div></div>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

function cardHandRefsFrom(cardElRefs: RefObject<Map<number, HTMLDivElement>>, snapshot: GameSnapshot, me: 0 | 1): RefObject<Map<number, HTMLElement>> {
  // filtered on every access: cardElRefs already has ALL mounted cards
  const ref = { current: new Map<number, HTMLElement>() }
  Object.defineProperty(ref, 'current', {
    get() {
      const out = new Map<number, HTMLElement>()
      if (!snapshot.zones) return out
      const arr = (snapshot.zones as unknown as Record<0 | 1, Record<number, Array<DuelCard | null>>>)[me]?.[LOC.HAND] ?? []
      for (const c of arr) if (c && cardElRefs.current.has(c.uid)) out.set(c.uid, cardElRefs.current.get(c.uid)!)
      return out
    },
  })
  return ref as React.RefObject<Map<number, HTMLElement>>
}

function cardBaseClass(uid: number, cards: DuelCard[], db: Map<number, CardRow>): string {
  const c = cards.find((c) => c.uid === uid)
  if (!c) return ''
  const d = db.get(c.code)
  if (!d) return ''
  if (d.type & 0x40) return 'fusion'
  if (d.type & 0x2) return 'spell'
  if (d.type & 0x4) return 'trap'
  return ''
}

function extraClasses(uid: number, s: GameSnapshot, drag: ReturnType<typeof useDrag>): string {
  const cls: string[] = []
  if (s.idle?.playable.has(uid)) cls.push('playable')
  if (s.idle?.acciones.get(uid)?.activate !== undefined) cls.push('usable')
  if (s.battle?.attacked.has(uid)) cls.push('gastada')
  if (s.glowing.has(uid)) cls.push('glow')
  if (s.declaringUid === uid) cls.push('declaring')
  if (s.underAttack === uid) cls.push('underAttack')
  if (s.battleAnim?.uid === uid && s.battleAnim.stage === 'clash') cls.push('attacking')
  if (s.selectCards?.list.some((it) => it.uid === uid)) cls.push('targetable')
  if (drag.dragging?.uid === uid) cls.push('dragging')
  return cls.join(' ')
}

function SlotEl({ cell, snapshot, onRef, onSlotClick }: {
  cell: SlotDesc; snapshot: GameSnapshot
  onRef: (key: string, el: HTMLElement | null) => void
  onSlotClick: (owner: 0 | 1, zone: ZoneKey) => void
}) {
  const key = `${cell.owner}:${cell.zone}:${cell.slot}`
  const occupied = isOccupied(cell, snapshot)
  const n = COUNTED.includes(cell.zone) ? countOf(cell, snapshot) : 0
  const classes = ['slot', cell.cls]
  if (!occupied) classes.push('empty-label')
  if (cell.zone === 'gy' || cell.zone === 'extra' || cell.zone === 'banish') classes.push('browsable')
  if (cell.zone === 'm' || cell.zone === 'st' || cell.zone === 'field') classes.push('hitzona')
  if (COUNTED.includes(cell.zone)) { classes.push('contable'); if (n > 0) classes.push('conCartas') }
  return (
    <div ref={(el) => onRef(key, el)} className={classes.join(' ')}
      data-owner={cell.owner} data-zone={cell.zone} data-slot={cell.slot}
      data-label={cell.label ? T(cell.label) : undefined} data-n={n}
      onClick={() => onSlotClick(cell.owner, cell.zone)} />
  )
}

function isOccupied(cell: SlotDesc, s: GameSnapshot): boolean {
  if (!s.zones) return false
  if (cell.zone === 'm' || cell.zone === 'st' || cell.zone === 'field') {
    const loc = cell.zone === 'm' ? LOC.MZONE : cell.zone === 'st' ? LOC.SZONE : LOC.FZONE
    const arr = (s.zones as unknown as Record<0 | 1, Record<number, Array<DuelCard | null>>>)[cell.owner]?.[loc] ?? []
    if (cell.zone === 'field') return !!arr[0] || !!((s.zones as unknown as Record<0 | 1, Record<number, Array<DuelCard | null>>>)[cell.owner]?.[LOC.SZONE]?.[5])
    return !!arr[cell.slot]
  }
  return true
}

function countOf(cell: SlotDesc, s: GameSnapshot): number {
  const loc = LOCNUM[cell.zone]
  if (loc === undefined || !s.zones) return 0
  return ((s.zones as unknown as Record<0 | 1, Record<number, Array<DuelCard | null>>>)[cell.owner]?.[loc] ?? []).length
}
