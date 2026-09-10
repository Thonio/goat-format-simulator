/* ════════════════════════════════════════════════════════════════
   SCENARIO BANK

   Assembles a game with whatever board you ask for — specific cards
   in the field, hand, graveyard or deck — and drives it with a script.
   Used to check RULINGS: how the engine behaves in an exact situation,
   without depending on it coming up by chance in a full game.

   Deliberately doesn't use `duel.mjs`'s mirror: it asks the engine via
   `duelQueryLocation`, so what it verifies is ocgcore, not our own copy
   of the state.
   ════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as X from '../../src/vendor/ocgcore.bundle.js'
import { scriptReader } from '../../src/vendor/scripts.bundle.js'
import { makeAutoPlayer } from '../../src/engine/autopilot'
import { makeTrivialResolver } from '../../src/engine/trivial'
import type { CardsSubset, NamesSubset } from '../../src/types/cards'
import type { OcgHandle, OcgLib, OcgMessage } from '../../src/types/ocgcore'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

const raw: CardsSubset = JSON.parse(readFileSync(here('../../src/vendor/cards.subset.json'), 'utf-8'))
export const NAMES: NamesSubset = JSON.parse(readFileSync(here('../../src/vendor/names.subset.json'), 'utf-8'))
export const DB = new Map<number, ReturnType<typeof buildRow>>()
function buildRow(c: CardsSubset[string]) { return { ...c, race: BigInt(c.race) } }
for (const k in raw) { const c = raw[k]; DB.set(c.code, buildRow(c)) }

/* BIG GOTCHA: only pool cards carry their Lua script inside the bundle.
   Many Goat cards exist in the database under two codes — the normal one
   and the "(GOAT)" or "(Pre-Errata)" version — and the one in the pool is
   usually the second. If you build a scenario with the wrong code, the
   card shows up but HAS NO EFFECT, and the scenario lies without giving
   any error. That's why lookups here go by base name and the pool one wins. */
const POOL = new Set<number>(JSON.parse(readFileSync(here('../../src/data/goat-pool.json'), 'utf-8')).map(Number))
const base = (n: string) => String(n).replace(/\s*\((GOAT|Pre-Errata|Anime|Action Field)\)\s*$/i, '').trim()
const BY_NAME = new Map<string, number>()
for (const code in NAMES) {
  const n = NAMES[code]?.name
  if (!n) continue
  for (const key of new Set([n, base(n)])) {
    const previous = BY_NAME.get(key)
    if (previous === undefined || (!POOL.has(previous) && POOL.has(+code))) BY_NAME.set(key, +code)
  }
}
export function code(name: string): number {
  const c = BY_NAME.get(name) ?? BY_NAME.get(base(name))
  if (!c) throw new Error(`no existe la carta "${name}" en la base`)
  if (!POOL.has(c)) throw new Error(
    `"${name}" (${c}) no está en el pool de Goat: no lleva script y no haría nada`)
  return c
}
export const nameOf = (cardCode: number) => NAMES[cardCode]?.name ?? '#' + cardCode

const L = X.OcgLocation, P = X.OcgPosition, T = X.OcgMessageType
const FILLER = 'Mystical Elf' // harmless vanilla card to pad out the deck

export interface SideCard { card: string; slot?: number; pos?: number }
export interface Side {
  monsters?: Array<string | SideCard>
  spellTrap?: Array<string | SideCard>
  field?: string[]
  hand?: string[]
  gy?: string[]
  banished?: string[]
  deck?: string[]
  extra?: string[]
}
export interface Options {
  seed?: bigint[]
  initialDraw?: number
  showErrors?: boolean
  deckSize?: number
}

/* Assembles the duel. Each side is described like:
     { monsters:[{card,pos}], spellTrap:[{card,pos}], hand:[card], gy:[card],
       deck:[card] }
   Whatever's missing from the deck is padded out with vanilla monsters
   so no one decks out. */
export async function setUp(side0: Side = {}, side1: Side = {}, options: Options = {}): Promise<Scenario> {
  const lib: OcgLib = await X.default({ sync: true })
  const handle = await lib.createDuel({
    flags: X.OcgDuelMode.MODE_GOAT,
    seed: (options.seed ?? [11n, 7n, 13n, 29n]),
    team1: { startingLP: 8000, startingDrawCount: options.initialDraw ?? 5, drawCountPerTurn: 1 },
    team2: { startingLP: 8000, startingDrawCount: options.initialDraw ?? 5, drawCountPerTurn: 1 },
    cardReader: (c) => DB.get(c) ?? null,
    scriptReader,
    errorHandler: (_t, txt) => { if (options.showErrors) console.log('[core]', String(txt)) },
  })
  if (!handle) throw new Error('createDuel devolvió null')
  for (const s of ['constant.lua', 'utility.lua']) await lib.loadScript(handle, s, scriptReader(s))

  const place = async (team: number, cardName: string, location: number, sequence: number, position: number) =>
    lib.duelNewCard(handle, { team, duelist: 0, code: code(cardName), controller: team, location, sequence, position })

  for (const [team, side] of [[0, side0], [1, side1]] as const) {
    let i = 0
    for (const m of (side.monsters ?? [])) {
      const c: SideCard = typeof m === 'string' ? { card: m } : m
      await place(team, c.card, L.MZONE, c.slot ?? i, c.pos ?? P.FACEUP_ATTACK); i++
    }
    i = 0
    for (const m of (side.spellTrap ?? [])) {
      const c: SideCard = typeof m === 'string' ? { card: m } : m
      await place(team, c.card, L.SZONE, c.slot ?? i, c.pos ?? P.FACEDOWN_DEFENSE); i++
    }
    for (const c of (side.field ?? [])) await place(team, c, L.FZONE, 0, P.FACEUP_ATTACK)
    for (const c of (side.hand ?? [])) await place(team, c, L.HAND, 0, P.FACEDOWN_DEFENSE)
    for (const c of (side.gy ?? [])) await place(team, c, L.GRAVE, 0, P.FACEUP_ATTACK)
    for (const c of (side.banished ?? [])) await place(team, c, L.REMOVED, 0, P.FACEUP_ATTACK)
    const deck = [...(side.deck ?? [])]
    while (deck.length < (options.deckSize ?? 20)) deck.push(FILLER)
    for (const c of deck) await place(team, c, L.DECK, 0, P.FACEDOWN_DEFENSE)
    for (const c of (side.extra ?? [])) await place(team, c, L.EXTRA, 0, P.FACEDOWN_DEFENSE)
  }
  await lib.startDuel(handle)
  return new Scenario(lib, handle, options)
}

