export interface HomeProps {
  onGo: (screen: 'play' | 'bots' | 'options') => void
}

/** Port of #pHome. */
export function Home({ onGo }: HomeProps) {
  return (
    <div className="mpant" id="pHome">
      <h1>GOAT FORMAT</h1>
      <p className="msub">EDOPro rules engine &middot; April 2005 format</p>
      <button className="mbig" id="irBots" onClick={() => onGo('bots')}>Bot Mode</button>
      <button className="mbig sec" id="irJugar" onClick={() => onGo('play')}>VS Duel</button>
      <button className="mbig sec" id="mDeck" onClick={() => { location.href = 'deckbuilder.html' }}>Deck Builder</button>
      <button className="mbig sec" id="irOpciones" onClick={() => onGo('options')}>Options</button>
    </div>
  )
}
