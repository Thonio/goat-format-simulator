/* ══════════════════════════════════════════════════════════════════
   THE BOT'S BRAIN — four levels on top of one engine.

   The principles come from Goat's competitive material (goatformat.com
   and Pojo's "40 Common Mistakes" article):
     · Card advantage decides games, not attacking.
     · Don't spend removal on something you can kill in combat.
     · Summon BEFORE using removal, or you're gifting a Torrential Tribute.
     · Attack first with the strong monster to force out Scapegoat.
     · Save MST for Snatch Steal, Premature Burial or Call.
     · Sinister Serpent and Sangan are worth more in hand than set.
     · Thousand-Eyes Restrict without a good target isn't worth it.
     · Scapegoat on your own turn blocks your normal summon.
   ══════════════════════════════════════════════════════════════════ */
import { viewOf, type CardView } from './view'
import {
  atk, def, power, cardValue, roleOf, infoOf, advantage,
  winsCombat, diesAttacking,
} from './evaluar'
import { canon } from './knowledge'
import type { GoatDuel } from '../duel'
import type { CardRow, NamesSubset } from '../../types/cards'
import type { OcgMessage, OcgNamespace } from '../../types/ocgcore'

export const LEVELS = ['novato', 'normal', 'duro', 'experto'] as const
export type Level = (typeof LEVELS)[number]
const RANK: Record<Level, number> = { novato: 0, normal: 1, duro: 2, experto: 3 }

interface ListItem {
  code: number
  controller?: number
  location?: number
  sequence?: number
  position?: number
}

interface Handicap {
  error: number
  noChains: boolean
  dumbChain: boolean
  dumbCombat: boolean
  dumbTarget: boolean
  badSelection: boolean
  noRemoval: boolean
  noPosition: boolean
  noHolding: boolean
}

export interface CreateBrainOptions {
  X: OcgNamespace
  duel: GoatDuel
  db: Map<number, CardRow>
  names: NamesSubset
  level?: Level
  me?: number
  log?: (entry: { level: Level; msg: string; [k: string]: unknown }) => void
  handicap?: Partial<Handicap>
}

