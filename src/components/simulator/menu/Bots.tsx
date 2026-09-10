import { T } from '../../../i18n/i18n'
import type { CardsSubset } from '../../../types/cards'
import { AVATARS, LEVEL_LABEL, LEVELS, avatarSrc, listDecks, progress, saveConfig, type MenuConfig } from './config'
import type { StartOptions } from './Play'

export interface BotsProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  cardsRaw: CardsSubset | null
  onStart: (options?: StartOptions) => void
  onBack: () => void
}

/** Port of #pBots — "chess.com-style bot mode": every deck x every
 *  difficulty, with medals for the ones already beaten. */
export function Bots({ cfg, setCfg, cardsRaw, onStart, onBack }: BotsProps) {
  const all = listDecks(cardsRaw)
  // The deck YOU play with is picked right here too — same cfg.deck as "VS Duel".
  const currentDeck = all.find((m) => m.id === cfg.deck) ? cfg.deck : all[0]?.id
  const included = all.filter((m) => !m.custom && !m.warning)
  const prog = progress()
  const beaten = included.reduce((n, m) => n + LEVELS.filter((lv) => prog[m.id]?.[lv]).length, 0)
  const total = included.length * LEVELS.length
  const avatarKeys = Object.keys(AVATARS)

  return (
    <div className="mpant" id="pBots">
      <h2>{T('Modo Bots')}</h2>
      <p className="msub">{T('Gana a cada mazo en las cuatro dificultades.')}</p>
      <label className="mlab">{T('Tu mazo')}</label>
      <select id="bMazo" value={currentDeck} onChange={(e) => { const next = { ...cfg, deck: e.target.value }; setCfg(next); saveConfig(next) }}>
        {all.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.main.length}{m.warning ? ' ⚠' : ''}</option>)}
      </select>
      <div className="mnota" id="bResumen">{T(`${beaten} de ${total} retos superados`)}</div>
      <div id="mBots">
        {included.map((m, idx) => {
          const done = LEVELS.filter((lv) => prog[m.id]?.[lv]).length
          const avatar = avatarKeys[idx % avatarKeys.length]
          return (
            <div key={m.id} className={'bfila' + (done === LEVELS.length ? ' completo' : '')}>
              <img className="bcara" src={avatarSrc(avatar)} alt="" />
              <span className="bnom">{m.name}<small>{T(`${done}/${LEVELS.length} dificultades`)}</small></span>
              <span className="bniv">
                {LEVELS.map((lv, i) => (
                  <button key={lv} className={`bpip n${i}` + (prog[m.id]?.[lv] ? ' hecho' : '')}
                    title={`${m.name} · ${T(LEVEL_LABEL[lv])}`}
                    onClick={() => onStart({ opponentDeck: m.id, level: lv, challenge: { opponentDeck: m.id, level: lv } })}>
                    {(T(LEVEL_LABEL[lv]) ?? LEVEL_LABEL[lv]).slice(0, 3).toUpperCase()}
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
