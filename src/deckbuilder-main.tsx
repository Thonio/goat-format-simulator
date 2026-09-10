import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/deckbuilder.css'
import DeckBuilderApp from './components/deckbuilder/DeckBuilderApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeckBuilderApp />
  </StrictMode>,
)
