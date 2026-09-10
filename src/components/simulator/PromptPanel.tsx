/* Port of #prompt (view.js/main.js): the decision panel on the right.
   Covers panel (generic questions), selectCards (SELECT_CARD/TRIBUTE/
   UNSELECT_CARD), and announceCard (ANNOUNCE_CARD). The original resolved
   selectCards mostly through clicks on the board ("targetable" cards,
   see Board.tsx) plus the zone viewer for hidden cards; here, to keep it
   simple, ALL selectCards options are also listed as buttons in the
   panel — the board ones are still clickable too. */
import { useEffect, useState } from 'react'
import type { GameEngine, GameSnapshot } from '../../game/gameEngine'
import type { NamesSubset } from '../../types/cards'
import { T } from '../../i18n/i18n'

export function ChainTimer({ deadline }: { deadline: number | null }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (deadline == null) return
    const id = setInterval(() => tick((x) => x + 1), 100)
    return () => clearInterval(id)
  }, [deadline])
  if (deadline == null) return null
  const restante = Math.max(0, deadline - Date.now())
  const total = 15000
  const pct = Math.max(0, Math.min(100, (restante / total) * 100))
  const urgente = restante < 4000
  return (
    <div id="ptimer" className={urgente ? 'urgente' : ''}>
      <span className="ptnum">{Math.ceil(restante / 1000)}</span>
      <div className="ptbar"><i style={{ width: pct + '%' }} /></div>
    </div>
  )
}

function nameOf(names: NamesSubset, code: number): string { return names[code]?.name ?? '#' + code }

export function PromptPanel({ engine, snapshot, names }: { engine: GameEngine; snapshot: GameSnapshot; names: NamesSubset }) {
  const { panel, selectCards, announceCard } = snapshot
  const [busca, setBusca] = useState('')

  const visible = !!(panel || selectCards || announceCard)
  if (!visible) return <div id="prompt" style={{ display: 'none' }} />

  return (
    <div id="prompt" style={{ display: 'block' }}>
      {panel?.momento && <div className="pfase">{T(panel.momento)}</div>}
      <div className="ptitle">{T(panel?.title ?? (selectCards ? 'Selecciona cartas' : 'Declara una carta'))}</div>
      {panel?.note && <div className="pnote">{T(panel.note)}</div>}
      {snapshot.chainActive && <ChainTimer deadline={snapshot.chainDeadline} />}

      {selectCards && (
        <div className="popts">
          <div className="pnote">
            {T(`Selecciona ${selectCards.min === selectCards.max ? selectCards.min : `${selectCards.min}-${selectCards.max}`} carta(s)`)}
          </div>
          {selectCards.list.map((item, i) => (
            <button key={i} className={`btn${selectCards.chosen.includes(i) ? ' gold' : ''}`}
              onClick={() => engine.toggleSelectCard(i)}>
              {nameOf(names, item.code)}
            </button>
          ))}
          {selectCards.canFinish && <button className="btn gold" onClick={() => engine.finishSelectCards()}>{T('Terminar')}</button>}
          {selectCards.canCancel && <button className="btn" onClick={() => engine.cancelSelectCards()}>{T('Cancelar')}</button>}
        </div>
      )}

      {announceCard && (
        <>
          <input placeholder={T('Buscar…') ?? 'Buscar…'} value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div id="buscaRes" className="popts">
            {announceCard.candidates
              .filter((c) => !busca || nameOf(names, c).toLowerCase().includes(busca.toLowerCase()))
              .slice(0, 60)
              .map((code) => (
                <button key={code} className="btn" onClick={() => engine.chooseAnnouncedCard(code)}>{nameOf(names, code)}</button>
              ))}
          </div>
        </>
      )}

      {panel && (
        <div className="popts">
          {panel.options.map((o, i) => (
            <button key={i} className={`btn${o.primary ? ' gold' : ''}`} onClick={o.run}>{T(o.label)}</button>
          ))}
        </div>
      )}
    </div>
  )
}
