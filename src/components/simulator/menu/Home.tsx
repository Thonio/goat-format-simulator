import { T } from '../../../i18n/i18n'

export interface HomeProps {
  onGo: (screen: 'play' | 'bots' | 'options') => void
}

/** Port of #pHome. */
export function Home({ onGo }: HomeProps) {
  return (
    <div className="mpant" id="pHome">
      <h1>GOAT FORMAT</h1>
      <p className="msub">{T('Motor de reglas de EDOPro · formato de abril de 2005')}</p>
      <button className="mbig" id="irBots" onClick={() => onGo('bots')}>{T('Modo Bots')}</button>
      <button className="mbig sec" id="irJugar" onClick={() => onGo('play')}>{T('Duelo VS')}</button>
      <button className="mbig sec" id="mDeck" onClick={() => { location.href = 'deckbuilder.html' }}>Deck Builder</button>
      <button className="mbig sec" id="irOpciones" onClick={() => onGo('options')}>{T('Opciones')}</button>
    </div>
  )
}
