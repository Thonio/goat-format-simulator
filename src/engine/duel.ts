/* ════════════════════════════════════════════════════════════════════
   ADAPTER: ocgcore messages  →  generic view events.

   This is the key piece of the project. The view doesn't know what
   ocgcore is, and ocgcore doesn't know an interface exists. The day you
   build your own game, you write another adapter that emits these same
   events and the whole view layer is reused without touching a line.

   Emitted events:
     turn   {player, turn}          phase  {phase}
     draw   {player, cards[]}       move   {uid, from, to}
     summon {uid, kind}             flip   {uid}
     chain  {uid, code, link}       attack {uid, targetUid}
     damage {player, amount}        lp     {player, value}
     win    {player, reason}        prompt {kind, msg}
   ════════════════════════════════════════════════════════════════════ */

import type { CardRow } from '../types/cards'
import type { DuelEvent, OcgLib, OcgMessage, OcgNamespace } from '../types/ocgcore'

export const LOC = {
  DECK: 1, HAND: 2, MZONE: 4, SZONE: 8, GRAVE: 16, REMOVED: 32,
  EXTRA: 64, OVERLAY: 128, FZONE: 256, PZONE: 512,
} as const
export const POS = {
  FACEUP_ATTACK: 1, FACEDOWN_ATTACK: 2, FACEUP_DEFENSE: 4, FACEDOWN_DEFENSE: 8,
} as const
const SLOTTED = new Set<number>([LOC.MZONE, LOC.SZONE, LOC.FZONE, LOC.PZONE])
// NOTE: positions are bitmasks. A set S/T card arrives as FACEDOWN (0x0a),
// which is not the same as FACEDOWN_DEFENSE — comparing by equality made
// the opponent's set cards show up face-up.
const isFaceDown = (p: number) => !!(p & 0x0a)
const isDefense = (p: number) => !!(p & 0x0c)

export interface DuelCard {
  uid: number
  code: number
  controller: number
  location: number
  sequence: number
  position: number
}

export type DuelZone = Array<DuelCard | null> | DuelCard[]
export interface DuelSide {
  [LOC.DECK]: DuelCard[]
  [LOC.HAND]: DuelCard[]
  [LOC.GRAVE]: DuelCard[]
  [LOC.REMOVED]: DuelCard[]
  [LOC.EXTRA]: Array<DuelCard | null>
  [LOC.MZONE]: Array<DuelCard | null>
  [LOC.SZONE]: Array<DuelCard | null>
  [LOC.FZONE]: Array<DuelCard | null>
}

export interface DuelLocationRef {
  controller: number
  location: number
  sequence: number
  code?: number
}

export interface GoatDuelOptions {
  lib: OcgLib
  X: OcgNamespace
  cardDb: Map<number, CardRow>
  scriptReader: (name: string) => string
  onEvent?: (event: DuelEvent) => void
}

export interface GoatDuelCreateOptions {
  deck0: number[]
  deck1: number[]
  extra0?: number[]
  extra1?: number[]
  seed?: bigint[]
  lp?: number
}

export class GoatDuel {
  lib: OcgLib
  X: OcgNamespace
  cardDb: Map<number, CardRow>
  scriptReader: (name: string) => string
  onEvent: (event: DuelEvent) => void
  handle: unknown = null
  uid = 0
  cards = new Map<number, DuelCard>() // uid -> {uid, code, position, controller, location, sequence}
  zones: { 0: DuelSide; 1: DuelSide }
  lp: { 0: number; 1: number } = { 0: 8000, 1: 8000 }
  turnPlayer = 0
  turnCount = 0
  phase = 0
  pending: OcgMessage | null = null // core's question waiting for a response
  desyncs = 0 // number of times the mirror didn't match the core
  chainLinks: Array<{ code: number; controller: number; uid: number | null }> = [] // live chain links
  finished = false

  constructor({ lib, X, cardDb, scriptReader, onEvent }: GoatDuelOptions) {
    this.lib = lib
    this.X = X
    this.cardDb = cardDb
    this.scriptReader = scriptReader
    this.onEvent = onEvent ?? (() => {})
    this.zones = { 0: this.emptySide(), 1: this.emptySide() }
  }

