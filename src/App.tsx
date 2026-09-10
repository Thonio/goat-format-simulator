/* Simulator root. Port of the final `<script type="module">` block from
   template.html (menu + `lanzarDuelo()` + `boot()`) — the one piece of
   main.js/template.html that didn't have its own module in the original. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { GameEngine } from './game/gameEngine'
import { DuelScreen } from './components/simulator/DuelScreen'
import { Menu } from './components/simulator/menu/Menu'
import { findDeck, listDecks, loadConfig, saveConfig, avatarSrc, avatarName, AVATAR_AI, type MenuConfig } from './components/simulator/menu/config'
import type { StartOptions } from './components/simulator/menu/Play'
import { setLanguage } from './i18n/i18n'
import type { CardsSubset, NamesSubset } from './types/cards'
import type { OcgNamespace } from './types/ocgcore'

interface EngineModules { X: OcgNamespace; scriptReader: (name: string) => string; cardsRaw: CardsSubset; names: NamesSubset }

/* The engine bundles weigh >1MB each: they load in the background as soon
   as the app mounts (they don't block the menu), and only if the player
   hits "play" before they finish does a `#boot` waiting screen show — the
   one real difference from the original, which had them inlined in the
   same HTML and so never had this loading gap. */
async function loadEngineModules(): Promise<EngineModules> {
  const [X, scriptsMod, cardsRaw, names] = await Promise.all([
    import('./vendor/ocgcore.bundle.js') as unknown as Promise<OcgNamespace>,
    import('./vendor/scripts.bundle.js') as unknown as Promise<{ scriptReader: (name: string) => string }>,
    import('./vendor/cards.subset.json') as unknown as Promise<{ default: CardsSubset }>,
    import('./vendor/names.subset.json') as unknown as Promise<{ default: NamesSubset }>,
  ])
  return { X, scriptReader: scriptsMod.scriptReader, cardsRaw: cardsRaw.default, names: names.default }
}

/* On mobile, the URL bar and nav bar eat up a third of the screen;
   fullscreen removes them, and while we're at it we also try to lock
   landscape orientation, the only one the board fits in. */
async function fullscreen() {
  try {
    const el = document.documentElement
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions)
    else if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
  } catch { /* the browser may deny permission: not critical */ }
  try { await (globalThis.screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } })?.orientation?.lock?.('landscape') } catch { /* same */ }
}

type Screen = 'menu' | 'booting' | 'playing'

function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [cfg, setCfg] = useState<MenuConfig>(() => loadConfig())
  const [engineMods, setEngineMods] = useState<EngineModules | null>(null)
  const [engine, setEngine] = useState<GameEngine | null>(null)
  const modsPromise = useRef<Promise<EngineModules> | null>(null)

  useEffect(() => { setLanguage(cfg.language) }, [cfg.language])

  useEffect(() => {
    modsPromise.current = loadEngineModules()
    modsPromise.current.then(setEngineMods).catch((e) => console.error('No se pudieron cargar los módulos del motor', e))
  }, [])

  const launchDuel = useCallback(async (options: StartOptions = {}) => {
    const mods = engineMods ?? await (modsPromise.current ?? loadEngineModules())
    const { X, scriptReader, cardsRaw, names } = mods
    const mine = findDeck(cardsRaw, cfg.deck)
    if (!mine) { alert('Elige un mazo.'); return }
    if (mine.main.length < 40) { alert(`"${mine.name}" tiene ${mine.main.length} cartas; hacen falta 40.`); return }
    const included = listDecks(cardsRaw).filter((m) => !m.custom && !m.warning)
    const aiDeck = options.opponentDeck ?? cfg.opponentDeck
    let opponent = aiDeck === '__mismo__' ? mine
      : aiDeck === '__azar__' ? included[(Math.random() * included.length) | 0]
      : findDeck(cardsRaw, aiDeck) ?? included[0]
    if (!opponent || opponent.main.length < 40) opponent = included[0]
    const myDeck = { deck: [...mine.main], extra: [...mine.extra] }
    const foeDeck = { deck: [...opponent.main], extra: [...opponent.extra] }
    const missing = [...new Set([...myDeck.deck, ...myDeck.extra, ...foeDeck.deck, ...foeDeck.extra])].filter((c) => !cardsRaw[String(c)])
    if (missing.length) { alert('Hay cartas fuera del pool de Goat (' + missing.length + ').'); return }

    if (globalThis.matchMedia?.('(pointer:coarse)')?.matches || (globalThis.innerWidth ?? 1920) < 900) void fullscreen()

    const game = new GameEngine()
    setEngine(game)
    setScreen('playing')
    game.boot({
      X, scriptReader, cardsRaw, names,
      deck: myDeck.deck, extra: myDeck.extra, deckRival: foeDeck.deck, extraRival: foeDeck.extra,
      config: {
        level: options.level ?? cfg.level, chainMode: cfg.chainMode, chainTimeout: cfg.chainTimeout,
        deckName: mine.name, opponentName: opponent.name, challenge: options.challenge ?? undefined,
        myAvatar: { src: avatarSrc(cfg.avatar), name: avatarName(cfg.avatar) },
        opponentAvatar: { src: avatarSrc(AVATAR_AI), name: avatarName(AVATAR_AI) },
      },
    }).catch((e) => console.error('Error al arrancar el duelo', e))
  }, [cfg, engineMods])

  const onStart = useCallback((options?: StartOptions) => {
    if (!engineMods) { setScreen('booting'); void launchDuel(options) }
    else void launchDuel(options)
  }, [engineMods, launchDuel])

  const backToMenu = useCallback(() => { setEngine(null); setScreen('menu') }, [])
  const setCfgAndSave = useCallback((next: MenuConfig) => { setCfg(next); saveConfig(next) }, [])

  if (screen === 'playing' && engine) {
    return <DuelScreen engine={engine} onExit={backToMenu} onNewDuel={backToMenu} />
  }
  if (screen === 'booting') {
    return (
      <div id="boot"><div><h1>GOAT FORMAT</h1><p>Cargando el núcleo de reglas…</p>
        <div className="bar"><i /></div></div></div>
    )
  }
  return (
    <Menu cfg={cfg} setCfg={setCfgAndSave}
      cardsRaw={engineMods?.cardsRaw ?? null}
      onStart={onStart}
      onLanguageChange={setLanguage} />
  )
}

export default App
