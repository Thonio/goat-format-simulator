/* Simulator root. Port of the final `<script type="module">` block from
   template.html (menu + `lanzarDuelo()` + `boot()`) — the one piece of
   main.js/template.html that didn't have its own module in the original. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { GameEngine } from './game/gameEngine'
import { DuelScreen } from './components/simulator/DuelScreen'
import { Menu } from './components/simulator/menu/Menu'
import { buscaMazo, listaMazos, loadConfig, saveConfig, avatarSrc, avatarNombre, AVATAR_IA, type MenuConfig } from './components/simulator/menu/config'
import type { StartOptions } from './components/simulator/menu/Jugar'
import { setIdioma } from './i18n/i18n'
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
async function pantallaCompleta() {
  try {
    const el = document.documentElement
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions)
    else if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
  } catch { /* the browser may deny permission: not critical */ }
  try { await (globalThis.screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } })?.orientation?.lock?.('landscape') } catch { /* same */ }
}

type Estado = 'menu' | 'booting' | 'playing'

function App() {
  const [estado, setEstado] = useState<Estado>('menu')
  const [cfg, setCfg] = useState<MenuConfig>(() => loadConfig())
  const [engineMods, setEngineMods] = useState<EngineModules | null>(null)
  const [engine, setEngine] = useState<GameEngine | null>(null)
  const modsPromise = useRef<Promise<EngineModules> | null>(null)

  useEffect(() => { setIdioma(cfg.idioma) }, [cfg.idioma])

  useEffect(() => {
    modsPromise.current = loadEngineModules()
    modsPromise.current.then(setEngineMods).catch((e) => console.error('No se pudieron cargar los módulos del motor', e))
  }, [])

  const lanzarDuelo = useCallback(async (opciones: StartOptions = {}) => {
    const mods = engineMods ?? await (modsPromise.current ?? loadEngineModules())
    const { X, scriptReader, cardsRaw, names } = mods
    const mio = buscaMazo(cardsRaw, cfg.mazo)
    if (!mio) { alert('Elige un mazo.'); return }
    if (mio.main.length < 40) { alert(`"${mio.nombre}" tiene ${mio.main.length} cartas; hacen falta 40.`); return }
    const incluidos = listaMazos(cardsRaw).filter((m) => !m.propio && !m.aviso)
    const quiereIA = opciones.mazoIA ?? cfg.mazoIA
    let rival = quiereIA === '__mismo__' ? mio
      : quiereIA === '__azar__' ? incluidos[(Math.random() * incluidos.length) | 0]
      : buscaMazo(cardsRaw, quiereIA) ?? incluidos[0]
    if (!rival || rival.main.length < 40) rival = incluidos[0]
    const mazo = { deck: [...mio.main], extra: [...mio.extra] }
    const mazoR = { deck: [...rival.main], extra: [...rival.extra] }
    const faltan = [...new Set([...mazo.deck, ...mazo.extra, ...mazoR.deck, ...mazoR.extra])].filter((c) => !cardsRaw[String(c)])
    if (faltan.length) { alert('Hay cartas fuera del pool de Goat (' + faltan.length + ').'); return }

    if (globalThis.matchMedia?.('(pointer:coarse)')?.matches || (globalThis.innerWidth ?? 1920) < 900) void pantallaCompleta()

    const nuevo = new GameEngine()
    setEngine(nuevo)
    setEstado('playing')
    nuevo.boot({
      X, scriptReader, cardsRaw, names,
      deck: mazo.deck, extra: mazo.extra, deckRival: mazoR.deck, extraRival: mazoR.extra,
      config: {
        nivel: opciones.nivel ?? cfg.nivel, cadenas: cfg.cadenas, tiempo: cfg.tiempo,
        nombreMazo: mio.nombre, nombreRival: rival.nombre, reto: opciones.reto ?? undefined,
        avatarMio: { src: avatarSrc(cfg.avatar), nombre: avatarNombre(cfg.avatar) },
        avatarRival: { src: avatarSrc(AVATAR_IA), nombre: avatarNombre(AVATAR_IA) },
      },
    }).catch((e) => console.error('Error al arrancar el duelo', e))
  }, [cfg, engineMods])

  const onStart = useCallback((opciones?: StartOptions) => {
    if (!engineMods) { setEstado('booting'); void lanzarDuelo(opciones) }
    else void lanzarDuelo(opciones)
  }, [engineMods, lanzarDuelo])

  const volverAlMenu = useCallback(() => { setEngine(null); setEstado('menu') }, [])
  const setCfgAndSave = useCallback((next: MenuConfig) => { setCfg(next); saveConfig(next) }, [])

  if (estado === 'playing' && engine) {
    return <DuelScreen engine={engine} onExit={volverAlMenu} onNewDuel={volverAlMenu} />
  }
  if (estado === 'booting') {
    return (
      <div id="boot"><div><h1>GOAT FORMAT</h1><p>Cargando el núcleo de reglas…</p>
        <div className="bar"><i /></div></div></div>
    )
  }
  return (
    <Menu cfg={cfg} setCfg={setCfgAndSave}
      cardsRaw={engineMods?.cardsRaw ?? null}
      onStart={onStart}
      onLanguageChange={setIdioma} />
  )
}

export default App