  emptySide(): DuelSide {
    /* The S/T zone has SIX slots, not five: under 2005 rules the Field Spell
       doesn't live in FZONE, it lives in slot 5 of the spell/trap zone
       itself. With only five slots, an activated Field Spell fell off the
       array and the view drew it in the corner of the board. */
    return {
      [LOC.DECK]: [], [LOC.HAND]: [], [LOC.GRAVE]: [], [LOC.REMOVED]: [],
      [LOC.EXTRA]: [], [LOC.MZONE]: new Array(5).fill(null),
      [LOC.SZONE]: new Array(6).fill(null), [LOC.FZONE]: new Array(1).fill(null),
    }
  }
  emit(t: string, data: Record<string, unknown>) {
    this.onEvent({ t, ...data })
  }

  // ── setup ────────────────────────────────────────────────
  async create({ deck0, deck1, extra0 = [], extra1 = [], seed = [1n, 2n, 3n, 4n], lp = 8000 }: GoatDuelCreateOptions) {
    const { OcgDuelMode, OcgLocation, OcgPosition } = this.X
    this.handle = await this.lib.createDuel({
      flags: OcgDuelMode.MODE_GOAT, seed,
      team1: { startingLP: lp, startingDrawCount: 5, drawCountPerTurn: 1 },
      team2: { startingLP: lp, startingDrawCount: 5, drawCountPerTurn: 1 },
      cardReader: (code) => this.cardDb.get(code) ?? null,
      scriptReader: this.scriptReader,
      errorHandler: (type, text) => this.emit('coreError', { type, text: String(text) }),
    })
    if (!this.handle) throw new Error('ocgcore: createDuel returned null')
    // the core doesn't load its own libraries; constant and utility pull in the rest
    for (const name of ['constant.lua', 'utility.lua'])
      await this.lib.loadScript(this.handle, name, this.scriptReader(name))

    for (const [team, main, ex] of [[0, deck0, extra0], [1, deck1, extra1]] as const) {
      for (const code of main)
        await this.lib.duelNewCard(this.handle, {
          team, duelist: 0, code, controller: team,
          location: OcgLocation.DECK, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE,
        })
      for (const code of ex)
        await this.lib.duelNewCard(this.handle, {
          team, duelist: 0, code, controller: team,
          location: OcgLocation.EXTRA, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE,
        })
    }
    // local state mirror: the core doesn't tell us what's in the deck
    for (const [team, main, ex] of [[0, deck0, extra0], [1, deck1, extra1]] as const) {
      main.forEach((code) => this.zones[team][LOC.DECK].push(this.newCard(code, team, LOC.DECK)))
      ex.forEach((code) => this.zones[team][LOC.EXTRA].push(this.newCard(code, team, LOC.EXTRA)))
    }
    this.lp[0] = this.lp[1] = lp
    await this.lib.startDuel(this.handle)
    this.emit('ready', { lp })
  }
  newCard(code: number, controller: number, location: number): DuelCard {
    const c: DuelCard = {
      uid: ++this.uid, code, controller, location, sequence: 0,
      position: POS.FACEDOWN_DEFENSE,
    }
    this.cards.set(c.uid, c)
    return c
  }

