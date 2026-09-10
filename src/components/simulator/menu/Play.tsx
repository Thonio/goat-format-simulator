import { T } from '../../../i18n/i18n'
import type { CardsSubset } from '../../../types/cards'
import { AVATARS, LEVEL_LABEL, LEVELS, avatarSrc, listDecks, coverUrl, saveConfig, type Level, type MenuConfig } from './config'

export interface StartOptions { opponentDeck?: string; level?: Level; challenge?: { opponentDeck: string; level: Level } | null }

export interface PlayProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  cardsRaw: CardsSubset | null
  onStart: (options?: StartOptions) => void
  onBack: () => void
}

/** Port of #pJugar. */
export function Play({ cfg, setCfg, cardsRaw, onStart, onBack }: PlayProps) {
  const set = <K extends keyof MenuConfig>(field: K, value: MenuConfig[K]) => {
    const next = { ...cfg, [field]: value }
    setCfg(next); saveConfig(next)
  }
  const all = listDecks(cardsRaw)
  const mine = all.find((m) => m.id === cfg.deck) ?? all[0]

  return (
    <div className="mpant" id="pJugar">
      <h2>{T('Duelo VS')}</h2>
      <label className="mlab">{T('Dificultad del rival')}</label>
      <div className="mrej" id="mNiveles">
        {LEVELS.map((lv) => (
          <button key={lv} className={lv === cfg.level ? 'sel' : ''} onClick={() => set('level', lv)}>{T(LEVEL_LABEL[lv])}</button>
        ))}
      </div>
      <label className="mlab">{T('Tu avatar')}</label>
      <div id="mAvatares">
        {Object.keys(AVATARS).map((k) => (
          <div key={k} className={'av' + (k === cfg.avatar ? ' sel' : '')} title={AVATARS[k].n} onClick={() => set('avatar', k)}>
            <img src={avatarSrc(k)} alt={AVATARS[k].n} />
          </div>
        ))}
      </div>
      <label className="mlab">{T('Tu mazo')}</label>
      <div className="galeria" id="mGaleria">
        {all.map((m) => (
          <div key={m.id} className={'mz' + (m.id === cfg.deck ? ' sel' : '') + (m.warning ? ' mal' : '')} onClick={() => set('deck', m.id)}>
            {m.cover ? <img loading="lazy" src={coverUrl(m)} alt="" /> : null}
            <span className="mzn">{m.name}</span>
            <span className="mzc">{m.main.length}{m.extra.length ? '+' + m.extra.length : ''}{m.warning ? ' ⚠' : ''}</span>
          </div>
        ))}
      </div>
      <div className="mnota" id="mMazoInfo">
        {!mine ? '' : mine.warning ? T(`⚠ ${mine.warning}: el Main Deck necesita 40 como mínimo`) : T(`${mine.main.length} cartas · validado contra la lista oficial`)}
      </div>
      <label className="mlab">{T('Mazo del rival')}</label>
      <select id="mMazoIA" value={cfg.opponentDeck} onChange={(e) => set('opponentDeck', e.target.value)}>
        <option value="__azar__">{T('Al azar entre los incluidos')}</option>
        <option value="__mismo__">{T('El mismo que el tuyo')}</option>
        {all.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.main.length}{m.extra.length ? '+' + m.extra.length : ''}{m.warning ? ' ⚠' : ''}</option>)}
      </select>
      <button className="mbig" id="mJugar" onClick={() => onStart()}>{T('Empezar duelo')}</button>
      <button className="mvolver" id="volver1" onClick={onBack}>← {T('Volver')}</button>
    </div>
  )
}
