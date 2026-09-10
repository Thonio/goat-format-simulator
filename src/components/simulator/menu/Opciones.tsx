import { T } from '../../../i18n/i18n'
import type { ChainMode } from '../../../game/gameEngine'
import { saveConfig, type MenuConfig } from './config'

export interface OpcionesProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  onLanguageChange: (idioma: 'en' | 'es') => void
  onBack: () => void
}

const CADENAS: Array<[ChainMode, string]> = [['auto', 'Automáticas'], ['always', 'Preguntar siempre'], ['nunca', 'No activar nada']]
const IDIOMAS: Array<['en' | 'es', string]> = [['en', 'English'], ['es', 'Español']]
const TIEMPOS: Array<[number, string]> = [[10, '10 s'], [15, '15 s'], [30, '30 s'], [0, 'Sin límite']]

/** Port of #pOpciones. */
export function Opciones({ cfg, setCfg, onLanguageChange, onBack }: OpcionesProps) {
  const set = <K extends keyof MenuConfig>(campo: K, valor: MenuConfig[K]) => {
    const next = { ...cfg, [campo]: valor }
    setCfg(next); saveConfig(next)
  }
  return (
    <div className="mpant" id="pOpciones">
      <h2>{T('Opciones')}</h2>
      <label className="mlab">{T('Ventanas de respuesta')}</label>
      <div className="mrej" id="mCadenas">
        {CADENAS.map(([v, label]) => (
          <button key={v} className={v === cfg.cadenas ? 'sel' : ''} onClick={() => set('cadenas', v)}>{T(label)}</button>
        ))}
      </div>
      <p className="mnota">{T('Con "automáticas" solo se te pregunta cuando hay algo real a lo que responder. En el turno del rival siempre se pregunta.')}</p>
      <label className="mlab">Idioma</label>
      <div className="mrej" id="mIdioma">
        {IDIOMAS.map(([v, label]) => (
          <button key={v} className={v === cfg.idioma ? 'sel' : ''} onClick={() => { set('idioma', v); onLanguageChange(v) }}>{label}</button>
        ))}
      </div>
      <label className="mlab">{T('Tiempo para responder')}</label>
      <div className="mrej" id="mTiempo">
        {TIEMPOS.map(([v, label]) => (
          <button key={v} className={v === cfg.tiempo ? 'sel' : ''} onClick={() => set('tiempo', v)}>{T(label)}</button>
        ))}
      </div>
      <button className="mvolver" id="volver2" onClick={onBack}>← {T('Volver')}</button>
    </div>
  )
}
