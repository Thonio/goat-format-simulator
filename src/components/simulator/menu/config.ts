/* Port of template.html's inline menu logic (it was never its own module
   in the original — it lived in the <script> at the end of the file).
   localStorage keys unchanged (`goatConfig`, `goatDecks`, `goatProgreso`)
   so an existing user's config/decks/progress keep working. */
import { LEVELS, type Level } from '../../../engine/ai/brain'
import type { ChainMode } from '../../../game/gameEngine'
import type { CardsSubset } from '../../../types/cards'
import decksData from '../../../data/mazos.json'
import avatarsData from '../../../data/avatares.json'

export interface MenuConfig {
  level: Level
  chainMode: ChainMode
  chainTimeout: number
  deck: string
  opponentDeck: string
  avatar: string
  language: 'en' | 'es'
}

export const DEFAULT_CONFIG: MenuConfig = {
  level: 'duro', chainMode: 'auto', chainTimeout: 15, deck: 'i0', opponentDeck: '__azar__',
  avatar: 'yamiyugi', language: 'en',
}

export function loadConfig(): MenuConfig {
  const cfg = { ...DEFAULT_CONFIG }
  try { Object.assign(cfg, JSON.parse(localStorage.getItem('goatConfig') || '{}')) } catch { /* localStorage unavailable */ }
  return cfg
}
export function saveConfig(cfg: MenuConfig) {
  try { localStorage.setItem('goatConfig', JSON.stringify(cfg)) } catch { /* localStorage unavailable */ }
}

export interface SavedDeck { name: string; main: number[]; extra: number[]; side?: number[] }
export interface ListedDeck {
  id: string; name: string; main: number[]; extra: number[]
  warning: string | null; cover: number | string | null; custom: boolean
}

/** Custom decks saved from the deck builder — same key/shape that
 *  `app.js` (CLAVE="goatDecks") writes, so it keeps working once the
 *  deck builder is also ported. */
export function savedDecks(): SavedDeck[] {
  try {
    const a = JSON.parse(localStorage.getItem('goatDecks') || '[]')
    return Array.isArray(a) ? a : []
  } catch { return [] }
}

/** Full list: the 20 built-in decks (id "i<n>") + your own (id "u<n>").
 *  `cardsRaw` (the pool loaded from the bundle) is only needed to pick a
 *  custom deck's cover art (its highest-ATK monster); without it loaded
 *  yet, a custom deck comes out with no cover art. */
export function listDecks(cardsRaw: CardsSubset | null): ListedDeck[] {
  const l: ListedDeck[] = (decksData as Array<{ nombre: string; main: number[]; extra: number[]; aviso: string | null; portada: number }>)
    .map((m, i) => ({ id: 'i' + i, name: m.nombre, main: m.main, extra: m.extra, warning: m.aviso, cover: m.portada, custom: false }))
  savedDecks().forEach((m, i) => {
    let best: number | string | null = null, mx = -1
    if (cardsRaw) {
      for (const c of m.main) {
        const d = cardsRaw[String(c)]
        if (d && (d.type & 1) && d.attack > mx) { mx = d.attack; best = d.alias || c }
      }
    }
    l.push({
      id: 'u' + i, name: m.name + ' (tuyo)', main: m.main, extra: m.extra,
      warning: m.main.length < 40 ? 'solo ' + m.main.length + ' cartas' : null,
      cover: best, custom: true,
    })
  })
  return l
}
export const findDeck = (cardsRaw: CardsSubset | null, id: string): ListedDeck | null =>
  listDecks(cardsRaw).find((m) => m.id === id) ?? null

export const coverUrl = (m: ListedDeck): string =>
  m.cover ? `https://images.ygoprodeck.com/images/cards_cropped/${m.cover}.jpg` : ''

/* Avatars: 88px WebP as base64, inside the data bundle itself. The
   opponent is always Roland, the one who deals in the anime. */
export const AVATARS = avatarsData as Record<string, { n: string; d: string }>
export const AVATAR_AI = 'roland'
export const avatarSrc = (k: string): string => AVATARS[k] ? 'data:image/webp;base64,' + AVATARS[k].d : ''
export const avatarName = (k: string): string => AVATARS[k]?.n ?? 'Oponente'

export const LEVEL_LABEL: Record<Level, string> = { novato: 'Novato', normal: 'Normal', duro: 'Duro', experto: 'Experto' }

/** Bot-mode progress: {deckId:{level:true}} — same key that
 *  GameEngine.recordVictory() writes (src/game/gameEngine.ts). */
export function progress(): Record<string, Partial<Record<Level, boolean>>> {
  try { return JSON.parse(localStorage.getItem('goatProgreso') || '{}') } catch { return {} }
}

export { LEVELS }
export type { Level }
