// @vitest-environment node
/* Port of the logic-level portion of check-idioma.mjs (T()/idioma()/setIdioma()
   behavior). The original file's `c2`/`c3` checks regex-scrape the built
   goat.html and deckbuilder.html for menu/CSS wiring strings (e.g. "hay
   selector de idioma en Opciones", "el deck builder usa la misma tabla") —
   those are UI-integration assertions with no meaning before the React menu
   and deck builder exist, so they aren't ported here; they belong in the
   UI-port phase once there's a real menu/DeckBuilder component to assert
   against. This file covers everything that's pure i18n-module behavior. */
import { beforeEach, describe, expect, it } from 'vitest'
import { T, language, setLanguage } from '../../src/i18n/i18n'

beforeEach(() => setLanguage('en'))

describe('i18n', () => {
  it('arranca en inglés', () => {
    expect(language()).toBe('en')
  })

  it('todas las frases de muestra se traducen (incluidas las que llevan datos dentro)', () => {
    const cases = [
      'Rendirse', '¿Quieres responder?', 'Damage Step', 'Cementerio', 'Invocar Sangan',
      'Cadena 2: Book of Moon', 'Turno 3 — Tú', 'Selecciona 1 carta(s)', '¿Seguro que quieres rendirte?',
      'Se revela la mano del rival', 'VICTORIA', 'Novato', 'Terminar turno', 'TU TURNO',
      '12 de 80 retos superados', 'Cementerio tu — 4 carta(s)', 'Declaración de ataque',
    ]
    const untranslated = cases.filter((c) => T(c) === c && c !== 'Damage Step')
    expect(untranslated).toEqual([])
    expect(T('Rendirse')).toBe('Surrender')
    expect(T('Cadena 2: Book of Moon')).toBe('Chain 2: Book of Moon')
    expect(T('Turno 3 — Tú')).toBe('Turn 3 — You')
    expect(T('12 de 80 retos superados')).toBe('12 of 80 challenges beaten')
  })

  it('en español el texto pasa tal cual', () => {
    setLanguage('es')
    expect(T('Rendirse')).toBe('Rendirse')
    expect(T('Cadena 2: Book of Moon')).toBe('Cadena 2: Book of Moon')
  })
})
