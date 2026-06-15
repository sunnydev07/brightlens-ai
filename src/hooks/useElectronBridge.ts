import { useMemo } from 'react'

type ScreenCaptureSource = { id: string }
type ScreenCaptureCallback = (event: unknown, source: ScreenCaptureSource) => void

export interface ElectronBridge {
  /** True when running inside the Electron host. */
  isElectron: boolean
  canCaptureScreen: boolean
  canControlWindow: boolean
  canRunJarvis: boolean
  minimize: () => void
  maximize: () => void
  close: () => void
  requestScreenCapture: () => void
  captureDone: () => void
  runMiniJarvisCommand: (command: string) => Promise<MiniJarvisCommandResult>
  /** Subscribe to screen-capture events; returns an unsubscribe function. */
  subscribeScreenCapture: (callback: ScreenCaptureCallback) => () => void
}

/**
 * Thin, browser-safe wrapper around `window.electronAPI`. When Electron is
 * unavailable, capability flags are false and desktop-only methods are no-ops
 * (or, for Jarvis, reject) so the browser preview never crashes.
 */
export function useElectronBridge(): ElectronBridge {
  return useMemo(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined

    return {
      isElectron: Boolean(api),
      canCaptureScreen: Boolean(api?.requestScreenCapture),
      canControlWindow: Boolean(api?.minimizeApp || api?.maximizeApp || api?.closeApp),
      canRunJarvis: Boolean(api?.miniJarvisRunCommand),
      minimize: () => api?.minimizeApp?.(),
      maximize: () => api?.maximizeApp?.(),
      close: () => api?.closeApp?.(),
      requestScreenCapture: () => api?.requestScreenCapture?.(),
      captureDone: () => api?.captureDone?.(),
      runMiniJarvisCommand: async (command: string) => {
        if (!api?.miniJarvisRunCommand) {
          throw new Error('Jarvis desktop actions are only available in the Electron app.')
        }
        return api.miniJarvisRunCommand(command)
      },
      subscribeScreenCapture: (callback: ScreenCaptureCallback) => {
        if (!api?.onScreenCapture) return () => {}
        const unsubscribe = api.onScreenCapture(callback)
        return typeof unsubscribe === 'function' ? unsubscribe : () => {}
      },
    }
  }, [])
}
