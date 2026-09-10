import { useState } from 'react'
import type { CardsSubset } from '../../../types/cards'
import { Home } from './Home'
import { Jugar, type StartOptions } from './Jugar'
import { Bots } from './Bots'
import { Opciones } from './Opciones'
import type { MenuConfig } from './config'

export interface MenuProps {
  cfg: MenuConfig
  setCfg: (cfg: MenuConfig) => void
  cardsRaw: CardsSubset | null
  onStart: (opciones?: StartOptions) => void
  onLanguageChange: (idioma: 'en' | 'es') => void
}

type Pantalla = 'home' | 'jugar' | 'bots' | 'opciones'

/** Port of #menu — the "screen switcher" that in the original was each
 *  `.mpant`'s `hidden` attribute, here as React state. */
export function Menu({ cfg, setCfg, cardsRaw, onStart, onLanguageChange }: MenuProps) {
  const [pantalla, setPantalla] = useState<Pantalla>('home')
  return (
    <div id="menu">
      <div className="mcaja">
        {pantalla === 'home' && <Home onGo={setPantalla} />}
        {pantalla === 'jugar' && <Jugar cfg={cfg} setCfg={setCfg} cardsRaw={cardsRaw} onStart={onStart} onBack={() => setPantalla('home')} />}
        {pantalla === 'bots' && <Bots cfg={cfg} setCfg={setCfg} cardsRaw={cardsRaw} onStart={onStart} onBack={() => setPantalla('home')} />}
        {pantalla === 'opciones' && <Opciones cfg={cfg} setCfg={setCfg} onLanguageChange={onLanguageChange} onBack={() => setPantalla('home')} />}
      </div>
    </div>
  )
}
