/* Port of view.js's overlays: openZoneView/closeZoneView, confirmar,
   sorteo, pantallaFinal, and the choiceMenu/closeChoice context menu. */
import type { GameEngine, GameSnapshot } from '../../game/gameEngine'
import type { CardRow, NamesSubset } from '../../types/cards'
import { CardFront } from './Card'

export function ZoneViewModal({ engine, snapshot, db, names, useImages }: {
  engine: GameEngine; snapshot: GameSnapshot; db: Map<number, CardRow>; names: NamesSubset; useImages: boolean
}) {
  const v = snapshot.zoneView
  if (!v) return <div id="zoneview" />
  return (
    <div id="zoneview" style={{ display: 'flex' }}>
      <div className="zvhead">
        <span>{v.title}</span>
        <button className="zvclose" onClick={() => engine.closeZoneView()}>Close</button>
      </div>
      <div className="zvgrid">
        {!v.cards.length && <div className="zvempty">No cards here</div>}
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
        <div className="cftit">{c.title}</div>
        <div className="cftxt">{c.text}</div>
        <div className="cfbtns">
          <button className="cfno" onClick={() => engine.resolveConfirm(false)}>Keep playing</button>
          <button className="cfsi" onClick={() => engine.resolveConfirm(true)}>{c.yesLabel ?? 'Yes, surrender'}</button>
        </div>
      </div>
    </div>
  )
}

export function CoinTossOverlay({ snapshot }: { snapshot: GameSnapshot }) {
  const c = snapshot.coinToss
  if (!c) return <div id="coin" />
  const heads = c.stage !== 'spinning' && c.youStart
  const tails = c.stage !== 'spinning' && !c.youStart
  return (
    <div id="coin" style={{ display: 'flex', opacity: c.stage === 'hiding' ? 0 : 1 }}>
      <div className={`coinWrap ${c.stage === 'spinning' ? 'spinning' : ''} ${heads ? 'heads' : ''} ${tails ? 'tails' : ''}`}>
        <div className="coinFace" />
      </div>
      <div className="coinTxt" style={{ color: c.stage === 'spinning' ? undefined : (c.youStart ? 'var(--gold)' : '#ff8f7a') }}>
        {c.stage === 'spinning' ? 'Coin toss…' : (c.youStart ? 'You go first' : 'Opponent goes first')}
      </div>
    </div>
  )
}

export function EndScreen({ engine, snapshot, onNew }: { engine: GameEngine; snapshot: GameSnapshot; onNew: () => void }) {
  const r = snapshot.result
  if (!snapshot.finished || !r) return <div id="fin" />
  return (
    <div id="fin" className={`visible ${r.won ? 'wins' : 'loses'}`} style={{ display: 'flex' }}>
      <div className="finLuz" />
      <div className="finCaja">
        <div className="finTitulo">{r.won ? 'VICTORY' : 'DEFEAT'}</div>
        <div className="finSub">{r.reason}</div>
        <div className="finDuelistas">
          <div className={`finD ${r.won ? 'wins' : ''}`}>
            {r.myAvatar?.src && <img src={r.myAvatar.src} alt="" />}
            <span className="finN">{r.myAvatar?.name ?? 'You'}</span>
            <span className="finLP">{r.myLp} LP</span>
          </div>
          <div className="finVs">VS</div>
          <div className={`finD ${r.won ? '' : 'wins'}`}>
            {r.opponentAvatar?.src && <img src={r.opponentAvatar.src} alt="" />}
            <span className="finN">{r.opponentAvatar?.name ?? 'Opponent'}</span>
            <span className="finLP">{r.opponentLp} LP</span>
          </div>
        </div>
        <div className="finDatos">{r.turns} turns{r.opponentName ? ` · ${r.opponentName}` : ''}</div>
        <div className="finBotones">
          <button className="finBtn primary" onClick={onNew}>New duel</button>
          <button className="finBtn" onClick={() => engine.dismissResult()}>Look at the board</button>
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
      <div className="ctitle">{cm.title}</div>
      {cm.options.map((o, i) => (
        <button key={i} className={`cbtn${o.primary ? ' primary' : ''}`} onClick={o.run}>
          <span className="cico">•</span><span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
