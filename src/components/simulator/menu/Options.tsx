import { T } from '../../../i18n/i18n'
import type { ChainMode } from '../../../game/gameEngine'
import { saveConfig, type MenuConfig } from './config'

export interface OptionsProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  onLanguageChange: (language: 'en' | 'es') => void
  onBack: () => void
}

const CHAIN_MODES: Array<[ChainMode, string]> = [['auto', 'Automáticas'], ['always', 'Preguntar siempre'], ['nunca', 'No activar nada']]
const LANGUAGES: Array<['en' | 'es', string]> = [['en', 'English'], ['es', 'Español']]
const TIMES: Array<[number, string]> = [[10, '10 s'], [15, '15 s'], [30, '30 s'], [0, 'Sin límite']]

/** Port of #pOpciones. */
export function Options({ cfg, setCfg, onLanguageChange, onBack }: OptionsProps) {
  const set = <K extends keyof MenuConfig>(field: K, value: MenuConfig[K]) => {
    const next = { ...cfg, [field]: value }
    setCfg(next); saveConfig(next)
  }
  return (
    <div className="mpant" id="pOpciones">
      <h2>{T('Opciones')}</h2>
      <label className="mlab">{T('Ventanas de respuesta')}</label>
      <div className="mrej" id="mCadenas">
        {CHAIN_MODES.map(([v, label]) => (
          <button key={v} className={v === cfg.chainMode ? 'sel' : ''} onClick={() => set('chainMode', v)}>{T(label)}</button>
        ))}
      </div>
      <p className="mnota">{T('Con "automáticas" solo se te pregunta cuando hay algo real a lo que responder. En el turno del rival siempre se pregunta.')}</p>
      <label className="mlab">Idioma</label>
      <div className="mrej" id="mIdioma">
        {LANGUAGES.map(([v, label]) => (
          <button key={v} className={v === cfg.language ? 'sel' : ''} onClick={() => { set('language', v); onLanguageChange(v) }}>{label}</button>
        ))}
      </div>
      <label className="mlab">{T('Tiempo para responder')}</label>
      <div className="mrej" id="mTiempo">
        {TIMES.map(([v, label]) => (
          <button key={v} className={v === cfg.chainTimeout ? 'sel' : ''} onClick={() => set('chainTimeout', v)}>{T(label)}</button>
        ))}
      </div>
      <button className="mvolver" id="volver2" onClick={onBack}>← {T('Volver')}</button>
    </div>
  )
}
