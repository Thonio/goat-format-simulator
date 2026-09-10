/* Port of view.js's overlays: openZoneView/closeZoneView, confirmar,
   sorteo, pantallaFinal, and the choiceMenu/closeChoice context menu. */
import type { GameEngine, GameSnapshot } from '../../game/gameEngine'
import type { CardRow, NamesSubset } from '../../types/cards'
import { CardFront } from './Card'
import { T } from '../../i18n/i18n'

export function ZoneViewModal({ engine, snapshot, db, names, useImages }: {
  engine: GameEngine; snapshot: GameSnapshot; db: Map<number, CardRow>; names: NamesSubset; useImages: boolean
}) {
  const v = snapshot.zoneView
  if (!v) return <div id="zoneview" />
  return (
    <div id="zoneview" style={{ display: 'flex' }}>
      <div className="zvhead">
        <span>{T(v.title)}</span>
        <button className="zvclose" onClick={() => engine.closeZoneView()}>{T('Cerrar')}</button>
      </div>
      <div className="zvgrid">
        {!v.cards.length && <div className="zvempty">{T('No hay cartas aquí')}</div>}
        {v.cards.map((c, i) => (
          <div key={i} className="zvcard">
            <div className="card" style={{ position: 'static', width: '100%', height: '100%' }}>
              <div className="inner"><div className="face front"><CardFront code={c.code} db={db} names={names} useImages={useImages} /></div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ConfirmModal({ engine, snapshot }: { engine: GameEngine; snapshot: GameSnapshot }) {
  const c = snapshot.confirm
  if (!c) return <div id="confirm" />
  return (
    <div id="confirm" style={{ display: 'flex' }} onClick={() => engine.resolveConfirm(false)}>
      <div className="cfcaja" onClick={(e) => e.stopPropagation()}>
        <div className="cftit">{T(c.title)}</div>
        <div className="cftxt">{T(c.text)}</div>
        <div className="cfbtns">
          <button className="cfno" onClick={() => engine.resolveConfirm(false)}>{T('Seguir jugando')}</button>
          <button className="cfsi" onClick={() => engine.resolveConfirm(true)}>{T(c.etiquetaSi ?? 'Sí, rendirme')}</button>
        </div>
      </div>
    </div>
  )
}

export function CoinTossOverlay({ snapshot }: { snapshot: GameSnapshot }) {
  const c = snapshot.coinToss
  if (!c) return <div id="coin" />
  const cara = c.stage !== 'spinning' && c.empiezasTu
  const cruz = c.stage !== 'spinning' && !c.empiezasTu
  return (
    <div id="coin" style={{ display: 'flex', opacity: c.stage === 'hiding' ? 0 : 1 }}>
      <div className={`coinWrap ${c.stage === 'spinning' ? 'girando' : ''} ${cara ? 'cara' : ''} ${cruz ? 'cruz' : ''}`}>
        <div className="coinFace" />
      </div>
      <div className="coinTxt" style={{ color: c.stage === 'spinning' ? undefined : (c.empiezasTu ? 'var(--gold)' : '#ff8f7a') }}>
        {c.stage === 'spinning' ? T('Sorteo…') : T(c.empiezasTu ? 'Empiezas tú' : 'Empieza el rival')}
      </div>
    </div>
  )
}

export function EndScreen({ engine, snapshot, onNuevo }: { engine: GameEngine; snapshot: GameSnapshot; onNuevo: () => void }) {
  const r = snapshot.result
  if (!snapshot.finished || !r) return <div id="fin" />
  return (
    <div id="fin" className={`visible ${r.ganaste ? 'gana' : 'pierde'}`} style={{ display: 'flex' }}>
      <div className="finLuz" />
      <div className="finCaja">
        <div className="finTitulo">{T(r.ganaste ? 'VICTORIA' : 'DERROTA')}</div>
        <div className="finSub">{T(r.motivo)}</div>
        <div className="finDuelistas">
          <div className={`finD ${r.ganaste ? 'gana' : ''}`}>
            {r.avatarMio?.src && <img src={r.avatarMio.src} alt="" />}
            <span className="finN">{r.avatarMio?.nombre ?? T('Tú')}</span>
            <span className="finLP">{r.lpMio} LP</span>
          </div>
          <div className="finVs">VS</div>
          <div className={`finD ${r.ganaste ? '' : 'gana'}`}>
            {r.avatarRival?.src && <img src={r.avatarRival.src} alt="" />}
            <span className="finN">{r.avatarRival?.nombre ?? T('Oponente')}</span>
            <span className="finLP">{r.lpRival} LP</span>
          </div>
        </div>
        <div className="finDatos">{T(`${r.turnos} turnos`)}{r.nombreRival ? ` · ${r.nombreRival}` : ''}</div>
        <div className="finBotones">
          <button className="finBtn primario" onClick={onNuevo}>{T('Nuevo duelo')}</button>
          <button className="finBtn" onClick={() => engine.dismissResult()}>{T('Ver el tablero')}</button>
        </div>
      </div>
    </div>
  )
}

export function ChoiceMenuPopup({ snapshot }: { snapshot: GameSnapshot }) {
  const cm = snapshot.choiceMenu
  if (!cm) return <div id="choice" />
  return (
    <div id="choice" style={{ display: 'block', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', position: 'fixed' }}>
      <div className="ctitle">{T(cm.title)}</div>
      {cm.options.map((o, i) => (
        <button key={i} className={`cbtn${o.primary ? ' primary' : ''}`} onClick={o.run}>
          <span className="cico">•</span><span>{T(o.label)}</span>
        </button>
      ))}
    </div>
  )
}
