import { useState } from 'react'
import type { CardsSubset } from '../../../types/cards'
import { Home } from './Home'
import { Play, type StartOptions } from './Play'
import { Bots } from './Bots'
import { Options } from './Options'
import type { MenuConfig } from './config'

export interface MenuProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  cardsRaw: CardsSubset | null
  onStart: (options?: StartOptions) => void
  onLanguageChange: (language: 'en' | 'es') => void
}

type Screen = 'home' | 'play' | 'bots' | 'options'

/** Port of #menu — the "screen switcher" that in the original was each
 *  `.mpant`'s `hidden` attribute, here as React state. */
export function Menu({ cfg, setCfg, cardsRaw, onStart, onLanguageChange }: MenuProps) {
  const [screen, setScreen] = useState<Screen>('home')
  return (
    <div id="menu">
      <div className="mcaja">
        {screen === 'home' && <Home onGo={setScreen} />}
        {screen === 'play' && <Play cfg={cfg} setCfg={setCfg} cardsRaw={cardsRaw} onStart={onStart} onBack={() => setScreen('home')} />}
        {screen === 'bots' && <Bots cfg={cfg} setCfg={setCfg} cardsRaw={cardsRaw} onStart={onStart} onBack={() => setScreen('home')} />}
        {screen === 'options' && <Options cfg={cfg} setCfg={setCfg} onLanguageChange={onLanguageChange} onBack={() => setScreen('home')} />}
      </div>
    </div>
  )
}
