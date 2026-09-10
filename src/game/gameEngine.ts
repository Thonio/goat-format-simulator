/* ════════════════════════════════════════════════════════════
   ORCHESTRATOR: engine + adapter + AI, no DOM.

   Port of main.js. Every `V.*`/`document.getElementById` call from the
   original becomes a state mutation + commit() here (equivalent to
   notifying subscribers). The loop (`loop`/`loopInternal`/`drain`/`ask`/
   `armIdle`/`armBattle`) and its timings (`sleep(ms)`) stay the same:
   that's what decides the pace of the animations.

   The visual layer (React components) is built in a later phase and
   consumes this state via useGameEngine (useSyncExternalStore). The
   transform/position math from layoutAll/fitBoard is deliberately left
   out of here: GameEngine exposes raw state (which card is in which
   zone/slot), not computed CSS.
   ════════════════════════════════════════════════════════════ */
import { GoatDuel, type DuelCard, type DuelSide } from '../engine/duel'
import { makeAutoPlayer } from '../engine/autopilot'
import { makeTrivialResolver } from '../engine/trivial'
import { createBrain, LEVELS, type Level } from '../engine/ai/brain'
import { buildCardDb, type CardsSubset, type CardRow, type NamesSubset } from '../types/cards'
import type { DuelEvent, OcgMessage, OcgNamespace } from '../types/ocgcore'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export type ChainMode = 'auto' | 'always' | 'nunca'

const PHNAME: Record<number, string> = {
  1: 'Draw Phase', 2: 'Standby Phase', 4: 'Main Phase 1', 8: 'Battle Phase',
  16: 'Battle Step', 32: 'Damage Step', 64: 'Damage Step', 128: 'Battle Phase',
  256: 'Main Phase 2', 512: 'End Phase',
}
/** Zone name by location code — so the UI can label the cards in
 *  `selectCards.list` ("Sangan (Cementerio)", etc). */
export const LOCNAME: Record<number, string> = { 1: 'Deck', 2: 'mano', 4: 'campo', 8: 'M/T', 16: 'Cementerio', 32: 'desterradas', 64: 'Extra' }
/** Difficulty label, so the UI can show the opponent's level. */
export const LEVEL_LABEL: Record<Level, string> = { novato: 'Novato', normal: 'Normal', duro: 'Duro', experto: 'Experto' }
// why the duel ended — the codes are the engine's own
const REASONS: Record<number, string> = { 0: 'Puntos de vida a cero', 1: 'Se quedó sin cartas en el Deck', 2: 'Efecto de una carta', 3: 'Rendición', 4: 'Se acabó el tiempo' }
const RACES: Record<string, string> = {
  1: 'Guerrero', 2: 'Mago', 4: 'Hada', 8: 'Demonio', 16: 'Zombi', 32: 'Máquina',
  64: 'Aqua', 128: 'Piro', 256: 'Roca', 512: 'Bestia Alada', 1024: 'Planta', 2048: 'Insecto',
  4096: 'Trueno', 8192: 'Dragón', 16384: 'Bestia', 32768: 'Bestia Guerrero',
  65536: 'Dinosaurio', 131072: 'Pez', 262144: 'Serpiente Marina', 524288: 'Reptil',
}
const ATTRIBUTES: Record<string, string> = { 1: 'FUEGO', 2: 'AGUA', 4: 'TIERRA', 8: 'VIENTO', 16: 'LUZ', 32: 'OSCURIDAD', 64: 'DIVINO' }
/* Exactly what moment the question is asked at — the message itself
   carries the "timing". This matters in battle: responding at attack
   declaration versus already inside the Damage Step are two different
   plays with Book of Moon in hand. */
const TIMINGS: Array<[number, string]> = [
  [4096, 'Declaración de ataque'], [134217728, 'Tras el combate'],
  [67108864, 'Fin del Battle Step'], [16777216, 'Battle Phase'],
  [64, 'Invocación normal'], [128, 'Invocación especial'], [256, 'Invocación por volteo'],
  [512, 'Al colocar monstruo'], [1024, 'Al colocar M/T'], [2048, 'Cambio de posición'],
  [524288, 'Al destruirse'], [8388608, 'Al ir al cementerio'], [2097152, 'Al ir a la mano'],
  [32768, 'Final de la cadena'], [8, 'Inicio de la Battle Phase'], [16, 'Fin de la Battle Phase'],
  [4, 'Final de la Main Phase'], [32, 'End Phase'], [2, 'Standby Phase'], [1, 'Draw Phase'],
]
const TYPE_MONSTER = 0x1, TYPE_TRAP = 0x4, TYPE_FIELD = 0x80000
const HIDDEN_LOCS = [1, 16, 32, 64]
const CYCLE: Record<ChainMode, ChainMode> = { auto: 'always', always: 'nunca', nunca: 'auto' }
export const CHAIN_MODE_LABEL: Record<ChainMode, string> = {
  auto: 'Cadenas: automáticas', always: 'Cadenas: preguntar siempre', nunca: 'Cadenas: no activar nada',
}

export interface PanelOption {
  label: string
  primary?: boolean
  run: () => void
}
export interface PanelState {
  title: string
  note?: string | null
  timing?: string | null
  options: PanelOption[]
}
export interface IdleActions {
  summon?: number
  specialSummon?: number
  monsterSet?: number
  activate?: number
  spellSet?: number
  posChange?: number
}
export interface IdleState {
  actions: Map<number, IdleActions>
  playable: Set<number>
  inHand: Set<number>
  onField: Set<number>
  toBattlePhase: boolean
  toEndPhase: boolean
}
export interface BattleState {
  attackers: Map<number, number>
  attacked: Set<number>
  toMainPhase2: boolean
  toEndPhase: boolean
}
export interface SelectCardsItem { uid: number | null; code: number; location: number }
export interface SelectCardsState {
  min: number
  max: number
  multi: boolean // false = SELECT_UNSELECT_CARD (one click = the response)
  canCancel: boolean
  canFinish: boolean
  needsZoneView: boolean
  list: SelectCardsItem[]
  chosen: number[]
}
export interface AnnounceCardState { candidates: number[] }
export interface ZoneViewState { title: string; cards: Array<{ code: number }> }
export interface ConfirmState { title: string; text: string; yesLabel?: string }
export interface ResultInfo {
  won: boolean
  reason: string
  myLp: number
  opponentLp: number
  turns: number
  myAvatar?: AvatarInfo
  opponentAvatar?: AvatarInfo
  opponentName?: string
}
export interface AvatarInfo { src?: string; name?: string }
export interface ChallengeInfo { opponentDeck?: string; level?: string }
export interface GameConfig {
  level?: Level
  chainMode?: ChainMode
  chainTimeout?: number
  myAvatar?: AvatarInfo
  opponentAvatar?: AvatarInfo
  deckName?: string
  opponentName?: string
  challenge?: ChallengeInfo
}
export interface LogEntry { ms: number; turn: number; who: 'tú' | 'rival'; phase: string; kind: string; data: unknown }
export interface CoinTossState { stage: 'spinning' | 'result' | 'hiding'; youStart: boolean }
export interface PhaseAnnounceState { text: string; sub: string; mine: boolean }
export interface BattleAnimState { uid: number; targetUid: number | null; stage: 'telegraph' | 'clash' | 'returning' }