  // ── position tracking ───────────────────────────────────
  // The core identifies cards by (controller, zone, index), not by id.
  // We keep the mirror so we can give each card a stable uid that the
  // view can animate from one place to another.
  at(controller: number, location: number, sequence: number): DuelCard | null {
    return (this.zones[controller as 0 | 1]?.[location as keyof DuelSide]?.[sequence] as DuelCard | null) ?? null
  }
  /* The core identifies cards by (controller, zone, index). If our mirror
     drifts out of sync by even one slot, we'd return the wrong card — that
     used to make you play a different card than the one you dragged. When
     the message carries the code, we check it and, if it doesn't match,
     look up by code within the same zone. */
  resolve(loc: DuelLocationRef, code?: number | null): DuelCard | null {
    const z = this.zones[loc.controller as 0 | 1]?.[loc.location as keyof DuelSide] as Array<DuelCard | null> | undefined
    if (!z) return null
    const direct = z[loc.sequence] ?? null
    const want = code ?? loc.code
    if (!want || (direct && direct.code === want)) return direct
    const byCode = z.find((c) => c && c.code === want) ?? null
    if (byCode) {
      this.desyncs++
      return byCode
    }
    return direct
  }
  remove(card: DuelCard) {
    const z = this.zones[card.controller as 0 | 1][card.location as keyof DuelSide] as Array<DuelCard | null>
    if (!z) return
    if (SLOTTED.has(card.location)) {
      const i = z.indexOf(card)
      if (i >= 0) z[i] = null
    } else {
      const i = z.indexOf(card)
      if (i >= 0) z.splice(i, 1)
    }
  }
  insert(card: DuelCard, controller: number, location: number, sequence: number) {
    card.controller = controller
    card.location = location
    card.sequence = sequence
    const z = this.zones[controller as 0 | 1][location as keyof DuelSide] as Array<DuelCard | null>
    if (!z) return
    if (SLOTTED.has(location)) z[sequence] = card
    else if (sequence >= 0 && sequence <= z.length) z.splice(sequence, 0, card)
    else z.push(card)
    this.reindex(controller, location)
  }
  reindex(controller: number, location: number) {
    const z = this.zones[controller as 0 | 1][location as keyof DuelSide] as Array<DuelCard | null>
    if (!z || SLOTTED.has(location)) return
    z.forEach((c, i) => { if (c) c.sequence = i })
  }

  // ── main loop ─────────────────────────────────────────────
  async run(): Promise<OcgMessage | null> {
    const { OcgProcessResult } = this.X
    while (!this.finished) {
      const status = await this.lib.duelProcess(this.handle)
      for (const m of this.lib.duelGetMessage(this.handle)) this.handle_(m)
      if (status === OcgProcessResult.END) { this.finished = true; this.emit('end', {}); break }
      if (status === OcgProcessResult.WAITING) return this.pending // waiting for a decision
    }
    return null
  }
  respond(response: unknown) {
    this.lib.duelSetResponse(this.handle, response)
    this.pending = null
  }

