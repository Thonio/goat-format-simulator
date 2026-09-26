import type { ChainMode } from '../../../game/gameEngine'
import { saveConfig, type MenuConfig } from './config'

export interface OptionsProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  onBack: () => void
}

const CHAIN_MODES: Array<[ChainMode, string]> = [['auto', 'Automatic'], ['always', 'Always ask'], ['never', 'Never activate']]
const TIMES: Array<[number, string]> = [[10, '10 s'], [15, '15 s'], [30, '30 s'], [0, 'No limit']]

/** Port of #pOpciones. */
export function Options({ cfg, setCfg, onBack }: OptionsProps) {
  const set = <K extends keyof MenuConfig>(field: K, value: MenuConfig[K]) => {
    const next = { ...cfg, [field]: value }
    setCfg(next); saveConfig(next)
  }
  return (
    <div className="mpant" id="pOpciones">
      <h2>Options</h2>
      <label className="mlab">Response windows</label>
      <div className="mrej" id="mCadenas">
        {CHAIN_MODES.map(([v, label]) => (
          <button key={v} className={v === cfg.chainMode ? 'selected' : ''} onClick={() => set('chainMode', v)}>{label}</button>
        ))}
      </div>
      <p className="mnota">With &quot;automatic&quot; you are only asked when there is something real to respond to. On the opponent&apos;s turn you are always asked.</p>
      <label className="mlab">Response timer</label>
      <div className="mrej" id="mTiempo">
        {TIMES.map(([v, label]) => (
          <button key={v} className={v === cfg.chainTimeout ? 'selected' : ''} onClick={() => set('chainTimeout', v)}>{label}</button>
        ))}
      </div>
      <button className="mvolver" id="volver2" onClick={onBack}>&larr; Back</button>
    </div>
  )
}
