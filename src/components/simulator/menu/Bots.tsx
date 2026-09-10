import { T } from '../../../i18n/i18n'
import type { CardsSubset } from '../../../types/cards'
import { AVATARES, ETIQ_NIVEL, NIVELES, avatarSrc, listaMazos, progreso, saveConfig, type MenuConfig } from './config'
import type { StartOptions } from './Jugar'

export interface BotsProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  cardsRaw: CardsSubset | null
  onStart: (opciones?: StartOptions) => void
  onBack: () => void
}

/** Port of #pBots — "chess.com-style bot mode": every deck x every
 *  difficulty, with medals for the ones already beaten. */
export function Bots({ cfg, setCfg, cardsRaw, onStart, onBack }: BotsProps) {
  const todos = listaMazos(cardsRaw)
  // The deck YOU play with is picked right here too — same cfg.mazo as "VS Duel".
  const mazoActual = todos.find((m) => m.id === cfg.mazo) ? cfg.mazo : todos[0]?.id
  const incluidos = todos.filter((m) => !m.propio && !m.aviso)
  const prog = progreso()
  const ganados = incluidos.reduce((n, m) => n + NIVELES.filter((nv) => prog[m.id]?.[nv]).length, 0)
  const total = incluidos.length * NIVELES.length
  const avatarKeys = Object.keys(AVATARES)

  return (
    <div className="mpant" id="pBots">
      <h2>{T('Modo Bots')}</h2>
      <p className="msub">{T('Gana a cada mazo en las cuatro dificultades.')}</p>
      <label className="mlab">{T('Tu mazo')}</label>
      <select id="bMazo" value={mazoActual} onChange={(e) => { const next = { ...cfg, mazo: e.target.value }; setCfg(next); saveConfig(next) }}>
        {todos.map((m) => <option key={m.id} value={m.id}>{m.nombre} — {m.main.length}{m.aviso ? ' ⚠' : ''}</option>)}
      </select>
      <div className="mnota" id="bResumen">{T(`${ganados} de ${total} retos superados`)}</div>
      <div id="mBots">
        {incluidos.map((m, idx) => {
          const hechos = NIVELES.filter((nv) => prog[m.id]?.[nv]).length
          const cara = avatarKeys[idx % avatarKeys.length]
          return (
            <div key={m.id} className={'bfila' + (hechos === NIVELES.length ? ' completo' : '')}>
              <img className="bcara" src={avatarSrc(cara)} alt="" />
              <span className="bnom">{m.nombre}<small>{T(`${hechos}/${NIVELES.length} dificultades`)}</small></span>
              <span className="bniv">
                {NIVELES.map((nv, i) => (
                  <button key={nv} className={`bpip n${i}` + (prog[m.id]?.[nv] ? ' hecho' : '')}
                    title={`${m.nombre} · ${T(ETIQ_NIVEL[nv])}`}
                    onClick={() => onStart({ mazoIA: m.id, nivel: nv, reto: { mazoRival: m.id, nivel: nv } })}>
                    {(T(ETIQ_NIVEL[nv]) ?? ETIQ_NIVEL[nv]).slice(0, 3).toUpperCase()}
                  </button>
                ))}
              </span>
            </div>
          )
        })}
      </div>
      <button className="mvolver" id="volver3" onClick={onBack}>← {T('Volver')}</button>
    </div>
  )
}
