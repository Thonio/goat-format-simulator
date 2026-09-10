/* Smoke test for the full flow: menu → pick "VS Duel" → "Start Duel" →
   the real board mounts. This doesn't replace a hand-played match in the
   browser, but it proves the App → GameEngine → DuelScreen wiring isn't
   broken. Runs in real time (no fake timers): loading the engine bundles
   and the initial coin toss take actual seconds, and mixing that with
   fake timers is fragile. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'

// labels are translated to English by default (idioma() starts at 'en'
// — see src/i18n/i18n.ts), so navigation happens by id, not by text.
describe('App', () => {
  it('del menú a un duelo real jugable', async () => {
    render(<App />)

    expect(screen.getByText('GOAT FORMAT')).toBeTruthy()
    fireEvent.click(document.getElementById('irJugar')!)
    expect(document.getElementById('mJugar')).toBeTruthy()

    fireEvent.click(document.getElementById('mJugar')!)

    // loading ocgcore.bundle.js + scripts.bundle.js (>1MB each) plus
    // the initial coin toss (~3.3s of real sleeps inside GameEngine.boot).
    await waitFor(() => {
      expect(document.querySelector('#grid')).toBeTruthy()
    }, { timeout: 20_000, interval: 200 })

    await waitFor(() => {
      expect(document.querySelectorAll('.card').length).toBeGreaterThan(0)
    }, { timeout: 10_000, interval: 200 })
  }, 35_000)
})