export interface GameSnapshot {
  booted: boolean
  me: 0 | 1
  /** Raw board state — which card is in which zone/slot. The
   *  transform/position math (layoutAll/fitBoard) lives in the render
   *  layer, not here: this is the data source, not the layout. */
  zones: { 0: DuelSide; 1: DuelSide } | null
  cards: Map<number, DuelCard>
  db: Map<number, CardRow>
  names: NamesSubset
  turnPlayer: number
  turnCount: number
  phase: number
  lp: { 0: number; 1: number }
  timing: 'attack' | 'damage' | null
  chainMode: ChainMode
  chainActive: boolean
  chainDeadline: number | null
  botLevel: Level
  surrendered: boolean
  finished: boolean
  result: ResultInfo | null
  banner: { text: string; color?: string; key: number } | null
  /** Short, transient notice (port of view.js:toast) — e.g. "that card
   *  can't be played right now" when dropped on an invalid zone. */
  toast: { text: string; key: number } | null
  history: Array<{ id: number; code: number; mine: boolean; kind: string }>
  panel: PanelState | null
  idle: IdleState | null
  battle: BattleState | null
  choiceMenu: { title: string; options: PanelOption[] } | null
  pendingPlacement: { uid: number; owner: number; zone: string; slot: number } | null
  selectCards: SelectCardsState | null
  announceCard: AnnounceCardState | null
  zoneView: ZoneViewState | null
  confirm: ConfirmState | null
  coinToss: CoinTossState | null
  phaseAnnounce: PhaseAnnounceState | null
  battleAnim: BattleAnimState | null
  glowing: Set<number>
  revealed: Set<number>
  underAttack: number | null
  declaringUid: number | null
  config: GameConfig | null
  log: LogEntry[]
  seed: number | null
}

export interface GameEngineBootOptions {
  X: OcgNamespace
  scriptReader: (name: string) => string
  cardsRaw: CardsSubset
  names: NamesSubset
  deck: number[]
  extra?: number[]
  deckRival?: number[]
  extraRival?: number[]
  config?: GameConfig | null
}

type Listener = () => void

export class GameEngine {
  // ── state from the original main.js, as instance fields ──
  private ME: 0 | 1 = 0
  private duel!: GoatDuel
  private decideAI!: (m: OcgMessage, attempt?: number) => Record<string, unknown> | null
  private trivialFn!: (m: OcgMessage) => Record<string, unknown> | null
  private X!: OcgNamespace
  private names: NamesSubset = {}
  private db = new Map<number, CardRow>()
  private dbRaw: CardsSubset = {}
  private chainMode: ChainMode = 'auto'
  private chainActive = false
  private botLevel: Level = 'duro'
  private brain: ((m: OcgMessage, intento?: number) => Record<string, unknown> | null) | null = null
  // decisions that resolve themselves and are never shown
  private AUTO_KINDS = new Set<number>()
  private CHAIN_TIMEOUT = 15
  private chainTimeoutHandle: ReturnType<typeof setTimeout> | null = null
  private chainDeadline: number | null = null
  private idle: IdleState | null = null
  private battle: BattleState | null = null
  private currentIdleMsg: OcgMessage | null = null
  private preferredPlace: { zone: string; slot: number } | null = null
  private CONFIG: GameConfig | null = null
  private currentTiming: 'attack' | 'damage' | null = null

  // match record
  private LOG: LogEntry[] = []
  private SEED: number | null = null
  private DECKLOG: { mine: number[]; opponent: number[] } | null = null
  private readonly t0 = Date.now()
  private readonly queue: DuelEvent[] = []

  private surrendered = false
  private aiAttempt = 0
  private aiLast: unknown = null
  private booted = false
  private finished = false
  private result: ResultInfo | null = null
  private banner: { text: string; color?: string; key: number } | null = null
  private bannerKey = 0
  private toast: { text: string; key: number } | null = null
  private toastKey = 0
  private history: Array<{ id: number; code: number; mine: boolean; kind: string }> = []
  private historyId = 0
  private panel: PanelState | null = null
  private choiceMenu: { title: string; options: PanelOption[] } | null = null
  private pendingPlacement: { uid: number; owner: number; zone: string; slot: number } | null = null
  private selectCards: SelectCardsState | null = null
  private announceCard: AnnounceCardState | null = null
  private zoneView: ZoneViewState | null = null
  private confirm: ConfirmState | null = null
  private confirmYes: (() => void) | null = null
  private coinToss: CoinTossState | null = null
  private phaseAnnounce: PhaseAnnounceState | null = null
  private battleAnim: BattleAnimState | null = null
  private glowing = new Set<number>()
  private revealed = new Set<number>()
  private underAttack: number | null = null
  private declaringUid: number | null = null
  private lastPhase: string | null = null
  // temporary context for decisions that get repainted several times
  private selectCardsCtx: {
    list: Array<{ uid: number | null; code: number; location: number }>
    min: number; max: number; type: number; rt: number; canCancel: boolean; canFinish: boolean
    chosen: number[]; multi: boolean
  } | null = null
  private announceRaceCtx: { isRace: boolean; bits: Array<[number | bigint, string]>; count: number; chosen: Array<number | bigint> } | null = null

  private listeners = new Set<Listener>()
  private snapshot!: GameSnapshot

  constructor() {
    this.commit()
  }

  // ── subscription (for useSyncExternalStore) ──
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  getSnapshot = (): GameSnapshot => this.snapshot

  private commit() {
    this.snapshot = {
      booted: this.booted,
      me: this.ME,
      zones: this.duel?.zones ?? null,
      cards: this.duel?.cards ?? new Map(),
      db: this.db,
      names: this.names,
      turnPlayer: this.duel?.turnPlayer ?? 0,
      turnCount: this.duel?.turnCount ?? 0,
      phase: this.duel?.phase ?? 0,
      lp: this.duel?.lp ?? { 0: 8000, 1: 8000 },
      timing: this.currentTiming,
      chainMode: this.chainMode,
      chainActive: this.chainActive,
      chainDeadline: this.chainDeadline,
      botLevel: this.botLevel,
      surrendered: this.surrendered,
      finished: this.finished,
      result: this.result,
      banner: this.banner,
      toast: this.toast,
      history: this.history,
      panel: this.panel,
      idle: this.idle,
      battle: this.battle,
      choiceMenu: this.choiceMenu,
      pendingPlacement: this.pendingPlacement,
      selectCards: this.selectCards,
      announceCard: this.announceCard,
      zoneView: this.zoneView,
      confirm: this.confirm,
      coinToss: this.coinToss,
      phaseAnnounce: this.phaseAnnounce,
      battleAnim: this.battleAnim,
      glowing: this.glowing,
      revealed: this.revealed,
      underAttack: this.underAttack,
      declaringUid: this.declaringUid,
      config: this.CONFIG,
      log: this.LOG,
      seed: this.SEED,
    }
    for (const l of this.listeners) l()
  }

