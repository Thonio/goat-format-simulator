/* Hand-written declaration for the prebuilt ocgcore.bundle.js (Emscripten/wasm
   glue, wasm embedded as base64, ~1.3MB minified — not something TS should
   parse for types). Field types come from src/types/ocgcore.ts; this file
   just binds them to the bundle's actual named exports (`import * as X` from
   duel.ts/autopilot.ts/trivial.ts/brain.ts/escenario.ts reads them as X.foo). */
import type { OcgLib, OcgNamespace } from '../types/ocgcore'

export const OcgLocation: OcgNamespace['OcgLocation']
export const OcgPosition: OcgNamespace['OcgPosition']
export const OcgMessageType: OcgNamespace['OcgMessageType']
export const OcgResponseType: OcgNamespace['OcgResponseType']
export const OcgProcessResult: OcgNamespace['OcgProcessResult']
export const OcgDuelMode: OcgNamespace['OcgDuelMode']
export const OcgQueryFlags: OcgNamespace['OcgQueryFlags']
export const SelectIdleCMDAction: OcgNamespace['SelectIdleCMDAction']
export const SelectBattleCMDAction: OcgNamespace['SelectBattleCMDAction']
export const ocgDuelModeString: OcgNamespace['ocgDuelModeString']
export const cardMatchesOpcode: OcgNamespace['cardMatchesOpcode']
declare const createCore: (options: { sync: boolean }) => Promise<OcgLib>
export default createCore
