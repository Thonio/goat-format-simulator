/* Port of view.js's HUD pieces: setLP/toast/banner/announcePhase/
   setPhase/setControles/showDetail/alHistorial — each as a component
   driven by the GameSnapshot, instead of a function that writes to the DOM. */
import { useEffect, useRef, useState } from 'react'
import type { GameEngine, GameSnapshot } from '../../game/gameEngine'
import type { CardRow, NamesSubset } from '../../types/cards'

const IMG_BASE = 'https://images.ygoprodeck.com/images/cards/'
const T_MONSTER = 0x1, T_SPELL = 0x2

export function LpBar({ side, snapshot }: { side: 'me' | 'opp'; snapshot: GameSnapshot }) {
  const player = side === 'me' ? snapshot.me : ((1 - snapshot.me) as 0 | 1)
  const val = snapshot.lp[player]
  const prev = useRef(val)
  const [hurt, setHurt] = useState(false)
  useEffect(() => {
    if (val < prev.current) { setHurt(true); const t = setTimeout(() => setHurt(false), 700); prev.current = val; return () => clearTimeout(t) }
    prev.current = val
  }, [val])
  const avatar = side === 'me' ? snapshot.config?.myAvatar : snapshot.config?.opponentAvatar
  const who = side === 'me' ? 'You' : (snapshot.config?.opponentName ?? 'Opponent')
  return (
    <div id={side === 'me' ? 'lpMe' : 'lpOpp'} className={`lp${hurt ? ' hurt' : ''}`}>
      {avatar?.src && <img className="avat" src={avatar.src} alt="" />}
      <span className="quien">
        <span className="who">{avatar?.name ?? who}</span>
        <span className="val">{val}</span>
      </span>
    </div>
  )
}

const PH_MAP: Record<number, string> = { 1: 'DP', 2: 'SP', 4: 'M1', 8: 'BP', 16: 'BP', 32: 'BP', 64: 'BP', 128: 'BP', 256: 'M2', 512: 'EP' }
const PHASES: Array<[string, string]> = [['DP', 'Draw'], ['SP', 'Standby'], ['M1', 'Main 1'], ['BP', 'Battle'], ['M2', 'Main 2'], ['EP', 'End']]

export function PhasesStrip({ snapshot }: { snapshot: GameSnapshot }) {
  const id = PH_MAP[snapshot.phase] || 'M1'
  const hasSub = snapshot.timing && id === 'BP'
  return (
    <div id="phases">
      {PHASES.map(([k, n]) => (
        <div key={k} className={`ph${k === id ? ' on' : ''}${hasSub && k === id ? ' withSub' : ''}${hasSub && k === id && snapshot.timing === 'damage' ? ' inDamage' : ''}`}
          data-p={k} data-sub={hasSub && k === id ? (snapshot.timing === 'damage' ? 'Damage Step' : 'Attack declaration') : undefined}>
          {n}
        </div>
      ))}
    </div>
  )
}

export function ToastLayer({ snapshot }: { snapshot: GameSnapshot }) {
  return (
    <>
      <div id="log">
        {snapshot.toast && <div key={snapshot.toast.key} className="toast">{snapshot.toast.text}</div>}
      </div>
      <div id="banner" className={snapshot.banner ? 'show' : ''} key={snapshot.banner?.key ?? 0}
        style={{ color: snapshot.banner?.color }}>
        {snapshot.banner ? snapshot.banner.text : ''}
      </div>
    </>
  )
}

export function PhaseCardBanner({ snapshot }: { snapshot: GameSnapshot }) {
  if (!snapshot.phaseAnnounce) return <div id="phasecard" />
  const { text, sub, mine } = snapshot.phaseAnnounce
  return (
    <div id="phasecard" className={`show ${mine ? 'mine' : 'foe'}`}>
      <div className="pcmain">{text}</div>
      {sub && <div className="pcsub">{sub}</div>}
    </div>
  )
}

