/* ══════════════════════════════════════════════════════════════════
   CARD KNOWLEDGE — indexed by NAME, not passcode.

   Key design point: adding a new deck should mean adding rows here,
   never writing code. WindBot, EDOPro's AI, does the opposite (an
   "executor" programmed per deck), which is why it only plays well the
   decks someone hand-programmed. With 20+ decks ahead of us, this has
   to be a table.
   ══════════════════════════════════════════════════════════════════ */
import type { CardRow } from '../../types/cards'

export interface CardInfo {
  // getCardInfo() always sets these (every branch does, including the fallback);
  // only evaluar.ts's infoOf() can hand back a bare {} (an unnamed card),
  // which it types as Partial<CardInfo> rather than widening these to optional.
  role: string
  value: number
  when?: string
  note?: string
  quick?: boolean
  reactive?: boolean
  lpCost?: number | boolean
  vulnerable?: boolean
  noSet?: boolean
  noAttackAfterEffect?: boolean
  prefersSet?: boolean
  restrictsSummon?: boolean
  attacksAll?: boolean
  piercing?: boolean
  drawsOnHit?: boolean
  breaksBackrow?: boolean
  inferred?: boolean
}

// The canonical name ignores variants: "Scapegoat (GOAT)" → "Scapegoat"
export const canon = (n: string | null | undefined): string =>
  String(n || '').replace(/\s*\((GOAT|Pre-errata|Anime)\)\s*$/i, '').trim()

/* role: what it's for · value: how much it hurts to lose it (in "cards")
   when: usage policy · note: why (for the AI's log) */
export const CARDS: Record<string, CardInfo> = {
  // ── Advantage engines ──────────────────────────────────────────
  'Pot of Greed': { role: 'draw', value: 2.0, when: 'always' },
  'Graceful Charity': {
    role: 'draw', value: 2.0, when: 'withGoodDiscard',
    note: 'Hold it until you have Sinister Serpent or another free discard',
  },
  'Delinquent Duo': {
    role: 'handRip', value: 1.8, when: 'noOpponentSerpent',
    note: "If the opponent has Sinister Serpent in hand, it's neutralized",
  },
  'Card Destruction': { role: 'draw', value: 1.2, when: 'withBadHand' },

  // ── Single-target removal ────────────────────────────────────────────
  'Smashing Ground': { role: 'removal', value: 1.0, when: 'ifThereIsAThreat' },
  'Nobleman of Crossout': {
    role: 'removal', value: 1.2, when: 'againstFaceDown',
    note: 'Only against set monsters; banishing kills flip effects',
  },
  'Ring of Destruction': {
    role: 'removal', value: 1.6, when: 'bigThreat', quick: true,
    note: "Not normal removal: save it for something big, or to finish the game",
  },
  'Exiled Force': { role: 'removal', value: 1.0, when: 'ifThereIsAThreat' },
  'Tribe-Infecting Virus': { role: 'removal', value: 1.2, when: 'cheapDiscard' },
  'Chaos Sorcerer': { role: 'removal', value: 1.6, when: 'ifThereIsAThreat', noAttackAfterEffect: true },
  'D.D. Warrior Lady': { role: 'trade', value: 1.0 },
  'Sakuretsu Armor': { role: 'trapRemoval', value: 0.9, reactive: true },
  'Mirror Force': { role: 'trapMass', value: 1.6, reactive: true },
  'Torrential Tribute': {
    role: 'trapMass', value: 1.6, reactive: true,
    note: 'Punishes summoning after removal has already been spent',
  },
  'Solemn Judgment': { role: 'counter', value: 1.4, reactive: true, lpCost: 0.5 },

  // ── Mass and spell removal ─────────────────────────────────
  'Heavy Storm': {
    role: 'massRemoval', value: 1.8, when: 'powerPlay',
    note: 'Only when it sets up a strong play, not just to clear the board',
  },
  'Mystical Space Typhoon': {
    role: 'spellRemoval', value: 1.0, when: 'againstEquipOrRevival', quick: true,
    note: 'Save it for Snatch Steal, Premature Burial or Call of the Haunted',
  },
  'Dust Tornado': { role: 'spellRemoval', value: 1.0, reactive: true },

  // ── Control and tempo ─────────────────────────────────────────────
  'Scapegoat': {
    role: 'stall', value: 1.2, quick: true, restrictsSummon: true,
    note: "Don't use it on your own turn: it blocks your summon. Chain it in the opponent's End Phase",
  },
  'Book of Moon': {
    role: 'trick', value: 1.1, quick: true,
    note: 'Cuts attacks, turns off effects and sets up Nobleman',
  },
  'Tsukuyomi': {
    role: 'trick', value: 1.4,
    note: 'Reuses your flip effects and shuts down opposing monsters',
  },
  'Thousand-Eyes Restrict': {
    role: 'lock', value: 2.0, when: 'withGoodTarget',
    note: "Without a strong opposing monster to absorb, it's not worth it",
  },
  'Metamorphosis': { role: 'fusion', value: 1.4, when: 'withGoodTarget' },

  // ── Revival and stealing ──────────────────────────────────────────
  'Premature Burial': { role: 'revival', value: 1.3, lpCost: 800, vulnerable: true },
  'Call of the Haunted': {
    role: 'revival', value: 1.3, vulnerable: true,
    note: "Best used aggressively; in defense the opponent gets to respond to it",
  },
  'Snatch Steal': { role: 'equipSteal', value: 1.6, vulnerable: true },

  // ── Monsters with a role ───────────────────────────────────────
  'Sinister Serpent': {
    role: 'resource', value: 1.5, noSet: true,
    note: 'Worth more in hand: protects against Delinquent Duo and feeds discards',
  },
  'Sangan': {
    role: 'floater', value: 1.2, noSet: true,
    note: 'Set, it dies to Nobleman; use it attacking',
  },
  'Mystic Tomato': { role: 'floater', value: 1.1 },
  'Magician of Faith': { role: 'flip', value: 1.4, prefersSet: true },
  'Dekoichi the Battlechanted Locomotive': { role: 'flip', value: 1.2, prefersSet: true },
  'Night Assailant': { role: 'flip', value: 1.1, prefersSet: true },
  'Asura Priest': { role: 'beater', value: 1.3, attacksAll: true },
  'Airknight Parshath': { role: 'beater', value: 1.6, piercing: true, drawsOnHit: true },
  'Breaker the Magical Warrior': { role: 'beater', value: 1.4, breaksBackrow: true },
  'Black Luster Soldier - Envoy of the Beginning': { role: 'bomb', value: 2.2 },
}

/* When a card isn't in the table, it's inferred from the card's own data.
   That way the AI engine is never left speechless by a new deck. */
export function getCardInfo(name: string, data: CardRow | null | undefined): CardInfo {
  const k = CARDS[canon(name)]
  if (k) return k
  const t = data?.type ?? 0
  if (t & 0x1) { // monster
    const atk = data?.attack ?? 0
    return {
      role: atk >= 1900 ? 'beater' : atk >= 1500 ? 'beater' : 'chaff',
      value: atk >= 2400 ? 1.6 : atk >= 1700 ? 1.1 : 0.8, inferred: true,
    }
  }
  if (t & 0x4) return { role: 'trapRemoval', value: 1.0, reactive: true, inferred: true }
  if (t & 0x2) return { role: 'spell', value: 1.0, inferred: true }
  return { role: 'unknown', value: 1.0, inferred: true }
}
