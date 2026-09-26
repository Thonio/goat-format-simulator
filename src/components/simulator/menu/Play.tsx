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
      <h2>VS Duel</h2>
      <label className="mlab">Opponent difficulty</label>
      <div className="mrej" id="mNiveles">
        {LEVELS.map((lv) => (
          <button key={lv} className={lv === cfg.level ? 'selected' : ''} onClick={() => set('level', lv)}>{LEVEL_LABEL[lv]}</button>
        ))}
      </div>
      <label className="mlab">Your avatar</label>
      <div id="mAvatares">
        {Object.keys(AVATARS).map((k) => (
          <div key={k} className={'av' + (k === cfg.avatar ? ' selected' : '')} title={AVATARS[k].name} onClick={() => set('avatar', k)}>
            <img src={avatarSrc(k)} alt={AVATARS[k].name} />
          </div>
        ))}
      </div>
      <label className="mlab">Your deck</label>
      <div className="galeria" id="mGaleria">
        {all.map((m) => (
          <div key={m.id} className={'mz' + (m.id === cfg.deck ? ' selected' : '') + (m.warning ? ' invalid' : '')} onClick={() => set('deck', m.id)}>
            {m.cover ? <img loading="lazy" src={coverUrl(m)} alt="" /> : null}
            <span className="mzn">{m.name}</span>
            <span className="mzc">{m.main.length}{m.extra.length ? '+' + m.extra.length : ''}{m.warning ? ' ⚠' : ''}</span>
          </div>
        ))}
      </div>
      <div className="mnota" id="mMazoInfo">
        {!mine ? '' : mine.warning ? `⚠ ${mine.warning}: the Main Deck needs at least 40 cards` : `${mine.main.length} cards · checked against the official list`}
      </div>
      <label className="mlab">Opponent deck</label>
      <select id="mMazoIA" value={cfg.opponentDeck} onChange={(e) => set('opponentDeck', e.target.value)}>
        <option value="__random__">Random from the included decks</option>
        <option value="__same__">Same as yours</option>
        {all.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.main.length}{m.extra.length ? '+' + m.extra.length : ''}{m.warning ? ' ⚠' : ''}</option>)}
      </select>
      <button className="mbig" id="mJugar" onClick={() => onStart()}>Start duel</button>
      <button className="mvolver" id="volver1" onClick={onBack}>&larr; Back</button>
    </div>
  )
}
