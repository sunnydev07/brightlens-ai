import { useCallback, useEffect, useState } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { STORAGE_KEYS } from '../lib/constants'
import { DEFAULT_PREFERENCES, parsePreferences } from '../lib/preferences'
import type { Preferences, ResolvedTheme } from '../lib/types'

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export interface PreferencesController {
  preferences: Preferences
  resolvedTheme: ResolvedTheme
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  resetPreferences: () => void
}

/**
 * Load, persist and apply frontend preferences. Resolves the effective theme
 * (honouring the OS setting when `system`) and mirrors theme, density and
 * reduced-motion onto the document element for CSS to consume.
 */
export function usePreferences(): PreferencesController {
  const [preferences, setPreferences] = useLocalStorage<Preferences>(
    STORAGE_KEYS.preferences,
    DEFAULT_PREFERENCES,
    parsePreferences,
  )

  const [osTheme, setOsTheme] = useState<ResolvedTheme>(systemTheme)

  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setOsTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: ResolvedTheme =
    preferences.theme === 'system' ? osTheme : preferences.theme

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedTheme)
    root.setAttribute('data-density', preferences.density)
    root.setAttribute('data-reduced-motion', String(preferences.reducedMotion))
  }, [resolvedTheme, preferences.density, preferences.reducedMotion])

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPreferences((prev) => ({ ...prev, [key]: value }))
    },
    [setPreferences],
  )

  const resetPreferences = useCallback(() => {
    setPreferences((prev) => ({ ...DEFAULT_PREFERENCES, onboarded: prev.onboarded }))
  }, [setPreferences])

  return { preferences, resolvedTheme, setPreference, resetPreferences }
}