export function createBrain({ X, duel, db, names, level = 'normal', me = 1, log, handicap: handicapOverride }: CreateBrainOptions) {
  const R = X.OcgResponseType, T = X.OcgMessageType
  const IA = X.SelectIdleCMDAction, BA = X.SelectBattleCMDAction
  const n = RANK[level] ?? 1
  /* Expert-level rule ablation. With GOAT_AI_OFF="key,key" you switch
     them off one at a time to measure how much each rule contributes in
     the tournament: that's how you find out what was making it lose to
     "duro". In the browser the variable doesn't exist, so they're all on. */
  // `process` isn't declared here on purpose: this file also ships to the
  // browser app bundle (tsconfig.app.json has no "node" types), where the
  // feature-detect below must still just see it as absent, not error.
  const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  const DISABLED = new Set(String(
    nodeProcess?.env?.GOAT_AI_OFF
    || (globalThis as { GOAT_AI_OFF?: string }).GOAT_AI_OFF || '').split(',').map((x) => x.trim()).filter(Boolean))
  const exp = (k: string) => n >= 3 && !DISABLED.has(k)

  /* ── THE DIFFICULTY LADDER ──
     Measured over 300 games per matchup, the four distinct "intelligences"
     all produced the same bot: no level-specific rule changed the chosen
     move. So there is ONE brain that plays as well as it knows how, and
     the levels below are weighed down with concrete, measurable flaws,
     like chess bots. Each flaw can be switched off on its own and it
     shows in the tournament.

       error       · probability of deliberately picking a worse move
       noChains    · never responds on the opponent's turn
       dumbChain   · responds, but with whatever it grabs first
       dumbCombat  · attacks without doing the math
       dumbTarget  · picks who to attack at random
       badSelection· picks at random what to discard, search, or destroy
       noRemoval   · doesn't spend removal on its own initiative
       noPosition  · doesn't change position or flip
       noHolding   · spends cards the moment it can, without waiting for the right timing

     The numbers come from measuring each flaw separately with
     `medir-lastres.mjs`, not from guessing. */
  const HANDICAPS: Record<Level, Handicap> = {
    /* Measured with `medir-lastres.mjs`, 250 games per profile, against the
       clean brain: novato loses 84%, normal 66%, and duro 60%.
       The numbers come from there, not from intuition. */
    novato: {
      error: 0.50, noChains: true, dumbChain: false, dumbCombat: true,
      dumbTarget: true, badSelection: true, noRemoval: true,
      noPosition: true, noHolding: true,
    },
    normal: {
      error: 0.35, noChains: true, dumbChain: false, dumbCombat: true,
      dumbTarget: true, badSelection: true, noRemoval: true,
      noPosition: false, noHolding: false,
    },
    duro: {
      error: 0.20, noChains: false, dumbChain: true, dumbCombat: false,
      dumbTarget: true, badSelection: false, noRemoval: false,
      noPosition: false, noHolding: true,
    },
    experto: {
      error: 0, noChains: false, dumbChain: false, dumbCombat: false,
      dumbTarget: false, badSelection: false, noRemoval: false,
      noPosition: false, noHolding: false,
    },
  }

  // `handicap` can be forced from outside to measure how much each
  // flaw is worth on its own (see medir-lastres.mjs).
  const handicap: Handicap = { ...(HANDICAPS[level] ?? HANDICAPS.normal), ...(handicapOverride ?? {}) }
  const trace = (msg: string, extra?: Record<string, unknown>) => log?.({ level, msg, ...extra })
  const random = (p: number) => Math.random() < p

  let lastAttacker: CardView | null = null // to pick the attack target correctly
  const flipCounts = new Map<number | string, number>() // uid → number of times we've changed its position
  const cardFromList = (l: ListItem): CardView & { code: number } => ({
    code: l.code, name: names[l.code]?.name ?? '',
    data: db.get(l.code) ?? null,
    isDefense: false, faceDown: false,
  })

  /* ── do I have what it takes? queries over the legal view ── */
  const hasInHand = (v: ReturnType<typeof viewOf>, name: string) => v.hand.some((c) => canon(c.name) === name)
  const opponentUsed = (v: ReturnType<typeof viewOf>, name: string) =>
    v.opponentGraveyard.some((c) => canon(c.name) === name) || v.opponentBanished.some((c) => canon(c.name) === name)
  /* "Threat" used to mean only what was face-up, and with a board full of
     set cards the bot thought nothing was going on: it didn't spend
     removal, didn't attack — because it didn't know if it would win — and
     the duel would stall out until turn 60. A set monster is also in the
     way: if there's nothing face-up, it counts as a threat. */
  const biggestThreat = (v: ReturnType<typeof viewOf>) => {
    const faceUp = v.opponentMonsters.filter((c) => !c.faceDown).sort((a, b) => power(b) - power(a))
    if (faceUp.length) return faceUp[0]
    return v.opponentMonsters[0] ?? null
  }

  /* How much of a hurry am I in. A good player holds onto cards, but
     doesn't bury them: if they're behind or the game is dragging on, they
     play them. */
  function urgency(v: ReturnType<typeof viewOf>): number {
    let a = 0
    if (v.turn >= 8) a += 0.4
    if (v.turn >= 14) a += 0.5
    if (advantage(v) < 0) a += 0.5
    if (v.lp.mine < v.lp.opponent - 2000) a += 0.5
    if (v.lp.mine <= 2500) a += 0.4
    if (v.hand.length >= 5) a += 0.3 // full hand: need to spend
    return Math.min(a, 1.6)
  }

  /* ══════════ MAIN PHASE ══════════ */
  function mainPhase(m: OcgMessage, intento: number): Record<string, unknown> {
    const v = viewOf(duel, me, db, names)
    const rush = urgency(v)

    // ─ Novato: does the first thing it can, with no criteria ─
    if (n === 0) {
      const options: Array<{ a: number; i: number }> = []
      ;(m.summons as ListItem[] | undefined || []).forEach((_c, i) => options.push({ a: IA.SELECT_SUMMON, i }))
      ;(m.activates as ListItem[] | undefined || []).forEach((_c, i) => options.push({ a: IA.SELECT_ACTIVATE, i }))
      ;(m.spell_sets as ListItem[] | undefined || []).forEach((_c, i) => options.push({ a: IA.SELECT_SPELL_SET, i }))
      ;(m.monster_sets as ListItem[] | undefined || []).forEach((_c, i) => options.push({ a: IA.SELECT_MONSTER_SET, i }))
      if (options.length && intento < options.length) {
        const e = options[(intento + (random(0.5) ? 1 : 0)) % options.length]
        return { type: R.SELECT_IDLECMD, action: e.a, index: e.i }
      }
      return { type: R.SELECT_IDLECMD, action: m.to_bp ? IA.TO_BP : IA.TO_EP, index: null }
    }

    interface PlanItem { score: number; action: number; index: number | null; why: string; uid?: number | string }
    const plan: PlanItem[] = []
    const addPlan = (score: number, action: number, index: number | null, why: string, uid?: number | string) =>
      plan.push({ score, action, index, why, uid })

    /* 1. SUMMON. In Goat the monster comes in before removal: if you
          clean up first and summon after, you're gifting a Torrential. */
    const opponentCeiling = Math.max(0, ...v.opponentMonsters.filter((c) => !c.faceDown).map((c) => atk(c)))
    ;(m.summons as ListItem[] | undefined || []).forEach((l, i) => {
      const c = cardFromList(l), info = infoOf(c)
      let p = 3 + atk(c) / 1000
      /* Summoning face-up into something the opponent eats for free is
         gifting it away. In Goat you set and wait; the game-log scanner
         showed the bot summoning 1400-ATK monsters into a 1900 turn after
         turn. */
      if (opponentCeiling && atk(c) <= opponentCeiling && !info.noSet) p -= 1.6
      if (info.role === 'beater' || info.role === 'bomb') p += 1.2
      if (info.noSet) p += 0.4 // Sangan wants to attack
      // don't duplicate ATK: Snatch Steal kills two birds with one stone
      if (exp('atkDuplicado') && v.monsters.some((x) => !x.faceDown && atk(x) === atk(c))) p -= 1.5
      // don't overextend if the opponent has set cards and I already have a board
      if (n >= 2 && v.monsters.length >= 2 && v.opponentHiddenCount > 0 && advantage(v) >= 0) p -= 1.4
      addPlan(p, IA.SELECT_SUMMON, i, `invocar ${c.name}`)
    })

    ;(m.special_summons as ListItem[] | undefined || []).forEach((l, i) => {
      const c = cardFromList(l)
      addPlan(4.5 + atk(c) / 1000, IA.SELECT_SPECIAL_SUMMON, i, `inv. especial ${c.name}`)
    })

    /* 2. SET a monster face-down */
    ;(m.monster_sets as ListItem[] | undefined || []).forEach((l, i) => {
      const c = cardFromList(l), info = infoOf(c)
      let p = 1.6
      if (info.prefersSet) p += 1.6 // flip monsters want to be set
      if (info.noSet) p -= 3.0 // not Sinister or Sangan
      if (atk(c) < 1400) p += 0.5
      if (v.monsters.length === 0) p += 0.6
      // if something bigger is on the other side, setting it is correct
      if (opponentCeiling && atk(c) <= opponentCeiling) p += 1.4
      addPlan(p, IA.SELECT_MONSTER_SET, i, `colocar ${c.name}`)
    })

    /* 3. ACTIVATE SPELL/TRAP: this is where almost all the judgment lives */
    ;(m.activates as ListItem[] | undefined || []).forEach((l, i) => {
      const c = cardFromList(l), info = infoOf(c), name = canon(c.name)
      let p = 1.0, why = `activar ${c.name}`

      switch (info.role) {
        case 'draw':
          p = 5.0
          if (exp('graceful') && name === 'Graceful Charity') {
            // only a real +1 if there's a free discard
            const free = hasInHand(v, 'Sinister Serpent') || v.hand.some((x) => roleOf(x) === 'chaff')
            p = free ? 5.5 : 2.0 + rush * 2.2
            why += free ? ' (hay descarte gratis)'
              : (rush > 0.7 ? ' (sin descarte ideal, pero hay prisa)' : ' (sin descarte bueno: mejor esperar)')
          }
          break
        case 'handRip':
          p = 4.0
          if (exp('handRip')) {
            // Delinquent Duo is neutralized by Sinister Serpent
            const opponentSerpentGone = opponentUsed(v, 'Sinister Serpent')
            const bigHand = v.opponentHand.count >= 4
            p = opponentSerpentGone ? 4.6 : (bigHand && v.turn <= 2 ? 3.4 : 2.2 + rush * 1.5)
          }
          break
        case 'removal': {
          const target = biggestThreat(v)
          if (!target) { p = 0.2; why += ' (sin objetivo)'; break }
          // don't spend removal on something you kill in combat
          const canKillInCombat = n >= 2 && v.monsters.some((x) => !x.faceDown && winsCombat(x, target))
          p = canKillInCombat ? 0.6 : 3.2 + power(target) / 1500
          if (canKillInCombat) why += ' (lo mato en combate, no la gasto)'
          if (exp('ring') && name === 'Ring of Destruction') {
            // Ring: for something big, or to finish off life points
            const finishes = v.lp.opponent <= power(target)
            const cantKillInCombat = !v.monsters.some((x) => !x.faceDown && winsCombat(x, target))
            p = finishes ? 9.0
              : power(target) >= 1700 ? 3.8
                : cantKillInCombat ? 2.4 + rush * 1.6
                  : 1.0 + rush
            if (finishes) why += ' (remata la partida)'
          }
          if (n >= 2 && name === 'Nobleman of Crossout') {
            const hasSetMonster = v.opponentMonsters.some((c2) => c2.faceDown)
            p = hasSetMonster ? 4.2 : 0.1
          }
          break
        }
        case 'spellRemoval': {
          const targets = v.opponentBackrow.length
          if (!targets) { p = 0.1; break }
          if (exp('mst')) {
            // MST is saved for equips and revivals
            const hasGoodTarget = v.opponentBackrow.some((c2) => !c2.faceDown && ['equipSteal', 'revival'].includes(roleOf(c2)))
            p = hasGoodTarget ? 5.0 : 0.8 + rush * 2.0
            why += hasGoodTarget ? ' (sobre un equipo/reanimación)' : ' (no la malgasto en tapadas)'
          } else p = 2.2
          break
        }
        case 'massRemoval': {
          const theirs = v.opponentBackrow.length, mine = v.backrow.length
          if (n >= 2) {
            p = (theirs >= 2 && theirs > mine) ? 4.4 + theirs * 0.4 : 0.4 + rush
            if (exp('masiva') && theirs < 3 && !v.monsters.length) p = 0.3 + rush * 1.2
          } else p = theirs ? 3.0 : 0.2
          break
        }
        case 'stall': {
          // Scapegoat blocks your own summon: not on your own turn
          p = (n >= 2) ? 0.05 : 1.5
          why += ' (mejor encadenarla en el turno rival)'
          break
        }
        case 'revival': {
          const best = v.graveyard.filter((c2) => (c2.data?.type ?? 0) & 0x1).sort((a, b) => atk(b) - atk(a))[0]
          if (!best) { p = 0.1; break }
          p = 3.4 + atk(best) / 1400
          if (n >= 2 && info.lpCost && v.lp.mine < 2000) p -= 2.0
          if (exp('revivir') && v.opponentHiddenCount >= 2) p -= 1.0 // they'll respond to it
          break
        }
        case 'equipSteal': {
          const target = biggestThreat(v)
          p = target ? 5.5 + power(target) / 1200 : 0.1
          break
        }
        case 'fusion': {
          // Metamorphosis: only with a target worth it
          const bigOpponent = biggestThreat(v)
          const haveToken = v.monsters.some((c2) => atk(c2) === 0)
          if (exp('fusion')) {
            p = (bigOpponent && power(bigOpponent) >= 1500) ? 5.2 : (haveToken ? 2.2 + rush * 1.8 : 0.6 + rush)
          } else p = haveToken ? 3.0 : 1.2
          if (exp('fusion') && !bigOpponent) why += ' (sin objetivo que absorber)'
          break
        }
        case 'lock': p = 3.0; break
        default: p = 1.2
      }
      // flaw: a weak player holds onto removal until it no longer matters
      if (handicap.noRemoval && ['removal', 'massRemoval', 'spellRemoval', 'fusion', 'lock'].includes(info.role ?? ''))
        p = Math.min(p, 0.1)
      if (p > 0.15) addPlan(p, IA.SELECT_ACTIVATE, i, why)
    })

    /* 4. SET a spell/trap */
    ;(m.spell_sets as ListItem[] | undefined || []).forEach((l, i) => {
      const c = cardFromList(l), info = infoOf(c)
      let p = 1.4
      if (info.reactive || info.quick) p += 1.4 // traps and quick-plays want to be set
      if (n >= 2 && v.backrow.length >= 3) p -= 1.2 // don't fill up the whole backrow
      if (exp('cabras') && canon(c.name) === 'Scapegoat') p += 1.2 // set it to chain later
      addPlan(p, IA.SELECT_SPELL_SET, i, `colocar ${c.name}`)
    })

    /* 5. CHANGE POSITION
       BUG: this used to be a flat 0.9 and the threshold to act is 0.8, so
       as soon as there was nothing better — which is almost always — the
       bot would flip monsters for no reason. In the 2026-08-09 log (Horus
       vs PACMAN, expert) it made 72 position changes against 6 summons:
       the duel reached turn 35 with neither side able to advance. Now
       every flip is scored by what it actually achieves, and flips are
       counted per card so it can't loop even if the scoring is wrong.
       NOTE: pos_changes does NOT carry the position, only (code, zone,
       index). It has to be resolved against the mirror, like in
       battlePhase. */
    if (!handicap.noPosition) (m.pos_changes as ListItem[] | undefined || []).forEach((l, i) => {
      const real = duel.resolve(l as { controller: number; location: number; sequence: number }, l.code)
      const c = cardFromList(l), info = infoOf(c)
      const pos = real?.position ?? 0
      const faceDown = !!(pos & 0x0a)
      const isDefense = !!(pos & 0x0c)
      const threat = biggestThreat(v)
      const ceiling = threat ? power(threat) : 0
      // the FLIP bit can't be trusted in this database (Des Lacooda and
      // Medusa Worm come without it), so the table's role is also checked
      const isFlip = !!((c.data?.type ?? 0) & 0x200000) || info.role === 'flip' || info.prefersSet
      let p: number, why = `girar ${c.name}`

      /* Flipping for the sake of flipping is this bot's trap: the scanner
         counted Tsukuyomi flipped almost six times per game. A flip is
         only worth what its effect achieves RIGHT THERE: Tsukuyomi with
         nothing to shut off does nothing, and neither does Magician of
         Faith with no spells in the graveyard. */
      const canonName = canon(c.name)
      const flipWorks =
        canonName === 'Tsukuyomi' ? v.opponentMonsters.some((x) => !x.faceDown)
          : canonName === 'Magician of Faith' ? v.graveyard.some((x) => (x.data?.type ?? 0) & 0x2)
            : canonName === 'Night Assailant' ? v.graveyard.some((x) => (x.data?.type ?? 0) & 0x1)
              : true

      if (faceDown) { // flipping = flip summon
        if (isFlip && flipWorks) { p = 2.4; why += ' (invocación por volteo: dispara su efecto)' }
        else if (isFlip) { p = 0.2; why += ' (su efecto no conseguiría nada ahora)' }
        else if (!threat) { p = 1.5; why += ' (campo rival vacío: la saco a pegar)' }
        else if (atk(c) > ceiling) { p = 1.3; why += ' (a cara descubierta gana el combate)' }
        else { p = 0.05; why += ' (descubierta se la comen)' }
      } else if (isDefense) { // defense → attack
        if (!threat) { p = 1.6 + atk(c) / 2500; why += ' (a atacar: no hay nada delante)' }
        else if (atk(c) > ceiling) { p = 1.4; why += ' (ya gana el combate)' }
        else { p = 0.05; why += ' (atacando no consigue nada)' }
      } else { // attack → defense
        if (threat && ceiling >= atk(c) && def(c) > atk(c)) { p = 1.2; why += ' (se refugia: no aguanta de frente)' }
        else { p = 0.05; why += ' (no hace falta esconderla)' }
      }

      // loop brake: flipping the same card over and over is never a plan
      const uid = real?.uid ?? `${l.code}:${l.sequence}`
      const timesFlipped = flipCounts.get(uid) ?? 0
      if (timesFlipped >= 2) { p = Math.min(p, 0.05); why += ` (ya girada ${timesFlipped} veces)` }

      addPlan(p, IA.SELECT_POS_CHANGE, i, why, uid)
    })

    plan.sort((a, b) => b.score - a.score)
    /* Level flaw: every so often it deliberately picks a worse move. It's
       not decorative noise — it's what separates novato from experto,
       and it can be measured by turning it off. */
    if (handicap.error && plan.length > 1 && random(handicap.error))
      plan.unshift(plan.splice(1 + ((Math.random() * (plan.length - 1)) | 0), 1)[0])

    const chosen = plan[intento]
    if (chosen && chosen.score > 0.8) {
      trace(chosen.why, { puntos: +chosen.score.toFixed(2) })
      if (chosen.action === IA.SELECT_POS_CHANGE && chosen.uid != null)
        flipCounts.set(chosen.uid, (flipCounts.get(chosen.uid) ?? 0) + 1)
      return { type: R.SELECT_IDLECMD, action: chosen.action, index: chosen.index }
    }
    // nothing worth doing: move to battle or end the phase
    return { type: R.SELECT_IDLECMD, action: m.to_bp ? IA.TO_BP : IA.TO_EP, index: null }
  }

  /* ══════════ BATTLE PHASE ══════════ */
  function battlePhase(m: OcgMessage, intento: number): Record<string, unknown> {
    const v = viewOf(duel, me, db, names)
    const attacks = (m.attacks as ListItem[] | undefined || []).map((l, i) => {
      const c = duel.resolve(l as { controller: number; location: number; sequence: number }, l.code)
      const myCard: CardView | null = c ? { name: names[c.code]?.name ?? '', data: db.get(c.code) ?? null, isDefense: false, faceDown: false } : null
      return { i, c: myCard }
    }).filter((a): a is { i: number; c: CardView } => !!a.c)

    if (!attacks.length)
      return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? BA.TO_M2 : BA.TO_EP, index: null }

    /* Combat flaw: attacking with everything without looking. It's THE
       rookie mistake and the one that gives away the most games, so it's
       the one that separates the levels the most. */
    if (handicap.dumbCombat) {
      if (intento < attacks.length)
        return { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: attacks[intento].i }
      return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? BA.TO_M2 : BA.TO_EP, index: null }
    }

    const opponents = v.opponentMonsters
    /* How much attacking with this monster is worth, looking at ALL
       targets. The game scanner showed 58% of attacks achieved nothing:
       they were thrown at defense monsters they couldn't break. An
       attack that neither kills nor dies is wasted tempo, and on top of
       that it eats the opponent's Sakuretsu for nothing. */
    const worthAttacking = (c: CardView) => {
      if (!opponents.length) return 8 + atk(c) / 1000 // direct: always
      let best = -9
      for (const r of opponents) {
        const kills = winsCombat(c, r), dies = diesAttacking(c, r)
        let s: number
        if (kills && !dies) s = 4 + power(r) / 1000 // you take it for free
        else if (kills && dies) s = 1.0 + (cardValue(r) - cardValue(c)) // trade
        else if (!kills && !dies) s = -0.6 // nothing happens: don't attack
        else s = -4 // suicide
        best = Math.max(best, s)
      }
      return best
    }

    const scored = attacks.map((a) => ({ ...a, p: worthAttacking(a.c) }))
      .filter((a) => a.p > 0.2)
      // the one that gets the most, not the biggest, goes first
      .sort((a, b) => b.p - a.p)

    /* A reasoned brake: if the opponent has set cards, hasn't yet shown a
       mass trap, and you're already ahead, don't swing in with the whole
       board. */
    const trapsRevealed = opponentUsed(v, 'Mirror Force') || opponentUsed(v, 'Torrential Tribute')
    const cautious = !trapsRevealed && v.opponentHiddenCount >= 2 && v.monsters.length >= 3
      && advantage(v) > 2 && v.lp.opponent > 3000
    const list = cautious ? scored.slice(0, 1) : scored

    if (intento < list.length) {
      lastAttacker = list[intento].c
      trace(`ataca con ${list[intento].c.name}`, { valor: +list[intento].p.toFixed(2) })
      return { type: R.SELECT_BATTLECMD, action: BA.SELECT_BATTLE, index: list[intento].i }
    }
    return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? BA.TO_M2 : BA.TO_EP, index: null }
  }

  /* ══════════ CHAINS ══════════ */
  function chain(m: OcgMessage, intento: number): Record<string, unknown> {
    const v = viewOf(duel, me, db, names)
    const options = (m.selects as ListItem[] | undefined || []).map((l, i) => ({ i, c: cardFromList(l) }))
    if (!options.length) return { type: R.SELECT_CHAIN, index: null }
    if (m.forced) return { type: R.SELECT_CHAIN, index: intento % options.length }

    /* Low levels don't respond on the opponent's turn: half of Goat's
       traps go unused and it shows heavily on the scoreboard. */
    if (handicap.noChains) return { type: R.SELECT_CHAIN, index: null }
    // flaw: responds with whatever it has, without thinking about whether it's the right call
    if (handicap.dumbChain) return { type: R.SELECT_CHAIN, index: random(0.4) ? ((Math.random() * options.length) | 0) : null }

    const score = (o: (typeof options)[number]) => {
      const info = infoOf(o.c), name = canon(o.c.name)
      // Scapegoat: exactly what you chain on the opponent's turn
      if (name === 'Scapegoat') return v.myTurn ? -1 : (v.monsters.length === 0 ? 6 : 3)
      if (name === 'Book of Moon') return n >= 2 ? 3.5 : 2
      if (info.role === 'trapMass') return v.opponentMonsters.length >= 2 ? 6 : 1.5
      if (info.role === 'trapRemoval') return 4
      if (info.role === 'counter') return exp('counter') ? (v.lp.mine > 4000 ? 4.5 : 1) : 2
      if (info.role === 'removal' && info.quick) return 4
      if (info.role === 'spellRemoval') return 3
      return 2
    }
    /* NEVER respond to your own card. In the 2026-08-10 duel the expert
       bot negated its own Trap Dustshoot with Solemn Judgment and paid
       half its life for nothing: it saw "there's a response window and I
       have a counter-trap" without checking whose link was on top. */
    const topLink = duel.chainLinks?.[duel.chainLinks.length - 1] ?? null
    if (topLink && topLink.controller === me) {
      trace('no me encadeno a mi propia carta')
      return { type: R.SELECT_CHAIN, index: null }
    }
    const ordered = options.map((o) => ({ ...o, p: score(o) })).filter((o) => o.p > 2.4).sort((a, b) => b.p - a.p)
    if (intento < ordered.length) {
      trace(`encadena ${ordered[intento].c.name}`)
      return { type: R.SELECT_CHAIN, index: ordered[intento].i }
    }
    return { type: R.SELECT_CHAIN, index: null }
  }

  /* ══════════ SELECTIONS ══════════ */
  function chooseCards(m: OcgMessage, intento: number): Record<string, unknown> | null {
    const list = (m.type === T.SELECT_UNSELECT_CARD ? (m.select_cards as ListItem[] | undefined) : (m.selects as ListItem[] | undefined)) || []
    if (!list.length) return null

    /* Flaw: discarding, searching, or destroying carelessly. This is
       where it's decided which card goes to the graveyard and what gets
       searched from the deck, and a bad player does it without looking. */
    if (handicap.badSelection && m.type !== T.SELECT_UNSELECT_CARD) {
      const min = Math.max(1, (m.min as number) ?? 1), max = (m.max as number) ?? min
      const idx = list.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, Math.min(max, Math.max(min, 1)))
      return { type: m.type === T.SELECT_TRIBUTE ? R.SELECT_TRIBUTE : R.SELECT_CARD, indicies: idx }
    }

    /* Picking who to attack. It used to take "the most valuable card",
       which is exactly how a monster suicides into a bigger one. */
    const inBattle = [8, 16, 32, 64, 128].includes(duel.phase)
    if (n >= 1 && inBattle && lastAttacker && m.type === T.SELECT_CARD
      && list.every((l) => l.location === 4)) {
      const candidates = list.map((l, i) => {
        const c = cardFromList(l)
        const target: CardView = { ...c, isDefense: !!((l.position ?? 0) & 0x0c), faceDown: !!((l.position ?? 0) & 0x0a) }
        return {
          i, target, wins: winsCombat(lastAttacker!, target),
          dies: diesAttacking(lastAttacker!, target),
          value: cardValue(target) + power(target) / 2000,
        }
      })
      const good = candidates.filter((c) => c.wins && !c.dies).sort((a, b) => b.value - a.value)
      let chosen = good[0] ?? candidates.sort((a, b) => power(a.target) - power(b.target))[0]
      // picking the right attack target is where the real skill is
      if (handicap.dumbTarget) chosen = candidates[(Math.random() * candidates.length) | 0]
      trace(`objetivo: ${chosen.target.name}`)
      return { type: R.SELECT_CARD, indicies: [chosen.i] }
    }
    /* Thousand-Eyes Restrict absorbs by copying the target's ATK. If it
       absorbs a face-down card it's left at 0 ATK and attacks with 0:
       measured in check-cartas.mjs (face-up → 1900, face-down → 0). So
       among the opponent's monsters, only face-up ones, and the one with
       the highest attack. */
    if (m.type === T.SELECT_CARD && list.length > 1
      && list.every((l) => l.location === 4) && !inBattle) {
      const opponents = list.map((l, i) => ({ i, l, c: cardFromList(l), faceDown: !!((l.position ?? 0) & 0x0a) }))
        .filter((x) => x.l.controller !== me)
      const faceUp = opponents.filter((x) => !x.faceDown)
      if (faceUp.length) {
        const best = faceUp.sort((a, b) => power(b.c) - power(a.c))[0]
        trace(`objetivo boca arriba: ${best.c.name}`)
        return { type: R.SELECT_CARD, indicies: [best.i] }
      }
    }
    const isTribute = m.type === T.SELECT_TRIBUTE
    const isDiscard = m.type === T.SELECT_CARD && (m.selects as ListItem[] | undefined)?.every((l) => l.location === 2)
    const score = (l: ListItem) => {
      const c = cardFromList(l)
      let value = cardValue(c)
      const info = infoOf(c)
      if (isTribute || isDiscard) {
        // sacrifice/discard whatever hurts least; Sinister comes back on its own
        if (canon(c.name) === 'Sinister Serpent') value = 0.1
        if (info.role === 'chaff') value -= 0.4
        return value // lower is better
      }
      return -value - power(c) / 2000 // destroy/steal the most valuable
    }
    const ordered = list.map((l, i) => ({ i, p: score(l) })).sort((a, b) => a.p - b.p)
    if (n === 0) ordered.sort(() => Math.random() - 0.5)
    const min = Math.max(1, (m.min as number) ?? 1), max = Math.min((m.max as number) ?? min, list.length)
    /* If it's a COST (tribute, discard) take the minimum. If it's a
       BENEFIT (search the deck, recover from the graveyard) take the
       maximum: Thunder Dragon lets you add two copies and the AI used to
       take one. */
    const fromHiddenZone = list.every((l) => [1, 16, 32].includes(l.location ?? -1))
    const benefit = !isTribute && !isDiscard && fromHiddenZone
    const count = benefit ? Math.max(min, max) : Math.min(Math.max(min, 1), Math.max(max, 1))
    const offset = intento % Math.max(1, ordered.length - count + 1)
    const idx = ordered.slice(offset, offset + count).map((o) => o.i)
    if (m.type === T.SELECT_UNSELECT_CARD)
      return { type: R.SELECT_UNSELECT_CARD, index: (m.can_finish && intento >= list.length) ? null : idx[0] }
    return { type: isTribute ? R.SELECT_TRIBUTE : R.SELECT_CARD, indicies: idx }
  }

  /* ══════════ POSITION AND YES/NO ══════════ */
  function position(m: OcgMessage): Record<string, unknown> {
    const P = X.OcgPosition
    const v = viewOf(duel, me, db, names)
    const can = (p: number) => (m.positions as number) & p
    if (n === 0) return { type: R.SELECT_POSITION, position: can(P.FACEUP_ATTACK) ? P.FACEUP_ATTACK : P.FACEUP_DEFENSE }

    /* It used to compare the NUMBER of monsters, so a Thousand-Eyes
       Restrict would end up in defense even with the opponent's board
       empty. What matters is whether something can kill it and whether
       there's anything to hit. */
    const myCard: CardView = { name: null, data: db.get(m.code as number) ?? null, isDefense: false, faceDown: false }
    const threat = v.opponentMonsters.reduce((mx, c) => Math.max(mx, c.faceDown ? 1500 : power(c)), 0)
    const opponentFieldEmpty = v.opponentMonsters.length === 0
    const survives = atk(myCard) > threat

    if ((opponentFieldEmpty || survives) && can(P.FACEUP_ATTACK))
      return { type: R.SELECT_POSITION, position: P.FACEUP_ATTACK }
    if (can(P.FACEUP_DEFENSE) && def(myCard) >= atk(myCard))
      return { type: R.SELECT_POSITION, position: P.FACEUP_DEFENSE }
    if (can(P.FACEUP_ATTACK)) return { type: R.SELECT_POSITION, position: P.FACEUP_ATTACK }
    if (can(P.FACEUP_DEFENSE)) return { type: R.SELECT_POSITION, position: P.FACEUP_DEFENSE }
    return { type: R.SELECT_POSITION, position: P.FACEDOWN_DEFENSE }
  }
  function yesNo(_m: OcgMessage, type: number): Record<string, unknown> {
    if (n === 0) return { type, yes: random(0.6) }
    return { type, yes: true } // optional effects are usually worth taking
  }

  /* ══════════ ENTRY POINT ══════════ */
  return function decide(m: OcgMessage, intento = 0): Record<string, unknown> | null {
    switch (m.type) {
      case T.SELECT_IDLECMD: return mainPhase(m, intento)
      case T.SELECT_BATTLECMD: return battlePhase(m, intento)
      case T.SELECT_CHAIN: return chain(m, intento)
      case T.SELECT_CARD:
      case T.SELECT_TRIBUTE:
      case T.SELECT_UNSELECT_CARD: return chooseCards(m, intento)
      case T.ANNOUNCE_CARD: {
        /* A player knows their own deck: it declares the card with the
           most copies remaining, which is the correct play with
           Archfiend's Oath. */
        const deck = duel.zones[me as 0 | 1][1] ?? []
        const counts = new Map<number, number>()
        for (const c of deck as Array<{ code: number } | null>) if (c) counts.set(c.code, (counts.get(c.code) || 0) + 1)
        const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1])
        for (const [code] of ordered) {
          const d = db.get(code)
          if (!d) continue
          let valid = true
          try { valid = X.cardMatchesOpcode(d, m.opcodes) } catch { valid = true }
          if (valid) { trace(`declara ${names[code]?.name ?? code}`); return { type: R.ANNOUNCE_CARD, card: code } }
        }
        return null
      }
      case T.SELECT_POSITION: return position(m)
      case T.SELECT_EFFECTYN: return yesNo(m, R.SELECT_EFFECTYN)
      case T.SELECT_YESNO: return yesNo(m, R.SELECT_YESNO)
      default: return null // everything else is resolved by the generic autopilot
    }
  }
}