  // ── name/logging helpers ──
  private nm = (c: number) => this.names[c]?.name ?? '#' + c
  private msgName(m: OcgMessage): string {
    const T = this.X.OcgMessageType
    for (const k in T) if (T[k] === m.type) return k
    return 'tipo ' + m.type
  }
  private snap(v: unknown, depth = 0): unknown {
    if (v === null || typeof v !== 'object') return typeof v === 'bigint' ? v.toString() + 'n' : v
    if (depth > 4) return '…'
    if (Array.isArray(v)) return v.map((x) => this.snap(x, depth + 1))
    const o: Record<string, unknown> = {}
    for (const k in v as Record<string, unknown>) {
      if (k === 'el' || k === '_el') continue
      o[k] = this.snap((v as Record<string, unknown>)[k], depth + 1)
    }
    return o
  }
  private logIt(kind: string, data: unknown) {
    const snapped = this.snap(data)
    this.LOG.push({
      ms: Date.now() - this.t0, turn: this.duel?.turnCount ?? 0,
      who: this.duel?.turnPlayer === this.ME ? 'tú' : 'rival',
      phase: PHNAME[this.duel?.phase ?? -1] ?? '', kind, data: snapped,
    })
    if (this.LOG.length > 6000) this.LOG.splice(0, 2000)
  }
  private onEvent = (e: DuelEvent) => { this.logIt('evento', e); this.queue.push(e) }

  // ── bot-mode progress (localStorage, same key as the menu) ──
  private recordVictory() {
    const challenge = this.CONFIG?.challenge
    if (!challenge?.opponentDeck || !challenge?.level) return
    try {
      const p = JSON.parse(localStorage.getItem('goatProgreso') || '{}')
      p[challenge.opponentDeck] = p[challenge.opponentDeck] || {}
      p[challenge.opponentDeck][challenge.level] = true
      localStorage.setItem('goatProgreso', JSON.stringify(p))
    } catch { /* localStorage unavailable: not critical */ }
  }

