/* Duel screen root. Port of main.js + view.js already joined together:
   reads the GameSnapshot via useGameEngine and routes a card click to
   the right GameEngine method — the same "routing" `clickHandler` did
   in view.js, wired up by armIdle/armBattle in the original. */
import { useCallback, useMemo, useState } from 'react'
import { LOC, type DuelCard } from '../../engine/duel'
import type { GameEngine } from '../../game/gameEngine'
import { useGameEngine } from '../../game/useGameEngine'
import { HandOrder, type ZoneKey } from '../../render/layout'
import { Board } from './Board'
import { Topbar, LpBar, PhasesStrip, ToastLayer, PhaseCardBanner, Controls, DetailPanel, CardHistory } from './Hud'
import { PromptPanel } from './PromptPanel'
import { ZoneViewModal, ConfirmModal, CoinTossOverlay, EndScreen, ChoiceMenuPopup } from './Modals'

const isFD = (p: number) => !!(p & 0x0a)

export interface DuelScreenProps {
  engine: GameEngine
  useImages?: boolean
  /** "Exit to menu" — the menu screen lives in a later step. */
  onExit?: () => void
  onNewDuel?: () => void
}

export function DuelScreen({ engine, useImages = true, onExit, onNewDuel }: DuelScreenProps) {
  const snapshot = useGameEngine(engine)
  const [hovered, setHovered] = useState<number | null>(null)
  const handOrder = useMemo(() => new HandOrder(), [])

  const zoneOf = (loc: number): 'gy' | 'extra' | 'banish' | null =>
    loc === LOC.GRAVE ? 'gy' : loc === LOC.EXTRA ? 'extra' : loc === LOC.REMOVED ? 'banish' : null

  const routeCard = useCallback((card: DuelCard) => {
    if (snapshot.selectCards) {
      const i = snapshot.selectCards.list.findIndex((it) => it.uid === card.uid)
      if (i >= 0) { engine.toggleSelectCard(i); return }
    }
    const zv = zoneOf(card.location)
    if (zv) { engine.openZoneView(card.controller as 0 | 1, zv); return }
    if (snapshot.battle) { engine.declareAttack(card.uid); return }
    if (snapshot.idle) { engine.clickIdleCard(card.uid); return }
  }, [engine, snapshot.selectCards, snapshot.battle, snapshot.idle])

  const onCardHover = useCallback((card: DuelCard) => {
    const revealed = snapshot.revealed.has(card.uid)
    const hiddenFD = !revealed && isFD(card.position) && card.controller !== snapshot.me
    const inDeck = !revealed && (card.location === LOC.DECK
      || (card.location === LOC.EXTRA && card.controller !== snapshot.me)
      || (card.location === LOC.HAND && card.controller !== snapshot.me))
    if (hiddenFD || inDeck) return
    setHovered(card.code)
  }, [snapshot.revealed, snapshot.me])

  const onSlotClick = useCallback((owner: 0 | 1, zone: ZoneKey) => {
    if (zone === 'gy' || zone === 'extra' || zone === 'banish') { engine.openZoneView(owner, zone); return }
    if (zone !== 'm' && zone !== 'st' && zone !== 'field') return
    const loc = zone === 'm' ? LOC.MZONE : zone === 'st' ? LOC.SZONE : LOC.FZONE
    const arr = (snapshot.zones as unknown as Record<0 | 1, Record<number, Array<DuelCard | null>>> | null)?.[owner]?.[loc]
    const card = arr?.[zone === 'field' ? 0 : 0]
    // the "Field" slot can look empty while the Field Spell is actually in S/T slot 5
    const real = zone === 'field'
      ? (arr?.[0] ?? (snapshot.zones as unknown as Record<0 | 1, Record<number, Array<DuelCard | null>>> | null)?.[owner]?.[LOC.SZONE]?.[5])
      : card
    if (real) routeCard(real)
  }, [engine, snapshot.zones, routeCard])

  return (
    <div>
      <Topbar engine={engine} snapshot={snapshot} onExit={onExit ?? (() => location.reload())} />
      <div id="wrap">
        <DetailPanel code={hovered} db={snapshot.db} names={snapshot.names} useImages={useImages} />
        <Board engine={engine} snapshot={snapshot} db={snapshot.db} names={snapshot.names} useImages={useImages}
          onCardClick={routeCard} onCardHover={onCardHover} onSlotClick={onSlotClick} handOrder={handOrder}>
          <LpBar side="opp" snapshot={snapshot} />
          <LpBar side="me" snapshot={snapshot} />
          <PhasesStrip snapshot={snapshot} />
          <CardHistory snapshot={snapshot} db={snapshot.db} useImages={useImages} onHover={setHovered} />
          <ToastLayer snapshot={snapshot} />
          <PhaseCardBanner snapshot={snapshot} />
          <PromptPanel engine={engine} snapshot={snapshot} names={snapshot.names} />
          <Controls engine={engine} snapshot={snapshot} />
        </Board>
      </div>
      <CoinTossOverlay snapshot={snapshot} />
      <ZoneViewModal engine={engine} snapshot={snapshot} db={snapshot.db} names={snapshot.names} useImages={useImages} />
      <ConfirmModal engine={engine} snapshot={snapshot} />
      <EndScreen engine={engine} snapshot={snapshot} onNew={onNewDuel ?? (() => location.reload())} />
      <ChoiceMenuPopup snapshot={snapshot} />
    </div>
  )
}
