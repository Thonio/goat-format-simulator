/* Card database row shapes, matching src/vendor/cards.subset.json and
   src/vendor/names.subset.json (the pool-trimmed derivatives used by the
   engine bundle — not src/data/pool_cards.json, the full untrimmed DB). */

/** Row shape as it comes out of the JSON file: `race` is a decimal string
 *  because it doesn't fit a JS number (it's a 64-bit bitfield). */
export interface CardRowRaw {
  code: number
  alias: number
  setcodes: number[]
  type: number
  level: number
  attribute: number
  race: string
  attack: number
  defense: number
  lscale: number
  rscale: number
  link_marker: number
  ot: number
}

/** Row shape as used by the engine (`race` converted to bigint), matching
 *  what duel.mjs/escenario.mjs did with `{...c, race:BigInt(c.race)}`. */
export interface CardRow extends Omit<CardRowRaw, 'race'> {
  race: bigint
}

export interface NameEntry {
  name: string
  desc: string
}

export type CardsSubset = Record<string, CardRowRaw>
export type NamesSubset = Record<string, NameEntry>

/** Builds the `code -> CardRow` map the way every script in this codebase
 *  does it: `{...c, race:BigInt(c.race)}`. */
export function buildCardDb(raw: CardsSubset): Map<number, CardRow> {
  const db = new Map<number, CardRow>()
  for (const k in raw) {
    const c = raw[k]
    db.set(c.code, { ...c, race: BigInt(c.race) })
  }
  return db
}
