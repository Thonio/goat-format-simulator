/* Port of view.js's drag part (startDrag/onMove/onUp/slotUnder/
   indiceEnMano). Still DOM (hit-testing with getBoundingClientRect,
   like the original) but wired through React refs instead of
   document.querySelector, and ending in
   GameEngine.dropCard(...)/HandOrder.moveTo(...) instead of callbacks
   registered with setHandlers. */
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { DuelCard } from '../engine/duel'
import type { CardRow } from '../types/cards'
import type { GameEngine } from '../game/gameEngine'
import type { HandOrder } from '../render/layout'

const T_MONSTER = 0x1, T_FIELD = 0x80000

export interface DragVisual {
  uid: number
  x: number
  y: number
}

export interface UseDragOptions {
  engine: GameEngine
  me: 0 | 1
  db: Map<number, CardRow>
  handOrder: HandOrder
  /** uids playable from the hand right now (GameSnapshot.idle.playable). */
  playable: Set<number>
  /** refs to the board's slots, keyed `${owner}:${zone}:${slot}`. */
  zoneRefs: RefObject<Map<string, HTMLElement>>
  /** refs to the cards currently in your hand (to reorder when dropped
   *  back onto the hand itself). */
  handRefs: RefObject<Map<number, HTMLElement>>
  /** forces a repaint after reordering the hand (which doesn't touch the engine). */
  bumpLayout: () => void
}

export interface UseDragResult {
  dragging: DragVisual | null
  dropOk: Set<string>
  dropHot: string | null
  onCardPointerDown: (card: DuelCard, e: ReactPointerEvent) => void
}

export function useDrag(opts: UseDragOptions): UseDragResult {
  const { engine, me, db, handOrder, zoneRefs, handRefs, bumpLayout } = opts
  const playableRef = useRef(opts.playable)
  playableRef.current = opts.playable

  const [dragging, setDragging] = useState<DragVisual | null>(null)
  const [dropOk, setDropOk] = useState<Set<string>>(new Set())
  const [dropHot, setDropHot] = useState<string | null>(null)

  const stateRef = useRef<{ card: DuelCard; moved: boolean } | null>(null)

  const slotUnder = useCallback((clientX: number, clientY: number, okKeys: Set<string>): string | null => {
    const refs = zoneRefs.current
    if (!refs) return null
    let best: string | null = null, bestD = Infinity, bestW = 110
    for (const key of okKeys) {
      const el = refs.get(key); if (!el) continue
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const d = Math.hypot(clientX - cx, clientY - cy)
      if (d < bestD) { bestD = d; best = key; bestW = r.width }
    }
    const lim = bestW * 1.6
    return bestD <= lim ? best : null
  }, [zoneRefs])

  const indiceEnMano = useCallback((clientX: number, clientY: number): { indice: number; alturaOk: boolean } | null => {
    const refs = handRefs.current
    if (!refs || !refs.size) return null
    const mias = [...refs.entries()]
      .map(([uid, el]) => { const r = el.getBoundingClientRect(); return { uid, x: r.left + r.width / 2 } })
      .sort((a, b) => a.x - b.x)
    let i = 0
    while (i < mias.length && clientX > mias[i].x) i++
    const H = window.innerHeight || 800
    return { indice: i, alturaOk: clientY > H * 0.62 }
  }, [handRefs])

  const onMove = useCallback((e: PointerEvent) => {
    const s = stateRef.current
    if (!s) return
    s.moved = true
    setDragging({ uid: s.card.uid, x: e.clientX, y: e.clientY })
    const okKeys = dropOkKeysRef.current
    setDropHot(slotUnder(e.clientX, e.clientY, okKeys))
  }, [slotUnder])

  const dropOkKeysRef = useRef<Set<string>>(new Set())

  const onUp = useCallback((e: PointerEvent) => {
    const s = stateRef.current
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    stateRef.current = null
    setDragging(null)
    setDropOk(new Set())
    setDropHot(null)
    if (!s) return
    const okKeys = dropOkKeysRef.current
    const target = slotUnder(e.clientX, e.clientY, okKeys)
    if (target) {
      const [ownerStr, zone, slotStr] = target.split(':')
      if (Number(ownerStr) === me) {
        engine.dropCard(s.card.uid, zone as 'm' | 'st' | 'field', Number(slotStr))
        return
      }
    }
    // dropped back onto the hand itself: reorder (view-only, doesn't touch the engine)
    if (s.moved) {
      const dest = indiceEnMano(e.clientX, e.clientY)
      if (dest && dest.alturaOk) { handOrder.moveTo(s.card.uid, dest.indice); bumpLayout(); return }
    }
    bumpLayout()
  }, [engine, me, slotUnder, indiceEnMano, handOrder, bumpLayout, onMove])

  const onCardPointerDown = useCallback((card: DuelCard, e: React.PointerEvent) => {
    const HAND = 2
    if (card.location !== HAND || card.controller !== me) return
    if (!playableRef.current.has(card.uid)) return
    e.preventDefault()
    stateRef.current = { card, moved: false }
    setDragging({ uid: card.uid, x: e.clientX, y: e.clientY })

    const okKeys = new Set<string>()
    const d = db.get(card.code)
    if (d) {
      const kind = (d.type & T_MONSTER) ? 'm' : 'st'
      for (let i = 0; i < 5; i++) okKeys.add(`${me}:${kind}:${i}`)
      if (d.type & T_FIELD) okKeys.add(`${me}:field:0`)
    }
    dropOkKeysRef.current = okKeys
    setDropOk(okKeys)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [me, db, onMove, onUp])

  return { dragging, dropOk, dropHot, onCardPointerDown }
}
