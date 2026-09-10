import { useSyncExternalStore } from 'react'
import type { GameEngine, GameSnapshot } from './gameEngine'

/** Bridges a GameEngine instance into React. Just the subscription —
 *  components consume `GameSnapshot` fields directly. */
export function useGameEngine(engine: GameEngine): GameSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot)
}