  handle_(m: OcgMessage) {
    const T = this.X.OcgMessageType
    switch (m.type) {
      case T.NEW_TURN:
        this.turnPlayer = m.player as number
        this.turnCount++
        this.emit('turn', { player: m.player, turn: this.turnCount })
        break
      case T.NEW_PHASE:
        this.phase = m.phase as number
        this.emit('phase', { phase: m.phase })
        break

      case T.DRAW: {
        const drawn: DuelCard[] = []
        const player = m.player as number
        for (const d of (m.drawn as Array<{ code: number } | number> | undefined) ?? []) {
          const code = typeof d === 'object' && d !== null ? d.code : d
          const deck = this.zones[player as 0 | 1][LOC.DECK]
          // the core draws from the top; our mirror doesn't know the real
          // order, so we reassign the code to the card we popped
          const card = deck.pop() ?? this.newCard(code, player, LOC.DECK)
          this.remove(card)
          card.code = code
          this.insert(card, player, LOC.HAND, this.zones[player as 0 | 1][LOC.HAND].length)
          card.position = POS.FACEUP_ATTACK
          drawn.push(card)
        }
        this.emit('draw', { player, cards: drawn })
        break
      }
      case T.MOVE: {
        const from = m.from as DuelLocationRef
        const to = m.to as DuelLocationRef & { position?: number }
        let card = this.resolve(from, m.card as number)
        if (!card) {
          // untracked appearance (tokens, opponent's deck cards…)
          card = this.newCard(m.card as number, to.controller, to.location)
        } else this.remove(card)
        card.code = (m.card as number) || card.code
        const prev = {
          controller: from.controller, location: from.location,
          sequence: from.sequence, position: card.position,
        }
        this.insert(card, to.controller, to.location, to.sequence)
        card.position = to.position ?? card.position
        this.reindex(from.controller, from.location)
        this.emit('move', {
          uid: card.uid, code: card.code, from: prev,
          to: {
            controller: to.controller, location: to.location, sequence: to.sequence,
            position: card.position, faceDown: isFaceDown(card.position),
            defense: isDefense(card.position),
          },
        })
        break
      }
      case T.POS_CHANGE: {
        const card = this.resolve(m as unknown as DuelLocationRef, m.code as number)
        if (card) {
          card.position = m.position as number
          this.emit('pos', { uid: card.uid, faceDown: isFaceDown(m.position as number), defense: isDefense(m.position as number) })
        }
        break
      }
      case T.SET:
        this.emit('set', { code: m.code, controller: m.controller, location: m.location, sequence: m.sequence })
        break
      case T.SUMMONING:
      case T.SPSUMMONING:
      case T.FLIPSUMMONING: {
        const card = this.resolve(m as unknown as DuelLocationRef, m.code as number)
        // the core doesn't send POS_CHANGE on a flip summon: the new
        // position travels inside this same message
        if (card && m.position != null) card.position = m.position as number
        const kind = m.type === T.SUMMONING ? 'normal' : m.type === T.SPSUMMONING ? 'special' : 'flip'
        this.emit('summon', {
          uid: card?.uid, code: m.code, kind,
          faceDown: isFaceDown(card?.position ?? 0),
          defense: isDefense(card?.position ?? 0),
        })
        break
      }
      case T.CHAINING: {
        const card = this.resolve(m as unknown as DuelLocationRef, m.code as number)
        /* Who put up each chain link. Needed so the AI doesn't chain into
           itself: it used to negate its own Trap Dustshoot with Solemn
           Judgment and pay half its life for nothing. */
        this.chainLinks.push({ code: m.code as number, controller: m.controller as number, uid: card?.uid ?? null })
        this.emit('chain', { uid: card?.uid, code: m.code, link: m.chain_size, controller: m.controller })
        break
      }
      case T.BATTLE: {
        const mc = m.card as DuelLocationRef & { attack: number; defense: number; destroyed: boolean }
        const mt = m.target as (DuelLocationRef & { attack: number; defense: number; destroyed: boolean }) | null | undefined
        const a = this.at(mc.controller, mc.location, mc.sequence)
        const t = mt ? this.at(mt.controller, mt.location, mt.sequence) : null
        /* The message carries who dies and by how much: that's how we can
           measure whether the AI attacks well or suicides (see analizar.mjs). */
        this.emit('battle', {
          uid: a?.uid, targetUid: t?.uid ?? null,
          attacker: { atk: mc.attack, def: mc.defense, dies: !!mc.destroyed, controller: mc.controller },
          target: mt ? { atk: mt.attack, def: mt.defense, dies: !!mt.destroyed, controller: mt.controller } : null,
        })
        break
      }
      case T.ATTACK_DISABLED:
        this.emit('attackCancelled', {})
        break
      case T.SUMMONED:
      case T.SPSUMMONED:
      case T.FLIPSUMMONED:
        this.emit('summoned', {})
        break
      case T.CHAIN_SOLVED:
        this.emit('chainSolved', { link: m.chain_size })
        break
      case T.CHAIN_END:
        this.chainLinks.length = 0
        this.emit('chainEnd', {})
        break
      case T.ATTACK: {
        const mc = m.card as DuelLocationRef
        const mt = m.target as DuelLocationRef | null | undefined
        const a = this.at(mc.controller, mc.location, mc.sequence)
        const t = mt ? this.at(mt.controller, mt.location, mt.sequence) : null
        this.emit('attack', { uid: a?.uid, targetUid: t?.uid ?? null })
        break
      }
      case T.DAMAGE: {
        const player = m.player as number
        this.lp[player as 0 | 1] = Math.max(0, this.lp[player as 0 | 1] - (m.amount as number))
        this.emit('damage', { player, amount: m.amount, lp: this.lp[player as 0 | 1] })
        break
      }
      case T.RECOVER: {
        const player = m.player as number
        this.lp[player as 0 | 1] += m.amount as number
        this.emit('recover', { player, amount: m.amount, lp: this.lp[player as 0 | 1] })
        break
      }
      case T.PAY_LPCOST: {
        const player = m.player as number
        this.lp[player as 0 | 1] = Math.max(0, this.lp[player as 0 | 1] - (m.amount as number))
        this.emit('damage', { player, amount: m.amount, lp: this.lp[player as 0 | 1], cost: true })
        break
      }
      case T.LPUPDATE: {
        const player = m.player as number
        this.lp[player as 0 | 1] = m.lp as number
        this.emit('lp', { player, value: m.lp })
        break
      }
      case T.WIN:
        this.finished = true
        this.emit('win', { player: m.player, reason: m.reason })
        break
      case T.SHUFFLE_DECK:
        this.emit('shuffle', { player: m.player })
        break
      /* Delinquent Duo, Graceful Charity, and random discards make the core
         shuffle the hand. If we don't reorder the same way, our mirror stays
         permanently out of sync — that was the cause of playing the wrong
         card. */
      case T.SHUFFLE_HAND:
      case T.SHUFFLE_EXTRA: {
        const player = m.player as number
        const loc = m.type === T.SHUFFLE_HAND ? LOC.HAND : LOC.EXTRA
        const zone = this.zones[player as 0 | 1][loc as keyof DuelSide] as Array<DuelCard | null>
        const pool = [...zone]
        const reordered: Array<DuelCard | null> = []
        for (const code of (m.cards as number[] | undefined) ?? []) {
          let i = pool.findIndex((c) => c && c.code === code)
          if (i < 0) i = pool.findIndex((c) => c) // shouldn't happen
          if (i >= 0) reordered.push(pool.splice(i, 1)[0])
        }
        for (const rest of pool) if (rest) reordered.push(rest)
        zone.length = 0
        zone.push(...reordered)
        this.reindex(player, loc)
        this.emit('reorder', { player, location: loc })
        break
      }
      /* The engine tells us which cards are shown (Trap Dustshoot,
         Confiscation, Mind Crush, looking at the top of the deck…). This
         used to be ignored, which is why the opponent's hand stayed hidden
         while it asked you to pick from a list. Once revealed they stop
         being secret: their code gets fixed. */
      case T.CONFIRM_CARDS: {
        const revealed: DuelCard[] = []
        for (const c of (m.cards as Array<{ location: number; code?: number } & DuelLocationRef> | undefined) ?? []) {
          /* NOTE: we don't even ask for the DECK. Our deck order is
             fictitious — the engine shuffles on its own — so looking up a
             specific card there always "repairs" and used to trip the
             desync counter: 30 per game of pure noise, drowning out the
             real ones. Also, fixing the code there would overwrite another
             card. */
          if (c.location === LOC.DECK || c.location === LOC.EXTRA) continue
          const card = this.resolve(c, c.code)
          if (!card) continue
          if (c.code) card.code = c.code
          revealed.push(card)
        }
        this.emit('reveal', {
          player: m.player, uids: revealed.map((c) => c.uid),
          codes: revealed.map((c) => c.code),
          location: (m.cards as Array<{ location: number }> | undefined)?.[0]?.location ?? 0,
        })
        break
      }
      /* The Damage Step doesn't arrive as a phase: it arrives with its own
         notices. Without this there was no way to know whether a chain was
         at attack declaration or already inside damage calculation. */
      case T.DAMAGE_STEP_START:
        this.emit('damageStep', { on: true })
        break
      case T.DAMAGE_STEP_END:
        this.emit('damageStep', { on: false })
        break
      case T.RETRY:
        this.emit('retry', {})
        break
      default:
        if (this.isQuestion(m.type)) {
          this.pending = m
          this.emit('prompt', { msg: m })
        }
    }
  }
  isQuestion(t: number): boolean {
    const T = this.X.OcgMessageType
    return [
      T.SELECT_IDLECMD, T.SELECT_BATTLECMD, T.SELECT_CHAIN, T.SELECT_EFFECTYN,
      T.SELECT_YESNO, T.SELECT_OPTION, T.SELECT_CARD, T.SELECT_UNSELECT_CARD,
      T.SELECT_PLACE, T.SELECT_DISFIELD, T.SELECT_POSITION, T.SELECT_TRIBUTE,
      T.SELECT_SUM, T.SELECT_COUNTER, T.SORT_CARD, T.ANNOUNCE_RACE,
      T.ANNOUNCE_ATTRIB, T.ANNOUNCE_NUMBER, T.ANNOUNCE_CARD,
    ].includes(t)
  }
}
