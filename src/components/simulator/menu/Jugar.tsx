import { T } from '../../../i18n/i18n'
import type { CardsSubset } from '../../../types/cards'
import { AVATARES, ETIQ_NIVEL, NIVELES, avatarSrc, listaMazos, portadaUrl, saveConfig, type MenuConfig, type Nivel } from './config'

export interface StartOptions { mazoIA?: string; nivel?: Nivel; reto?: { mazoRival: string; nivel: Nivel } | null }

export interface JugarProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  cardsRaw: CardsSubset | null
  onStart: (opciones?: StartOptions) => void
  onBack: () => void
}

/** Port of #pJugar. */
export function Jugar({ cfg, setCfg, cardsRaw, onStart, onBack }: JugarProps) {
  const set = <K extends keyof MenuConfig>(campo: K, valor: MenuConfig[K]) => {
    const next = { ...cfg, [campo]: valor }
    setCfg(next); saveConfig(next)
  }
  const todos = listaMazos(cardsRaw)
  const mio = todos.find((m) => m.id === cfg.mazo) ?? todos[0]

  return (
    <div className="mpant" id="pJugar">
      <h2>{T('Duelo VS')}</h2>
      <label className="mlab">{T('Dificultad del rival')}</label>
      <div className="mrej" id="mNiveles">
        {NIVELES.map((nv) => (
          <button key={nv} className={nv === cfg.nivel ? 'sel' : ''} onClick={() => set('nivel', nv)}>{T(ETIQ_NIVEL[nv])}</button>
        ))}
      </div>
      <label className="mlab">{T('Tu avatar')}</label>
      <div id="mAvatares">
        {Object.keys(AVATARES).map((k) => (
          <div key={k} className={'av' + (k === cfg.avatar ? ' sel' : '')} title={AVATARES[k].n} onClick={() => set('avatar', k)}>
            <img src={avatarSrc(k)} alt={AVATARES[k].n} />
          </div>
        ))}
      </div>
      <label className="mlab">{T('Tu mazo')}</label>
      <div className="galeria" id="mGaleria">
        {todos.map((m) => (
          <div key={m.id} className={'mz' + (m.id === cfg.mazo ? ' sel' : '') + (m.aviso ? ' mal' : '')} onClick={() => set('mazo', m.id)}>
            {m.portada ? <img loading="lazy" src={portadaUrl(m)} alt="" /> : null}
            <span className="mzn">{m.nombre}</span>
            <span className="mzc">{m.main.length}{m.extra.length ? '+' + m.extra.length : ''}{m.aviso ? ' ⚠' : ''}</span>
          </div>
        ))}
      </div>
      <div className="mnota" id="mMazoInfo">
        {!mio ? '' : mio.aviso ? T(`⚠ ${mio.aviso}: el Main Deck necesita 40 como mínimo`) : T(`${mio.main.length} cartas · validado contra la lista oficial`)}
      </div>
      <label className="mlab">{T('Mazo del rival')}</label>
      <select id="mMazoIA" value={cfg.mazoIA} onChange={(e) => set('mazoIA', e.target.value)}>
        <option value="__azar__">{T('Al azar entre los incluidos')}</option>
        <option value="__mismo__">{T('El mismo que el tuyo')}</option>
        {todos.map((m) => <option key={m.id} value={m.id}>{m.nombre} — {m.main.length}{m.extra.length ? '+' + m.extra.length : ''}{m.aviso ? ' ⚠' : ''}</option>)}
      </select>
      <button className="mbig" id="mJugar" onClick={() => onStart()}>{T('Empezar duelo')}</button>
      <button className="mvolver" id="volver1" onClick={onBack}>← {T('Volver')}</button>
    </div>
  )
}
