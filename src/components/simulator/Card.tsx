/* Port of elFor/frontHTML/classOf (view.js): the exact same
   .card > .shake > .inner > .face.front + .face.back structure. */
import { forwardRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { DuelCard } from '../../engine/duel'
import type { CardRow, NamesSubset } from '../../types/cards'
import { CARD_BACK } from '../../vendor/cardback'
import { T } from '../../i18n/i18n'

const T_MONSTER = 0x1, T_SPELL = 0x2, T_TRAP = 0x4, T_FUSION = 0x40
const IMG_BASE = 'https://images.ygoprodeck.com/images/cards/'
const ATTRCOL: Record<number, [string, string, string]> = {
  1: ['#6b2f1d', '#2a0f08', 'FUEGO'], 2: ['#1f4f68', '#0a1e28', 'AGUA'],
  4: ['#46522c', '#181d0e', 'TIERRA'], 8: ['#26513f', '#0d1f18', 'VIENTO'],
  16: ['#7a6a3a', '#2a240f', 'LUZ'], 32: ['#412a5e', '#170b22', 'OSCURIDAD'],
  64: ['#4a3a5a', '#1a1020', 'DIVINO'],
}

export function classOf(db: Map<number, CardRow>, code: number): string {
  const d = db.get(code); if (!d) return ''
  if (d.type & T_FUSION) return 'fusion'
  if (d.type & T_SPELL) return 'spell'
  if (d.type & T_TRAP) return 'trap'
  return ''
}

const artCode = (db: Map<number, CardRow>, code: number) => db.get(code)?.alias || code

export function CardFront({ code, db, names, useImages }: { code: number; db: Map<number, CardRow>; names: NamesSubset; useImages: boolean }) {
  const d = db.get(code)
  const mon = !!(d && d.type & T_MONSTER)
  const [c1, c2, attr] = !d ? ['#333', '#111', ''] : mon ? (ATTRCOL[d.attribute] ?? ['#4a4a4a', '#1a1a1a', ''])
    : (d.type & T_SPELL) ? ['#14544c', '#062420', 'MÁGICA'] : ['#5c1f42', '#26081a', 'TRAMPA']
  const name = names[code]?.name ?? '#' + code
  return (
    <>
      <div className="fallback" style={{ background: `linear-gradient(155deg,${c1},${c2})` }}>
        <span className="fbname">{name}</span>
        {mon
          ? <><span className="fbstats">{d?.attack}/{d?.defense}</span><span className="fblv">{'★'.repeat(Math.min(d?.level || 0, 8))}</span></>
          : <span className="fbstats">{T(attr)}</span>}
      </div>
      {useImages && (
        <img className="cimg" src={`${IMG_BASE}${artCode(db, code)}.jpg`} loading="lazy" alt=""
          onLoad={(e) => (e.currentTarget.parentNode as HTMLElement)?.classList.add('hasimg')} />
      )}
    </>
  )
}

export interface CardProps {
  card: DuelCard
  db: Map<number, CardRow>
  names: NamesSubset
  useImages: boolean
  style: { transform: string; zIndex: number; display?: 'none' }
  className: string
  onClick?: (card: DuelCard) => void
  onPointerEnter?: (card: DuelCard) => void
  onPointerDown?: (card: DuelCard, e: ReactPointerEvent) => void
}

export const CardEl = forwardRef<HTMLDivElement, CardProps>(function CardEl(
  { card, db, names, useImages, style, className, onClick, onPointerEnter, onPointerDown }, ref,
) {
  return (
    <div
      ref={ref}
      className={`card ${classOf(db, card.code)} ${className}`.trim()}
      data-uid={card.uid}
      style={{ ...style, display: style.display }}
      onClick={(e) => { e.stopPropagation(); onClick?.(card) }}
      onPointerEnter={() => onPointerEnter?.(card)}
      onPointerDown={(e) => onPointerDown?.(card, e)}
    >
      <div className="shake">
        <div className="inner">
          <div className="face front"><CardFront code={card.code} db={db} names={names} useImages={useImages} /></div>
          <div className="face back"><img src={CARD_BACK} alt="" /></div>
        </div>
      </div>
    </div>
  )
})