const trivial = makeTrivialResolver(X)
const generic = makeAutoPlayer(X)

export type Script = (m: OcgMessage, ctx: Scenario) => Record<string, unknown> | 'STOP' | null

export class Scenario {
  lib: OcgLib
  handle: OcgHandle
  op: Options
  messages: OcgMessage[] = []
  turn = 0
  phase = 0
  turnPlayer = 0
  finished = false
  winner: number | null = null
  reason: number | null = null
  lp: { 0: number; 1: number } = { 0: 8000, 1: 8000 }
  pending: OcgMessage | null = null

  constructor(lib: OcgLib, handle: OcgHandle, options: Options = {}) {
    this.lib = lib; this.handle = handle; this.op = options
  }
  /* Runs until the script says "stop", or until the step limit is hit.
     `script(m, ctx)` returns a response, or null to let the generic
     autopilot answer. If it returns "STOP", it stops. */
  async run(script: Script | null, limit = 4000): Promise<string> {
    let attempt = 0, last: OcgMessage | null = null
    for (let step = 0; step < limit; step++) {
      this.pending = null
      const status = await this.lib.duelProcess(this.handle)
      for (const m of this.lib.duelGetMessage(this.handle)) this.record(m)
      if (status === X.OcgProcessResult.END) { this.finished = true; return 'end' }
      if (status !== X.OcgProcessResult.WAITING) continue
      const m = this.pending
      if (!m) return 'no question'
      if (m !== last) { last = m; attempt = 0 }
      let r = script ? script(m, this) : null
      if (r === 'STOP') return 'stopped'
      if (!r) r = trivial(m) ?? generic(m, attempt)
      attempt++
      this.lib.duelSetResponse(this.handle, r)
    }
    return 'limit'
  }
  record(m: OcgMessage) {
    this.messages.push(m)
    switch (m.type) {
      case T.NEW_TURN: this.turnPlayer = m.player as number; this.turn++; break
      case T.NEW_PHASE: this.phase = m.phase as number; break
      case T.DAMAGE: {
        const p = m.player as number
        this.lp[p as 0 | 1] = Math.max(0, this.lp[p as 0 | 1] - (m.amount as number))
        break
      }
      case T.RECOVER: {
        const p = m.player as number
        this.lp[p as 0 | 1] += m.amount as number
        break
      }
      case T.LPUPDATE: {
        const p = m.player as number
        this.lp[p as 0 | 1] = m.lp as number
        break
      }
      case T.WIN: this.finished = true; this.winner = m.player as number; this.reason = m.reason as number; break
      default:
        if (this.isQuestion(m.type)) this.pending = m
    }
  }
  isQuestion(t: number): boolean {
    return [T.SELECT_IDLECMD, T.SELECT_BATTLECMD, T.SELECT_CHAIN, T.SELECT_EFFECTYN,
      T.SELECT_YESNO, T.SELECT_OPTION, T.SELECT_CARD, T.SELECT_UNSELECT_CARD,
      T.SELECT_PLACE, T.SELECT_DISFIELD, T.SELECT_POSITION, T.SELECT_TRIBUTE,
      T.SELECT_SUM, T.SELECT_COUNTER, T.SORT_CARD, T.ANNOUNCE_RACE,
      T.ANNOUNCE_ATTRIB, T.ANNOUNCE_NUMBER, T.ANNOUNCE_CARD].includes(t)
  }
  /* ── queries to THE ENGINE (not to a mirror of ours) ── */
  zone(player: number, location: number) {
    const F = X.OcgQueryFlags
    const cards = this.lib.duelQueryLocation(this.handle,
      { flags: F.CODE | F.POSITION | F.ATTACK | F.DEFENSE, controller: player, location })
    return (cards ?? []).filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ code: c.code, name: nameOf(c.code), pos: c.position, atk: c.attack, def: c.defense }))
  }
  field(j: number) { return this.zone(j, L.MZONE) }
  spellTrap(j: number) { return this.zone(j, L.SZONE) }
  hand(j: number) { return this.zone(j, L.HAND) }
  gy(j: number) { return this.zone(j, L.GRAVE) }
  fzone(j: number) { return this.zone(j, L.FZONE) }
  has(j: number, loc: number, name: string) { return this.zone(j, loc).some((c) => c.name === name) }
  ofType(t: number) { return this.messages.filter((m) => m.type === t) }
}
export { X, L, P, T }