  // ── downloadable log text (the UI decides how to offer it) ──
  private safeJSON(o: unknown): string {
    try {
      return JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() + 'n' : v instanceof Map ? '[Map]' : v))
    } catch (e) { return '(no serializable: ' + (e as Error).message + ')' }
  }
  buildLogText(): string {
    const header = [
      'GOAT FORMAT — registro de partida',
      'fecha: ' + new Date().toISOString(),
      'semilla: ' + this.SEED,
      'modo cadenas: ' + this.chainMode,
      'nivel del rival: ' + this.botLevel,
      'tu mazo: ' + (this.CONFIG?.deckName ?? '?') + ' · mazo rival: ' + (this.CONFIG?.opponentName ?? '?'),
      'desincronizaciones detectadas y corregidas: ' + (this.duel?.desyncs ?? 0),
      'turno actual: ' + (this.duel?.turnCount ?? 0) + ' · fase: ' + (PHNAME[this.duel?.phase ?? -1] ?? ''),
      'LP  tú: ' + this.duel?.lp[this.ME] + '   rival: ' + this.duel?.lp[1 - this.ME as 0 | 1],
      'mazo: ' + this.safeJSON(this.DECKLOG),
      ''.padEnd(70, '─'), '',
    ].join('\n')
    const body = this.LOG.map((e) => {
      const line = `[${String(e.ms).padStart(6)}ms] T${e.turn} ${e.who.padEnd(5)} ${String(e.phase).padEnd(14)} ${e.kind}`
      return line + ' · ' + this.safeJSON(e.data)
    }).join('\n')
    return header + body
  }

  private setPanel(title: string, options: PanelOption[], note?: string | null, timing?: string | null) {
    this.panel = { title, note: note ?? null, timing: timing ?? null, options }
    this.commit()
  }
  private clearPanel() {
    this.cancelChainTimer()
    this.panel = null
  }
  private cancelChainTimer() {
    if (this.chainTimeoutHandle) { clearTimeout(this.chainTimeoutHandle); this.chainTimeoutHandle = null }
    this.chainDeadline = null
  }
  private startChainTimer(seconds: number, onExpire: () => void) {
    this.cancelChainTimer()
    this.chainDeadline = Date.now() + seconds * 1000
    this.chainTimeoutHandle = setTimeout(onExpire, seconds * 1000)
  }

  private respondLogged(r: unknown, label?: string) {
    this.logIt('tú_eliges', { accion: label, respuesta: r })
    this.duel.respond(r)
  }

  // ── the exact moment of the question (attack declaration / damage step / …) ──
  private cardFromDescription(d: unknown): number | null {
    try {
      const b = BigInt((d as number | bigint) ?? 0)
      if (b > 1048575n) { const c = Number(b >> 20n); if (this.names[c]) return c }
    } catch { /* description with no card code */ }
    return null
  }
  private questionTiming(m: OcgMessage): string {
    const t = (((m.hint_timing as number) >>> 0) || ((m.hint_timing_other as number) >>> 0)) >>> 0
    if (this.currentTiming === 'damage') return (t & 16384) ? 'Damage Step · cálculo de daño' : 'Damage Step'
    for (const [bit, txt] of TIMINGS) if (t & bit) return txt
    return this.currentTiming ? (this.currentTiming === 'attack' ? 'Declaración de ataque' : 'Damage Step') : ''
  }

  // ════════════════════════════════════════════════════════════
  // drag control in Main Phase
  // ════════════════════════════════════════════════════════════
  private armIdle(m: OcgMessage) {
    this.currentIdleMsg = m
    this.battle = null
    const actions = new Map<number, IdleActions>()
    type ListEntry = { code: number; controller: number; location: number; sequence: number }
    const mapList = (list: unknown, key: keyof IdleActions) => {
      (list as ListEntry[] | undefined ?? []).forEach((l, i) => {
        const c = this.duel.resolve(l, l.code)
        if (!c) return
        const e = actions.get(c.uid) ?? {}
        e[key] = i
        actions.set(c.uid, e)
      })
    }
    mapList(m.summons, 'summon'); mapList(m.special_summons, 'specialSummon')
    mapList(m.monster_sets, 'monsterSet'); mapList(m.activates, 'activate')
    mapList(m.spell_sets, 'spellSet'); mapList(m.pos_changes, 'posChange')
    const playable = new Set(actions.keys())
    const inHand = new Set<number>(), onField = new Set<number>()
    for (const uid of playable) {
      const c = this.duel.cards.get(uid)
      ;(c && c.location === 2 ? inHand : onField).add(uid)
    }
    this.idle = { actions, playable, inHand, onField, toBattlePhase: !!m.to_bp, toEndPhase: !!m.to_ep }
    const btns: PanelOption[] = [{ label: 'Ver todas las acciones', run: () => this.fullIdlePanel(m) }]
    this.setPanel(PHNAME[this.duel.phase] ?? 'Main Phase', btns,
      playable.size ? 'Arrastra para jugar o reordenar tu mano · ✦ = efecto disponible' : 'No tienes jugadas disponibles')
  }

  private sendIdle(r: unknown, label?: string) {
    this.idle = null; this.currentIdleMsg = null; this.choiceMenu = null; this.pendingPlacement = null
    this.clearPanel()
    this.respondLogged(r, label ?? 'main')
    this.commit()
    void this.loop()
  }

  private fullIdlePanel(m: OcgMessage) {
    const R = this.X.OcgResponseType, IA = this.X.SelectIdleCMDAction
    const opts: PanelOption[] = []
    const push = (list: unknown, action: number, prefix: string) => {
      (list as Array<{ code: number }> | undefined ?? []).forEach((c, i) =>
        opts.push({ label: `${prefix} ${this.nm(c.code)}`, run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action, index: i }) }))
    }
    push(m.summons, IA.SELECT_SUMMON, 'Invocar')
    push(m.special_summons, IA.SELECT_SPECIAL_SUMMON, 'Inv. especial')
    push(m.activates, IA.SELECT_ACTIVATE, 'Activar')
    push(m.monster_sets, IA.SELECT_MONSTER_SET, 'Colocar')
    push(m.spell_sets, IA.SELECT_SPELL_SET, 'Colocar tapada')
    push(m.pos_changes, IA.SELECT_POS_CHANGE, 'Cambiar posición')
    if (m.to_bp) opts.push({ label: '→ Battle Phase', primary: true, run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.TO_BP, index: null }) })
    if (m.to_ep) opts.push({ label: '→ Terminar turno', run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.TO_EP, index: null }) })
    opts.push({ label: 'Volver', run: () => this.armIdle(m) })
    this.setPanel('Todas las acciones', opts)
  }

  /** Drop a card from the hand onto a zone. Mirrors view.js onUp → main.js onDrop. */
  dropCard(uid: number, zone: 'm' | 'st' | 'field', slotIdx: number) {
    if (!this.idle || !this.currentIdleMsg) return
    const card = this.duel.cards.get(uid)
    if (!card) return
    this.pendingPlacement = { uid, owner: this.ME, zone, slot: slotIdx }
    this.commit()
    const cancelDrop = (notice?: string) => {
      this.preferredPlace = null
      this.pendingPlacement = null
      if (notice) { this.toast = { text: notice, key: ++this.toastKey }; this.logIt('aviso', { texto: notice }) }
      this.commit()
    }
    const d = this.db.get(card.code)
    if (!d) return cancelDrop()
    const mon = !!(d.type & TYPE_MONSTER), trap = !!(d.type & TYPE_TRAP), isField = !!(d.type & TYPE_FIELD)
    const zoneOk = mon ? zone === 'm' : isField ? (zone === 'st' || zone === 'field') : zone === 'st'
    if (!zoneOk) return cancelDrop(mon ? 'Los monstruos van en la zona de monstruos' : 'Las Mágicas y Trampas van en la zona de M/T')
    // under 2005 rules the Field Spell occupies slot 5 of S/T, not a separate zone
    this.preferredPlace = isField ? { zone: 'st', slot: 5 } : { zone, slot: slotIdx }
    const a = this.idle.actions.get(uid)
    if (!a) return cancelDrop('Esa carta no se puede jugar ahora')
    const R = this.X.OcgResponseType, IA = this.X.SelectIdleCMDAction
    const opts: PanelOption[] = []
    if (a.summon !== undefined) opts.push({ label: 'Invocación normal', primary: true, run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.SELECT_SUMMON, index: a.summon }, 'Invocar ' + this.nm(card.code)) })
    if (a.specialSummon !== undefined) opts.push({ label: 'Invocación especial', primary: true, run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.SELECT_SPECIAL_SUMMON, index: a.specialSummon }, 'Inv. especial ' + this.nm(card.code)) })
    if (a.monsterSet !== undefined) opts.push({ label: 'Colocar boca abajo', run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.SELECT_MONSTER_SET, index: a.monsterSet }, 'Colocar ' + this.nm(card.code)) })
    if (a.activate !== undefined) opts.push({ label: 'Activar', primary: true, run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.SELECT_ACTIVATE, index: a.activate }, 'Activar ' + this.nm(card.code)) })
    if (a.spellSet !== undefined) opts.push({ label: 'Colocar tapada', run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.SELECT_SPELL_SET, index: a.spellSet }, 'Colocar tapada ' + this.nm(card.code)) })
    if (!opts.length) return cancelDrop('Esa carta no se puede jugar ahora')
    // traps can only be set: no menu. And if there's only one option, no menu either.
    if ((trap && opts.length === 1) || opts.length === 1) return opts[0].run()
    this.choiceMenu = {
      title: this.nm(card.code),
      options: [...opts, { label: 'Cancelar', run: () => cancelDrop() }],
    }
    this.commit()
  }

  /** Click on your own card already on the field: activate or change position. */
  clickIdleCard(uid: number) {
    if (!this.idle) return
    const a = this.idle.actions.get(uid)
    if (!a) return
    const card = this.duel.cards.get(uid)
    if (!card) return
    const R = this.X.OcgResponseType, IA = this.X.SelectIdleCMDAction
    const opts: PanelOption[] = []
    if (a.activate !== undefined) opts.push({ label: 'Activar', primary: true, run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.SELECT_ACTIVATE, index: a.activate }, 'Activar ' + this.nm(card.code)) })
    if (a.posChange !== undefined) opts.push({ label: 'Cambiar posición', run: () => this.sendIdle({ type: R.SELECT_IDLECMD, action: IA.SELECT_POS_CHANGE, index: a.posChange }) })
    if (!opts.length) return
    this.choiceMenu = { title: this.nm(card.code), options: [...opts, { label: 'Cancelar', run: () => { this.choiceMenu = null; this.commit() } }] }
    this.commit()
  }

  closeChoiceMenu() { this.choiceMenu = null; this.commit() }

  /** The fixed "phase"/"end" button: its action depends on whether idle or battle is armed. */
  advancePhase() {
    const R = this.X.OcgResponseType
    if (this.idle?.toBattlePhase) return this.sendIdle({ type: R.SELECT_IDLECMD, action: this.X.SelectIdleCMDAction.TO_BP, index: null })
    if (this.battle?.toMainPhase2) return this.sendBattle({ type: R.SELECT_BATTLECMD, action: this.X.SelectBattleCMDAction.TO_M2, index: null })
  }
  endTurn() {
    const R = this.X.OcgResponseType
    if (this.idle?.toEndPhase) return this.sendIdle({ type: R.SELECT_IDLECMD, action: this.X.SelectIdleCMDAction.TO_EP, index: null })
    if (this.battle?.toEndPhase) return this.sendBattle({ type: R.SELECT_BATTLECMD, action: this.X.SelectBattleCMDAction.TO_EP, index: null })
  }
  /** Emergency button: forces the AI to try another response. */
  forceUnstick() { this.aiAttempt++; void this.loop() }

  // ════════════════════════════════════════════════════════════
  // Battle Phase: click your monster → pick a target
  // ════════════════════════════════════════════════════════════
  private armBattle(m: OcgMessage) {
    this.idle = null
    const attackers = new Map<number, number>()
    ;(m.attacks as Array<{ code: number; controller: number; location: number; sequence: number }> | undefined ?? [])
      .forEach((l, i) => { const c = this.duel.resolve(l, l.code); if (c) attackers.set(c.uid, i) })
    // ones that already attacked are grayed out, so it's visible at a glance
    const mine = ((this.duel.zones[this.ME]?.[4] ?? []) as Array<DuelCard | null>).filter((c): c is DuelCard => !!c).map((c) => c.uid)
    const attacked = new Set(mine.filter((u) => !attackers.has(u)))
    this.battle = { attackers, attacked, toMainPhase2: !!m.to_m2, toEndPhase: !!m.to_ep }
    const R = this.X.OcgResponseType, BA = this.X.SelectBattleCMDAction
    const btns: PanelOption[] = []
    ;(m.chains as Array<{ code: number }> | undefined ?? []).forEach((c, i) =>
      btns.push({ label: `Activar ${this.nm(c.code)}`, run: () => this.sendBattle({ type: R.SELECT_BATTLECMD, action: BA.SELECT_CHAIN, index: i }) }))
    this.setPanel('Battle Phase', btns, attackers.size ? 'Haz clic en un monstruo tuyo para declarar ataque' : 'No puedes atacar')
  }
  private sendBattle(r: unknown, label?: string) {
    this.battle = null; this.underAttack = null; this.declaringUid = null
    this.clearPanel()
    this.respondLogged(r, label ?? 'battle')
    this.commit()
    void this.loop()
  }
  /** Click on your own monster that's available to attack. */
  declareAttack(uid: number) {
    if (!this.battle) return
    const i = this.battle.attackers.get(uid)
    if (i === undefined) return
    const card = this.duel.cards.get(uid)
    const R = this.X.OcgResponseType, BA = this.X.SelectBattleCMDAction
    this.sendBattle({ type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: i }, 'Atacar con ' + (card ? this.nm(card.code) : uid))
  }

  // ════════════════════════════════════════════════════════════
  // the rest of the decisions (panel)
  // ════════════════════════════════════════════════════════════
  private ask(m: OcgMessage) {
    const T = this.X.OcgMessageType, R = this.X.OcgResponseType
    const send = (r: unknown, label?: string) => {
      this.clearPanel()
      this.selectCards = null; this.selectCardsCtx = null
      this.announceCard = null; this.announceRaceCtx = null
      this.zoneView = null
      this.respondLogged(r, label ?? this.msgName(m))
      this.commit()
      void this.loop()
    }
    switch (m.type) {
      case T.SELECT_IDLECMD: return this.armIdle(m)
      case T.SELECT_BATTLECMD: return this.armBattle(m)
      case T.SELECT_CHAIN: {
        const selects = (m.selects as Array<{ code: number }> | undefined) ?? []
        const opts: PanelOption[] = selects.map((c, i) => ({
          label: `Encadenar ${this.nm(c.code)}`, primary: true, run: () => send({ type: R.SELECT_CHAIN, index: i }),
        }))
        if (!m.forced) opts.push({ label: 'No responder', run: () => send({ type: R.SELECT_CHAIN, index: null }) })
        const timing = this.questionTiming(m)
        this.setPanel(m.forced ? 'Efecto obligatorio — elige' : '¿Quieres responder?', opts,
          m.forced ? null : 'Si no contestas, se pasa sola', timing)
        if (!m.forced && this.CHAIN_TIMEOUT > 0) {
          this.startChainTimer(this.CHAIN_TIMEOUT, () => {
            this.logIt('tiempo_agotado', { pregunta: 'SELECT_CHAIN' })
            send({ type: R.SELECT_CHAIN, index: null }, 'sin respuesta (tiempo)')
          })
        }
        this.commit()
        return
      }
      case T.SELECT_EFFECTYN: {
        const timing = this.questionTiming(m)
        return this.setPanel(`¿Activar el efecto de ${this.nm(m.code as number)}?`, [
          { label: 'Sí', primary: true, run: () => send({ type: R.SELECT_EFFECTYN, yes: true }) },
          { label: 'No', run: () => send({ type: R.SELECT_EFFECTYN, yes: false }) },
        ], null, timing)
      }
      case T.SELECT_YESNO: {
        const cod = this.cardFromDescription(m.description)
        const timing = this.questionTiming(m)
        return this.setPanel(cod ? `¿Activar el efecto de ${this.nm(cod)}?` : '¿Confirmas?', [
          { label: 'Sí', primary: true, run: () => send({ type: R.SELECT_YESNO, yes: true }) },
          { label: 'No', run: () => send({ type: R.SELECT_YESNO, yes: false }) },
        ], null, timing)
      }
      case T.SELECT_OPTION:
        return this.setPanel('Elige una opción', ((m.options as unknown[] | undefined) ?? []).map((_o, i) => ({
          label: `Opción ${i + 1}`, run: () => send({ type: R.SELECT_OPTION, index: i }),
        })))
      case T.SELECT_POSITION: {
        const P = this.X.OcgPosition, o: PanelOption[] = []
        const positions = m.positions as number
        if (positions & P.FACEUP_ATTACK) o.push({ label: 'Ataque', primary: true, run: () => send({ type: R.SELECT_POSITION, position: P.FACEUP_ATTACK }) })
        if (positions & P.FACEUP_DEFENSE) o.push({ label: 'Defensa', run: () => send({ type: R.SELECT_POSITION, position: P.FACEUP_DEFENSE }) })
        if (positions & P.FACEDOWN_DEFENSE) o.push({ label: 'Defensa boca abajo', run: () => send({ type: R.SELECT_POSITION, position: P.FACEDOWN_DEFENSE }) })
        return this.setPanel('¿En qué posición?', o)
      }
      case T.SELECT_CARD: case T.SELECT_TRIBUTE: case T.SELECT_UNSELECT_CARD: {
        const multi = m.type !== T.SELECT_UNSELECT_CARD
        type SelEntry = { code: number; controller: number; location: number; sequence: number }
        const list = (multi ? (m.selects as SelEntry[] | undefined) : (m.select_cards as SelEntry[] | undefined)) ?? []
        const min = multi ? Math.max(1, (m.min as number) ?? 1) : 1
        const max = (m.max as number) ?? min
        const rt = m.type === T.SELECT_TRIBUTE ? R.SELECT_TRIBUTE : m.type === T.SELECT_UNSELECT_CARD ? R.SELECT_UNSELECT_CARD : R.SELECT_CARD
        const needsZoneView = list.some((c) => HIDDEN_LOCS.includes(c.location))
        const uidOf = (i: number) => this.duel.resolve(list[i], list[i].code)?.uid ?? null
        this.selectCardsCtx = { list: list.map((c, i) => ({ uid: uidOf(i), code: c.code, location: c.location })), min, max, type: m.type as number, rt, canCancel: !!m.can_cancel, canFinish: !!m.can_finish, chosen: [], multi }
        const timing = this.questionTiming(m)
        this.setPanel(`Selecciona ${min === max ? min : `${min}-${max}`} carta(s)`, [],
          needsZoneView ? 'Hay cartas fuera del tablero: ábrelas para verlas' : 'Haz clic en las cartas marcadas, en el campo o en tu mano', timing)
        this.renderSelectCards()
        return
      }
      case T.ANNOUNCE_CARD: {
        const candidates: number[] = []
        for (const k in this.dbRaw) {
          const code = +k, d = this.db.get(code)
          if (!d) continue
          let valid = true
          try { valid = this.X.cardMatchesOpcode(d, m.opcodes) } catch { valid = true }
          if (valid) candidates.push(code)
        }
        this.announceCard = { candidates: candidates.length ? candidates : [...this.db.keys()] }
        this.setPanel('Declara una carta', [])
        this.commit()
        // resolved with chooseAnnouncedCard(code); we save this turn's `send`
        this.pendingAnnounceCardSend = (code: number) => send({ type: R.ANNOUNCE_CARD, card: code }, 'declara ' + this.nm(code))
        return
      }
      case T.ANNOUNCE_RACE: case T.ANNOUNCE_ATTRIB: {
        const isRace = m.type === T.ANNOUNCE_RACE
        const N = isRace ? RACES : ATTRIBUTES
        const bits: Array<[number | bigint, string]> = []
        const available = isRace ? BigInt(m.available as number) : (m.available as number)
        for (let i = 0; i < (isRace ? 64 : 32); i++) {
          const bit: number | bigint = isRace ? (1n << BigInt(i)) : (1 << i)
          const has = isRace ? ((available as bigint) >> BigInt(i)) & 1n : ((available as number) >> i) & 1
          if (has) bits.push([bit, N[String(bit)] ?? '#' + bit])
        }
        this.announceRaceCtx = { isRace, bits, count: (m.count as number) ?? 1, chosen: [] }
        this.renderAnnounceRace(isRace, send)
        return
      }
      case T.ANNOUNCE_NUMBER:
        return this.setPanel('Declara un número', ((m.options as number[] | undefined) ?? []).map((o, i) => ({
          label: String(o), run: () => send({ type: R.ANNOUNCE_NUMBER, value: i }, 'declara ' + o),
        })))
      case T.SELECT_PLACE: case T.SELECT_DISFIELD: {
        const r = this.placeFromDrop(m) ?? this.decideAI(m, 0)
        return send(r)
      }
      default: {
        const r = this.decideAI(m, 0)
        if (r) return send(r)
        return this.setPanel(`Decisión no soportada (${m.type})`, [{ label: 'Continuar', run: () => { this.clearPanel(); this.commit(); void this.loop() } }])
      }
    }
  }
  private pendingAnnounceCardSend: ((code: number) => void) | null = null
  /** Response to ANNOUNCE_CARD (name search — filtering is up to the UI over `announceCard.candidates`). */
  chooseAnnouncedCard(code: number) {
    const send = this.pendingAnnounceCardSend
    this.pendingAnnounceCardSend = null
    this.announceCard = null
    send?.(code)
  }
  private renderAnnounceRace(isRace: boolean, send: (r: unknown, label?: string) => void) {
    const ctx = this.announceRaceCtx!
    const R = this.X.OcgResponseType
    const opts: PanelOption[] = ctx.bits.map(([b, n]) => ({
      label: (ctx.chosen.includes(b) ? '✓ ' : '') + n, primary: ctx.chosen.includes(b),
      run: () => {
        ctx.chosen.push(b)
        if (ctx.chosen.length >= ctx.count) {
          send(isRace ? { type: R.ANNOUNCE_RACE, races: ctx.chosen } : { type: R.ANNOUNCE_ATTRIB, attributes: ctx.chosen }, 'declara ' + n)
        } else this.renderAnnounceRace(isRace, send)
      },
    }))
    this.setPanel(isRace ? 'Declara un Tipo' : 'Declara un Atributo', opts, ctx.count > 1 ? `Elige ${ctx.count}` : null)
  }
  private renderSelectCards() {
    const ctx = this.selectCardsCtx!
    this.selectCards = {
      min: ctx.min, max: ctx.max, multi: ctx.multi, canCancel: ctx.canCancel, canFinish: ctx.canFinish,
      needsZoneView: ctx.list.some((c) => HIDDEN_LOCS.includes(c.location)),
      list: ctx.list, chosen: [...ctx.chosen],
    }
    this.commit()
  }
  /** Select/deselect a card from the current list (index within `selectCards.list`). */
  toggleSelectCard(index: number) {
    const ctx = this.selectCardsCtx
    if (!ctx) return
    const send = (r: unknown, label?: string) => {
      this.clearPanel(); this.selectCards = null; this.selectCardsCtx = null; this.zoneView = null
      this.respondLogged(r, label ?? this.msgName({ type: ctx.type } as OcgMessage))
      this.commit(); void this.loop()
    }
    if (!ctx.multi) return send({ type: ctx.rt, index }) // SELECT_UNSELECT_CARD: one click = the response
    const k = ctx.chosen.indexOf(index)
    if (k >= 0) ctx.chosen.splice(k, 1); else ctx.chosen.push(index)
    if (ctx.chosen.length >= ctx.max && ctx.chosen.length >= ctx.min) return send({ type: ctx.rt, indicies: [...ctx.chosen] })
    this.renderSelectCards()
  }
  confirmSelectCards() {
    const ctx = this.selectCardsCtx
    if (!ctx || ctx.chosen.length < ctx.min) return
    this.clearPanel(); this.selectCards = null; this.selectCardsCtx = null; this.zoneView = null
    this.respondLogged({ type: ctx.rt, indicies: [...ctx.chosen] }, this.msgName({ type: ctx.type } as OcgMessage))
    this.commit(); void this.loop()
  }
  cancelSelectCards() {
    const ctx = this.selectCardsCtx
    if (!ctx || !ctx.canCancel) return
    this.clearPanel(); this.selectCards = null; this.selectCardsCtx = null; this.zoneView = null
    this.respondLogged({ type: ctx.rt, ...(ctx.multi ? { indicies: null } : { index: null }) }, 'cancelar')
    this.commit(); void this.loop()
  }
  finishSelectCards() {
    const ctx = this.selectCardsCtx
    if (!ctx || ctx.multi || !ctx.canFinish) return
    this.clearPanel(); this.selectCards = null; this.selectCardsCtx = null; this.zoneView = null
    this.respondLogged({ type: ctx.rt, index: null }, 'terminar')
    this.commit(); void this.loop()
  }

  private placeFromDrop(m: OcgMessage) {
    if (!this.preferredPlace) return null
    const want = this.preferredPlace
    this.preferredPlace = null
    const loc = want.zone === 'm' ? this.X.OcgLocation.MZONE : want.zone === 'st' ? this.X.OcgLocation.SZONE : null
    if (loc === null || loc === undefined) return null
    const mask = (m.field_mask as number) >>> 0
    const byteIdx = loc === this.X.OcgLocation.MZONE ? 0 : 1
    const b = (mask >>> (byteIdx * 8)) & 0xff
    if ((b >>> want.slot) & 1) return null
    return { type: this.X.OcgResponseType.SELECT_PLACE, places: [{ player: m.player, location: loc, sequence: want.slot }] }
  }

  // ── zone viewer (graveyard/banished/extra) ──
  openZoneView(owner: 0 | 1, zone: 'gy' | 'extra' | 'banish') {
    if (zone === 'extra' && owner !== this.ME) { this.logIt('aviso', { texto: 'No puedes ver el Extra Deck del rival' }); return }
    const ZL = { gy: 16, extra: 64, banish: 32 } as const
    const arr = (this.duel.zones[owner]?.[ZL[zone]] ?? []) as Array<DuelCard | null>
    const whose = owner === this.ME ? 'tu' : 'del rival'
    const title = zone === 'gy' ? 'Cementerio' : zone === 'extra' ? 'Extra Deck' : 'Cartas desterradas'
    const cards = [...arr].reverse().filter((c): c is DuelCard => !!c).map((c) => ({ code: c.code }))
    this.zoneView = { title: `${title} ${whose} — ${cards.length} carta(s)`, cards }
    this.commit()
  }
  closeZoneView() { this.zoneView = null; this.commit() }

  // ── surrender ──
  surrender() {
    if (this.surrendered) return
    this.surrendered = true
    this.logIt('rendicion', { turno: this.duel?.turnCount, lpTuyos: this.duel?.lp?.[this.ME], lpRival: this.duel?.lp?.[1 - this.ME as 0 | 1] })
    this.idle = null; this.battle = null; this.choiceMenu = null; this.pendingPlacement = null
    this.zoneView = null; this.clearPanel()
    this.banner = { text: 'TE RINDES', color: '#ff6a55', key: ++this.bannerKey }
    this.commit()
    setTimeout(() => {
      this.finished = true
      this.result = {
        won: false, reason: 'Te has rendido',
        myLp: this.duel?.lp?.[this.ME] ?? 0, opponentLp: this.duel?.lp?.[1 - this.ME as 0 | 1] ?? 0,
        turns: this.duel?.turnCount ?? 0,
        myAvatar: this.CONFIG?.myAvatar, opponentAvatar: this.CONFIG?.opponentAvatar, opponentName: this.CONFIG?.opponentName,
      }
      this.commit()
    }, 900)
  }
  /** Confirmation modal — the UI calls this to open the dialog before surrendering. */
  askSurrenderConfirm() {
    if (this.surrendered || this.finished) return
    this.confirm = { title: '¿Seguro que quieres rendirte?', text: 'El duelo termina ahora mismo y cuenta como derrota.', yesLabel: 'Sí, rendirme' }
    this.confirmYes = () => this.surrender()
    this.commit()
  }
  resolveConfirm(yes: boolean) {
    const cb = this.confirmYes
    this.confirm = null; this.confirmYes = null
    this.commit()
    if (yes) cb?.()
  }
  dismissResult() { this.result = null; this.finished = false; this.commit() }

  toggleChainMode() {
    this.chainMode = CYCLE[this.chainMode] ?? 'auto'
    this.commit()
  }

  // ════════════════════════════════════════════════════════════
  // loop
  // ════════════════════════════════════════════════════════════
  private async drain(): Promise<boolean> {
    while (this.queue.length) {
      if (this.surrendered) return true
      const e = this.queue.shift()!
      switch (e.t) {
        case 'turn': {
          const player = e.player as number
          this.banner = { text: `Turno ${e.turn} — ${player === this.ME ? 'Tú' : 'Oponente'}`, color: player === this.ME ? 'var(--gold)' : '#ff8f7a', key: ++this.bannerKey }
          this.commit(); await sleep(600); break
        }
        case 'phase': {
          this.chainActive = false; this.revealed = new Set(); this.currentTiming = null
          this.commit()
          await this.announcePhase(e.phase as number, this.duel.turnPlayer === this.ME)
          await sleep(90); break
        }
        case 'draw': case 'pos': { this.commit(); await sleep(e.t === 'draw' ? 240 : 290); break }
        case 'move': {
          const to = e.to as { location?: number } | undefined, from = e.from as { location?: number } | undefined
          if (to?.location === 32 && from?.location !== 32) this.logIt('aviso', { texto: `Desterrada: ${this.nm(e.code as number)}` })
          this.commit(); await sleep(290); break
        }
        case 'summon': {
          const uid = e.uid as number | undefined
          const card = uid ? this.duel.cards.get(uid) : undefined
          this.addToHistory(e.code as number, card?.controller === this.ME, e.kind === 'flip' ? 'volteo' : 'invoca')
          if (uid) { this.glow(uid, true); this.commit(); await sleep(400); this.glow(uid, false) }
          this.logIt('aviso', { texto: `${e.kind === 'special' ? 'Invocación especial' : e.kind === 'flip' ? 'Invocación por volteo' : 'Invoca'}: ${this.nm(e.code as number)}` })
          this.commit(); await sleep(180); break
        }
        case 'chain': {
          this.chainActive = true
          this.addToHistory(e.code as number, e.controller === this.ME, 'cadena')
          if (e.uid) this.glow(e.uid as number, true)
          this.commit(); await sleep(500)
          if (e.uid) this.glow(e.uid as number, false)
          break
        }
        case 'chainEnd': this.chainActive = false; this.revealed = new Set(); this.commit(); break
        case 'reveal': {
          const uids = (e.uids as number[] | undefined) ?? []
          if (uids.length) {
            this.revealed = new Set(uids)
            this.logIt('aviso', { texto: e.location === 2 ? 'Se revela la mano del rival' : `Se revelan ${uids.length} carta(s)` })
            this.commit(); await sleep(750)
          }
          break
        }
        case 'damageStep': this.currentTiming = e.on ? 'damage' : null; this.commit(); break
        case 'attack': {
          this.chainActive = true; this.currentTiming = 'attack'
          await this.telegraphAttack(e.uid as number, (e.targetUid as number | null) ?? null)
          break
        }
        case 'battle': await this.animateBattle(e.uid as number, (e.targetUid as number | null) ?? null); break
        case 'attackCancelled': this.logIt('aviso', { texto: 'Ataque anulado' }); this.commit(); await sleep(220); break
        case 'damage': this.popDamage(); this.commit(); await sleep(320); break
        case 'recover': case 'lp': this.commit(); await sleep(200); break
        case 'win': {
          const player = e.player as number
          if (player === this.ME) this.recordVictory()
          this.banner = { text: player === this.ME ? '¡HAS GANADO!' : 'HAS PERDIDO', color: player === this.ME ? 'var(--gold)' : '#ff6a55', key: ++this.bannerKey }
          this.clearPanel(); this.idle = null; this.battle = null; this.revealed = new Set()
          this.commit(); await sleep(1500)
          this.finished = true
          this.result = {
            won: player === this.ME, reason: REASONS[e.reason as number] ?? '',
            myLp: this.duel.lp[this.ME], opponentLp: this.duel.lp[1 - this.ME as 0 | 1], turns: this.duel.turnCount,
            myAvatar: this.CONFIG?.myAvatar, opponentAvatar: this.CONFIG?.opponentAvatar, opponentName: this.CONFIG?.opponentName,
          }
          this.commit()
          return true
        }
        case 'coreError': console.warn('[core]', e.text); break
      }
    }
    this.commit()
    return this.duel.finished
  }

  private addToHistory(code: number, mine: boolean | undefined, kind: string) {
    if (!code) return
    this.history.push({ id: ++this.historyId, code, mine: !!mine, kind })
    while (this.history.length > 24) this.history.shift()
  }
  private glow(uid: number, on: boolean) {
    if (on) this.glowing.add(uid); else this.glowing.delete(uid)
  }
  private popDamage() { /* the amount/player already travels in the `damage` event; the UI reads it from the event itself if it needs it for the popup */ }

  private async announcePhase(ph: number, mine: boolean) {
    const phaseName = PHNAME[ph] ?? ''
    if (!phaseName || phaseName === this.lastPhase) return
    this.lastPhase = phaseName
    const SUB: Record<number, string> = { 1: 'Robo', 2: 'Mantenimiento', 8: '¡A la batalla!', 512: 'Fin del turno' }
    this.phaseAnnounce = { text: phaseName, sub: SUB[ph] ?? '', mine }
    this.commit()
    await sleep(760)
    this.phaseAnnounce = null
    this.commit()
  }
  private async telegraphAttack(uid: number, targetUid: number | null) {
    this.declaringUid = uid
    this.underAttack = targetUid
    this.battleAnim = { uid, targetUid, stage: 'telegraph' }
    this.logIt('aviso', { texto: targetUid ? 'Ataque declarado' : 'Ataque directo declarado' })
    this.commit()
    await sleep(620)
    this.declaringUid = null; this.underAttack = null
    this.commit()
  }
  private async animateBattle(uid: number, targetUid: number | null) {
    this.battleAnim = { uid, targetUid, stage: 'clash' }
    this.commit()
    await sleep(targetUid ? 250 : 270)
    this.battleAnim = { uid, targetUid, stage: 'returning' }
    this.commit()
    await sleep(targetUid ? 340 : 360)
    this.battleAnim = null
    this.commit()
  }

  private async loop() {
    try { await this.loopInternal() }
    catch (e) {
      const err = e as Error
      console.error(e)
      this.logIt('ERROR', { msg: String(err?.message || err), pila: String(err?.stack || '').slice(0, 400) })
      this.setPanel('Se ha roto algo', [{ label: 'Descargar log y avisar', primary: true, run: () => { /* the UI offers the download via buildLogText() */ } }], String(err?.message || err))
    }
  }
  private async loopInternal() {
    while (true) {
      if (this.surrendered) return
      const q = await this.duel.run()
      if (this.surrendered) return
      const ended = await this.drain()
      if (ended || this.duel.finished) return
      if (!q) return
      if (q.player === this.ME) {
        // exception: if what's being selected is in the opponent's hand, it must be SHOWN
        const peeksAtOpponentHand = q.type === this.X.OcgMessageType.SELECT_CARD
          && ((q.selects as Array<{ location: number; controller: number }> | undefined) ?? []).some((s) => s.location === 2 && s.controller !== this.ME)
        const auto = peeksAtOpponentHand ? null : this.trivialFn(q)
        if (auto) { this.logIt('auto', { pregunta: this.msgName(q), respuesta: auto }); this.duel.respond(auto); continue }
        const triggerFromGY = ((q.selects as Array<{ location: number }> | undefined) ?? []).some((sel) => sel.location === 16)
        if (q.type === this.X.OcgMessageType.SELECT_CHAIN && !q.forced && this.chainMode === 'nunca' && !triggerFromGY) {
          this.duel.respond({ type: this.X.OcgResponseType.SELECT_CHAIN, index: null }); continue
        }
        const ownTrigger = q.type === this.X.OcgMessageType.SELECT_CHAIN
          && ((q.selects as Array<{ location: number }> | undefined) ?? []).some((s) => s.location === 16)
        if (q.type === this.X.OcgMessageType.SELECT_CHAIN && !q.forced && !ownTrigger && this.chainMode === 'auto' && !this.chainActive && this.duel.turnPlayer === this.ME) {
          this.logIt('auto', { pregunta: 'SELECT_CHAIN (ventana propia sin cadena)', respuesta: 'no responder' })
          this.duel.respond({ type: this.X.OcgResponseType.SELECT_CHAIN, index: null }); continue
        }
        if (!this.AUTO_KINDS.has(q.type)) this.logIt('te_pregunta', { pregunta: this.msgName(q) })
        return this.ask(q)
      }
      if (q !== this.aiLast) { this.aiLast = q; this.aiAttempt = 0 }
      const r = this.trivialFn(q) ?? this.brain?.(q, this.aiAttempt) ?? this.decideAI(q, this.aiAttempt)
      this.aiAttempt++
      if (!r) { this.logIt('ERROR', { msg: 'la IA no supo responder a ' + this.msgName(q) }); console.warn('IA sin respuesta', q); return }
      this.logIt('ia', { pregunta: this.msgName(q), respuesta: r })
      this.duel.respond(r)
      await sleep(160)
    }
  }

  // ════════════════════════════════════════════════════════════
  // startup
  // ════════════════════════════════════════════════════════════
  async boot({ X, scriptReader, cardsRaw, names, deck, extra = [], deckRival, extraRival, config = null }: GameEngineBootOptions) {
    this.X = X; this.names = names; this.CONFIG = config
    this.AUTO_KINDS = new Set([X.OcgMessageType.SELECT_PLACE, X.OcgMessageType.SELECT_DISFIELD, X.OcgMessageType.SORT_CARD])
    this.dbRaw = cardsRaw
    this.db = buildCardDb(cardsRaw)
    const lib = await X.default({ sync: true })
    this.duel = new GoatDuel({ lib, X, cardDb: this.db, scriptReader, onEvent: this.onEvent })
    this.decideAI = makeAutoPlayer(X)
    this.trivialFn = makeTrivialResolver(X)
    if (config?.level && (LEVELS as readonly string[]).includes(config.level)) this.botLevel = config.level
    if (config?.chainMode) this.chainMode = config.chainMode
    if (typeof config?.chainTimeout === 'number') this.CHAIN_TIMEOUT = config.chainTimeout

    // the coin toss comes before anything else: it decides which side you play
    const youStart = Math.random() < 0.5
    this.ME = youStart ? 0 : 1
    this.logIt('sorteo', { empiezasTu: youStart })
    await this.coinTossSequence(youStart)

    this.brain = createBrain({ X, duel: this.duel, db: this.db, names, level: this.botLevel, me: (1 - this.ME) as 0 | 1, log: (d) => this.logIt('ia_piensa', d) })

    this.chainMode = this.chainMode // (parity with main.js's button cycle; no DOM to paint here)

    const shuffle = <A,>(a: A[]): A[] => {
      const b = [...a]
      for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[b[i], b[j]] = [b[j], b[i]] }
      return b
    }
    const myDeck = shuffle(deck), opponentDeck = shuffle(deckRival ?? deck)
    const s0 = this.ME === 0 ? myDeck : opponentDeck
    const s1 = this.ME === 0 ? opponentDeck : myDeck
    const e0 = this.ME === 0 ? extra : (extraRival ?? extra)
    const e1 = this.ME === 0 ? (extraRival ?? extra) : extra
    this.logIt('mazos', { tuyo: config?.deckName, rival: config?.opponentName })
    this.SEED = (Date.now() & 0xffff) + 1
    this.DECKLOG = { mine: myDeck, opponent: opponentDeck }
    await this.duel.create({ deck0: s0, deck1: s1, extra0: e0, extra1: e1, seed: [BigInt(this.SEED), 7n, 13n, 29n] })
    this.booted = true
    this.commit()
    await this.loop()
  }
  private async coinTossSequence(youStart: boolean) {
    this.coinToss = { stage: 'spinning', youStart }; this.commit()
    await sleep(1500)
    this.coinToss = { stage: 'result', youStart }; this.commit()
    await sleep(1400)
    this.coinToss = { stage: 'hiding', youStart }; this.commit()
    await sleep(350)
    this.coinToss = null; this.commit()
  }
}
