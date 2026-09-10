/* Ambient types for the ocgcore WASM bundle (src/vendor/ocgcore.bundle.js).
   ocgcore itself ships no types — this file types only what duel.ts,
   autopilot.ts, trivial.ts, ai/brain.ts and tests/support/escenario.ts
   actually call or read, not a speculative full API surface.

   `OcgMessage` and the event payload emitted by GoatDuel are intentionally
   loose (`type: number` plus an index signature): the real shape of a core
   message is entirely determined by its numeric `type` (one struct per
   OcgMessageType, coming straight from the C ABI) and hand-modeling a sound
   discriminated union for all ~20 question types and ~25 event types here
   would be speculative rather than "typed from actual usage." Call sites
   narrow by `m.type` exactly as the original JS did. */

import type { CardRow } from './cards'

export type OcgHandle = unknown

export interface OcgMessage {
  type: number
  [key: string]: unknown
}

export type OcgEnum = Record<string, number>
export type OcgBigEnum = Record<string, bigint>

export interface OcgDuelTeamOptions {
  startingLP: number
  startingDrawCount: number
  drawCountPerTurn: number
}

export interface OcgCreateDuelOptions {
  flags: bigint
  seed: bigint[]
  team1: OcgDuelTeamOptions
  team2: OcgDuelTeamOptions
  cardReader: (code: number) => CardRow | null
  scriptReader: (name: string) => string
  errorHandler: (type: number, text: unknown) => void
}

export interface OcgNewCardOptions {
  team: number
  duelist: number
  code: number
  controller: number
  location: number
  sequence: number
  position: number
}

export interface OcgQueryLocationOptions {
  flags: number
  controller: number
  location: number
}

export interface OcgQueryResult {
  code: number
  position: number
  attack?: number
  defense?: number
}

export interface OcgLib {
  createDuel(options: OcgCreateDuelOptions): Promise<OcgHandle | null>
  loadScript(handle: OcgHandle, name: string, source: string): Promise<void>
  duelNewCard(handle: OcgHandle, options: OcgNewCardOptions): Promise<void>
  startDuel(handle: OcgHandle): Promise<void>
  duelProcess(handle: OcgHandle): Promise<number>
  duelGetMessage(handle: OcgHandle): OcgMessage[]
  duelSetResponse(handle: OcgHandle, response: unknown): void
  duelQueryLocation(handle: OcgHandle, options: OcgQueryLocationOptions): (OcgQueryResult | null)[]
}

/* The `X` namespace re-exported by ocgcore.bundle.js: the enum objects plus
   `default` (aliased from `Ce` in the bundle), the createCore factory. */
export interface OcgNamespace {
  default: (options: { sync: boolean }) => Promise<OcgLib>
  OcgLocation: OcgEnum
  OcgPosition: OcgEnum
  OcgMessageType: OcgEnum
  OcgResponseType: OcgEnum
  OcgProcessResult: OcgEnum
  OcgDuelMode: OcgBigEnum
  OcgQueryFlags: OcgEnum
  SelectIdleCMDAction: OcgEnum
  SelectBattleCMDAction: OcgEnum
  ocgDuelModeString: Iterable<[bigint, string]>
  cardMatchesOpcode: (card: CardRow, opcodes: unknown) => boolean
}

/* The generic event GoatDuel emits (`{ t, ...data }`). Payload shape varies
   per event name exactly like OcgMessage varies per m.type — same rationale
   for keeping it a loose bag rather than a hand-modeled union. */
export interface DuelEvent {
  t: string
  [key: string]: unknown
}
