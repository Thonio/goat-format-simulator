/* Port of view.js's HUD pieces: setLP/toast/banner/announcePhase/
   setPhase/setControles/showDetail/alHistorial — each as a component
   driven by the GameSnapshot, instead of a function that writes to the DOM. */
import { useEffect, useRef, useState } from 'react'
import type { GameEngine, GameSnapshot } from '../../game/gameEngine'
import type { CardRow, NamesSubset } from '../../types/cards'
import { T } from '../../i18n/i18n'

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
  const who = side === 'me' ? T('Tú') : (snapshot.config?.opponentName ?? T('Oponente'))
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
        <div key={k} className={`ph${k === id ? ' on' : ''}${hasSub && k === id ? ' conSub' : ''}${hasSub && k === id && snapshot.timing === 'damage' ? ' enDamage' : ''}`}
          data-p={k} data-sub={hasSub && k === id ? T(snapshot.timing === 'damage' ? 'Damage Step' : 'Declaración de ataque') : undefined}>
          {T(n)}
        </div>
      ))}
    </div>
  )
}

export function ToastLayer({ snapshot }: { snapshot: GameSnapshot }) {
  return (
    <>
      <div id="log">
        {snapshot.toast && <div key={snapshot.toast.key} className="toast">{T(snapshot.toast.text)}</div>}
      </div>
      <div id="banner" className={snapshot.banner ? 'show' : ''} key={snapshot.banner?.key ?? 0}
        style={{ color: snapshot.banner?.color }}>
        {snapshot.banner ? T(snapshot.banner.text) : ''}
      </div>
    </>
  )
}

export function PhaseCardBanner({ snapshot }: { snapshot: GameSnapshot }) {
  if (!snapshot.phaseAnnounce) return <div id="phasecard" />
  const { text, sub, mine } = snapshot.phaseAnnounce
  return (
    <div id="phasecard" className={`show ${mine ? 'mine' : 'foe'}`}>
      <div className="pcmain">{T(text)}</div>
      {sub && <div className="pcsub">{T(sub)}</div>}
    </div>
  )
}

export function Controls({ engine, snapshot }: { engine: GameEngine; snapshot: GameSnapshot }) {
  const show = !!(snapshot.idle || snapshot.battle)
  if (!show) return <div id="controles" style={{ display: 'none' }} />
  const phaseText = snapshot.battle
    ? (snapshot.battle.toMainPhase2 ? 'A Main Phase 2' : 'Terminar Battle Phase')
    : (snapshot.idle?.toBattlePhase ? 'A Battle Phase' : 'Siguiente fase')
  return (
    <div id="controles" style={{ display: 'flex' }}>
      <button id="btnFase" className="cFase" onClick={() => engine.advancePhase()}>
        <span className="cIco">▶</span><span id="btnFaseTxt">{T(phaseText)}</span>
      </button>
      <button id="btnFin" className="cFin" onClick={() => engine.endTurn()}>
        <span className="cIco">■</span>{T('Terminar turno')}
      </button>
    </div>
  )
}

export function Topbar({ engine, snapshot, onExit }: { engine: GameEngine; snapshot: GameSnapshot; onExit: () => void }) {
  const turnInfo = `${T('Turno')} ${snapshot.turnCount} — ${snapshot.turnPlayer === snapshot.me ? T('tú') : T('rival')}`
  return (
    <div id="topbar">
      <span className="brand">Goat Format</span>
      <span style={{ color: '#5f7594', fontSize: 11 }}>motor ocgcore · reglas 2005</span>
      <span className="sep" />
      <span id="turnInfo" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'none' }}>{turnInfo}</span>
      <button className="btn" id="btnChain" onClick={() => engine.toggleChainMode()}>{T(chainLabel(snapshot))}</button>
      <button className="btn" id="btnLog" title="Descarga el historial para enviarlo" onClick={() => downloadLog(engine)}>{T('Descargar log')}</button>
      <button className="btn tiny" id="btnUnstick" title="Solo para depurar" onClick={() => engine.forceUnstick()}>{T('Desatascar')}</button>
      <button className="btn peligro" id="btnRendirse" title="Termina el duelo como derrota" onClick={() => engine.askSurrenderConfirm()}>{T('Rendirse')}</button>
      <button className="btn" onClick={onExit}>{T('Salir al menú')}</button>
    </div>
  )
}

function chainLabel(s: GameSnapshot): string {
  return { auto: 'Cadenas: automáticas', always: 'Cadenas: preguntar siempre', nunca: 'Cadenas: no activar nada' }[s.chainMode]
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
        {T('Pasa el ratón por una carta para ver su texto completo aquí.')}<br /><br />
        {T('En Main Phase, arrastra una carta de tu mano al tablero para jugarla.')}
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
        <div className="dmeta">{mon ? T('Nivel ' + d?.level) : T(d && d.type & T_SPELL ? 'Carta Mágica' : 'Carta de Trampa')}</div>
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
        <div key={h.id} className={`hcarta ${h.mine ? 'mia' : 'suya'}`} data-kind={h.kind}
          onMouseEnter={() => onHover(h.code)} onClick={() => onHover(h.code)}>
          {useImages
            ? <img src={`${IMG_BASE}${db.get(h.code)?.alias || h.code}.jpg`} loading="lazy" alt="" />
            : <span className="hnom">{h.code}</span>}
        </div>
      ))}
    </div>
  )
}