export function Controls({ engine, snapshot }: { engine: GameEngine; snapshot: GameSnapshot }) {
  const show = !!(snapshot.idle || snapshot.battle)
  if (!show) return <div id="controles" style={{ display: 'none' }} />
  const phaseText = snapshot.battle
    ? (snapshot.battle.toMainPhase2 ? 'To Main Phase 2' : 'End Battle Phase')
    : (snapshot.idle?.toBattlePhase ? 'To Battle Phase' : 'Next phase')
  return (
    <div id="controles" style={{ display: 'flex' }}>
      <button id="btnFase" className="cFase" onClick={() => engine.advancePhase()}>
        <span className="cIco">▶</span><span id="btnFaseTxt">{phaseText}</span>
      </button>
      <button id="btnFin" className="cFin" onClick={() => engine.endTurn()}>
        <span className="cIco">■</span>End turn
      </button>
    </div>
  )
}

export function Topbar({ engine, snapshot, onExit }: { engine: GameEngine; snapshot: GameSnapshot; onExit: () => void }) {
  const turnInfo = `Turn ${snapshot.turnCount} — ${snapshot.turnPlayer === snapshot.me ? 'you' : 'opponent'}`
  return (
    <div id="topbar">
      <span className="brand">Goat Format</span>
      <span style={{ color: '#5f7594', fontSize: 11 }}>ocgcore engine · 2005 rules</span>
      <span className="sep" />
      <span id="turnInfo" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'none' }}>{turnInfo}</span>
      <button className="btn" id="btnChain" onClick={() => engine.toggleChainMode()}>{chainLabel(snapshot)}</button>
      <button className="btn" id="btnLog" title="Download the match log to report a bug" onClick={() => downloadLog(engine)}>Download log</button>
      <button className="btn tiny" id="btnUnstick" title="Debug only" onClick={() => engine.forceUnstick()}>Force advance</button>
      <button className="btn danger" id="btnSurrender" title="Ends the duel as a loss" onClick={() => engine.askSurrenderConfirm()}>Surrender</button>
      <button className="btn" onClick={onExit}>Back to menu</button>
    </div>
  )
}

function chainLabel(s: GameSnapshot): string {
  return { auto: 'Chains: automatic', always: 'Chains: always ask', never: 'Chains: never activate' }[s.chainMode]
}

function downloadLog(engine: GameEngine) {
  const text = engine.buildLogText()
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'goat-log.txt'
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export function DetailPanel({ code, db, names, useImages }: { code: number | null; db: Map<number, CardRow>; names: NamesSubset; useImages: boolean }) {
  if (code == null) {
    return (
      <aside id="side"><div id="detail"><div className="empty">
        Hover a card to read its full text here.<br /><br />
        In Main Phase, drag a card from your hand onto the field to play it.
      </div></div></aside>
    )
  }
  const d = db.get(code)
  const mon = !!(d && d.type & T_MONSTER)
  const name = names[code]?.name ?? '#' + code
  const desc = names[code]?.desc ?? ''
  return (
    <aside id="side">
      <div id="detail">
        {useImages && <img className="dimg" src={`${IMG_BASE}${d?.alias || code}.jpg`} onError={(e) => { e.currentTarget.style.display = 'none' }} alt="" />}
        <h3>{name}</h3>
        <div className="dmeta">{mon ? `Level ${d?.level}` : (d && d.type & T_SPELL ? 'Spell Card' : 'Trap Card')}</div>
        {mon && <div className="dstats"><span>ATK {d?.attack}</span><span>DEF {d?.defense}</span></div>}
        <div className="dtext">{desc}</div>
      </div>
    </aside>
  )
}

export function CardHistory({ snapshot, db, useImages, onHover }: { snapshot: GameSnapshot; db: Map<number, CardRow>; useImages: boolean; onHover: (code: number) => void }) {
  return (
    <div id="historial">
      {snapshot.history.map((h) => (
        <div key={h.id} className={`hcarta ${h.mine ? 'mine' : 'theirs'}`} data-kind={h.kind}
          onMouseEnter={() => onHover(h.code)} onClick={() => onHover(h.code)}>
          {useImages
            ? <img src={`${IMG_BASE}${db.get(h.code)?.alias || h.code}.jpg`} loading="lazy" alt="" />
            : <span className="hnom">{h.code}</span>}
        </div>
      ))}
    </div>
  )
}
