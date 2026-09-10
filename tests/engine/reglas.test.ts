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
import { setUp, X, P, T } from '../support/escenario'

const M = X.OcgDuelMode, GOAT = M.MODE_GOAT
const active = (f: bigint) => (GOAT & f) === f && f !== 0n

/* The 20 historical differences from goatformat.com, with the engine
   switch that implements them (or null if it's not a matter of a flag). */
const LIST: Array<[string, bigint | null, string?]> = [
  ['1  el que empieza roba en el turno 1', M.FIRST_TURN_DRAW],
  ['2  Main/Fusion Deck sin límite de tamaño', null, 'no lo controla el motor: lo controla el deck builder'],
  ['3  solo un Field Spell activo entre los dos', M.ONE_FACEUP_FIELD],
  ['4  prioridad para efectos de ignición', M.OBSOLETE_IGNITION],
  ['5  replay de ataque histórico', M.STORE_ATTACK_REPLAYS],
  ['6  Trampa Continua: activar ≠ usar su efecto', M.USE_TRAPS_IN_NEW_CHAIN],
  ['7  verificación de mano/deck', null, 'regla de torneo presencial; no aplica'],
  ['8  Failure to Find (buscar sin objetivo)', null, 'va en el script Lua de cada carta'],
  ['9  SEGOC histórico', M.TCG_SEGOC_NONPUBLIC | M.TCG_SEGOC_FIRSTTRIGGER],
  ['10 seis ventanas en el Damage Step', M.SIX_STEP_BATLLE_STEP],
  ['11 procedimiento de match/tablas', null, 'no hay matches todavía'],
  ['12 triggers detectados en mitad de cadena', M.TRIGGER_WHEN_PRIVATE_KNOWLEDGE],
  ['13 Relinquished/TER como equipo', M.EQUIP_NOT_SENT_IF_MISSING_TARGET],
  ['14 cambiar posición de un monstruo recién robado', M.CAN_REPOS_IF_NON_SUMPLAYER],
  ['15 0 ATK contra 0 ATK: mueren los dos', M.ZERO_ATK_DESTROYED],
  ['16 costes de LP y activar sin cartas para robar', null, 'va en el script Lua de cada carta'],
  ['17 bucles infinitos', null, 'lo resuelve el motor, no hay flag'],
  ['18 reglas antiguas de Union', null, 'va en el script Lua de cada carta'],
  ['19 respuestas al descarte de final de turno', M.TRIGGER_WHEN_PRIVATE_KNOWLEDGE],
  ['20 una sola cadena por subpaso del Damage Step', M.SINGLE_CHAIN_IN_DAMAGE_SUBSTEP],
]

describe('interruptores de reglas que enciende MODE_GOAT', () => {
  it('todas las diferencias que dependen de un flag del motor están encendidas', () => {
    const flagControlled = LIST.filter(([, flag]) => flag !== null)
    for (const [text, flag] of flagControlled) expect(active(flag as bigint), text).toBe(true)
    expect(flagControlled.length).toBeGreaterThan(0)
  })
})

describe('las mismas reglas, en partidas montadas a mano', () => {
  it('el jugador que empieza tiene 6 cartas en su primera Main Phase (FIRST_TURN_DRAW)', async () => {
    const e = await setUp({}, {})
    await e.run((m) => (m.type === T.SELECT_IDLECMD ? 'STOP' : null), 200)
    const t = e.turnPlayer
    expect(e.hand(t).length).toBe(6)
    expect(e.hand(1 - t).length).toBe(5)
  })

  it('dos monstruos de 0 ATK chocan y se destruyen los dos', async () => {
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

  it('solo puede haber un Field Spell en toda la mesa, y vive en el puesto 5 de M/T, no en FZONE', async () => {
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
