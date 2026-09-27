// @vitest-environment node
/* ════════════════════════════════════════════════════════════════
   ARE WE PLAYING WITH THE 2005 RULES?

   Two separate checks:
   1) which historical rule switches MODE_GOAT turns on, one by one,
      cross-checked against goatformat.com's list of differences;
   2) hand-assembled games where those rules actually show up.

   Port of check-reglas.mjs.
   ════════════════════════════════════════════════════════════════ */
import { describe, expect, it } from 'vitest'
import { setUp, X, P, T } from '../support/scenario'

const M = X.OcgDuelMode, GOAT = M.MODE_GOAT
const active = (f: bigint) => (GOAT & f) === f && f !== 0n

/* The 20 historical differences from goatformat.com, with the engine
   switch that implements them (or null if it's not a matter of a flag). */
const LIST: Array<[string, bigint | null, string?]> = [
  ['1  the player going first draws on turn 1', M.FIRST_TURN_DRAW],
  ['2  Main/Fusion Deck with no size limit', null, 'not an engine matter: the deck builder handles it'],
  ['3  only one Field Spell active across both players', M.ONE_FACEUP_FIELD],
  ['4  priority for ignition effects', M.OBSOLETE_IGNITION],
  ['5  historical attack replay', M.STORE_ATTACK_REPLAYS],
  ['6  Continuous Trap: activating != using its effect', M.USE_TRAPS_IN_NEW_CHAIN],
  ['7  hand/deck verification', null, 'in-person tournament rule; not applicable'],
  ['8  Failure to Find (search with no target)', null, 'lives in each card\u2019s Lua script'],
  ['9  historical SEGOC', M.TCG_SEGOC_NONPUBLIC | M.TCG_SEGOC_FIRSTTRIGGER],
  ['10 six windows in the Damage Step', M.SIX_STEP_BATLLE_STEP],
  ['11 match/decklist procedure', null, 'no matches yet'],
  ['12 triggers detected mid-chain', M.TRIGGER_WHEN_PRIVATE_KNOWLEDGE],
  ['13 Relinquished/TER as an equip', M.EQUIP_NOT_SENT_IF_MISSING_TARGET],
  ['14 reposition a monster drawn this turn', M.CAN_REPOS_IF_NON_SUMPLAYER],
  ['15 0 ATK vs 0 ATK: both die', M.ZERO_ATK_DESTROYED],
  ['16 LP costs and activating with no cards to draw', null, 'lives in each card\u2019s Lua script'],
  ['17 infinite loops', null, 'resolved by the engine, no flag'],
  ['18 old Union rules', null, 'lives in each card\u2019s Lua script'],
  ['19 responses to the end-of-turn discard', M.TRIGGER_WHEN_PRIVATE_KNOWLEDGE],
  ['20 a single chain per Damage Step substep', M.SINGLE_CHAIN_IN_DAMAGE_SUBSTEP],
]

describe('rule flags MODE_GOAT turns on', () => {
  it('every flag-controlled difference is enabled', () => {
    const flagControlled = LIST.filter(([, flag]) => flag !== null)
    for (const [text, flag] of flagControlled) expect(active(flag as bigint), text).toBe(true)
    expect(flagControlled.length).toBeGreaterThan(0)
  })
})

describe('the same rules, in hand-built games', () => {
  it('the player going first has 6 cards in their first Main Phase (FIRST_TURN_DRAW)', async () => {
    const e = await setUp({}, {})
    await e.run((m) => (m.type === T.SELECT_IDLECMD ? 'STOP' : null), 200)
    const t = e.turnPlayer
    expect(e.hand(t).length).toBe(6)
    expect(e.hand(1 - t).length).toBe(5)
  })

  it('two 0 ATK monsters clash and both are destroyed', async () => {
    const e = await setUp(
      { monsters: [{ card: 'Ojama Green', pos: P.FACEUP_ATTACK }] },
      { monsters: [{ card: 'Chaos Necromancer', pos: P.FACEUP_ATTACK }] })
    let attacks = 0
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD)
        return { type: X.OcgResponseType.SELECT_IDLECMD, action: m.to_bp ? X.SelectIdleCMDAction.TO_BP : X.SelectIdleCMDAction.TO_EP, index: null }
      if (m.type === T.SELECT_BATTLECMD) {
        if ((m.attacks as unknown[] | undefined)?.length && !attacks) {
          attacks++
          return { type: X.OcgResponseType.SELECT_BATTLECMD, action: X.SelectBattleCMDAction.SELECT_BATTLE, index: 0 }
        }
        if (attacks) return 'STOP'
        return { type: X.OcgResponseType.SELECT_BATTLECMD, action: m.to_ep ? X.SelectBattleCMDAction.TO_EP : X.SelectBattleCMDAction.TO_M2, index: null }
      }
      return null
    }, 600)
    const alive = e.field(0).length + e.field(1).length
    expect(attacks).toBeGreaterThan(0)
    expect(alive).toBe(0)
    expect(e.gy(0).some((c) => c.name === 'Ojama Green')).toBe(true)
    expect(e.gy(1).some((c) => c.name === 'Chaos Necromancer')).toBe(true)
  })

  it('only one Field Spell may exist across the table, and it lives in M/T slot 5, not FZONE', async () => {
    const e = await setUp({ hand: ['Umi'] }, { hand: ['Wasteland'] })
    let activated = 0
    await e.run((m) => {
      if (m.type === T.SELECT_IDLECMD) {
        // the hand only has the Field Spell and vanilla monsters: the only
        // possible activation is the one we're after
        if ((m.activates as unknown[] | undefined)?.length && activated < 2) {
          activated++
          return { type: X.OcgResponseType.SELECT_IDLECMD, action: X.SelectIdleCMDAction.SELECT_ACTIVATE, index: 0 }
        }
        if (activated >= 2) return 'STOP'
        return { type: X.OcgResponseType.SELECT_IDLECMD, action: X.SelectIdleCMDAction.TO_EP, index: null }
      }
      return null
    }, 600)
    /* NOTE: under 2005 rules the Field Spell does NOT live in FZONE. The
       engine puts it in slot 5 of the spell/trap zone. */
    const onTable = [...e.spellTrap(0), ...e.spellTrap(1)].filter((c) => ['Umi', 'Wasteland'].includes(c.name))
    const inFZone = e.fzone(0).length + e.fzone(1).length
    expect(activated).toBeGreaterThanOrEqual(2)
    expect(onTable.length).toBe(1)
    expect(e.gy(0).some((c) => c.name === 'Umi')).toBe(true)
    expect(inFZone).toBe(0)
  })
})
