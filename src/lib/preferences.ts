import type { Density, Preferences, ThemePref, VisionMode } from './types'

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  reducedMotion: false,
  density: 'comfortable',
  visionMode: 'online',
  retentionDays: 0,
  onboarded: false,
}

/** Validate and normalise an unknown value into Preferences. */
export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return DEFAULT_PREFERENCES
  const c = value as Partial<Preferences>
  const theme: ThemePref =
    c.theme === 'dark' || c.theme === 'light' || c.theme === 'system'
      ? c.theme
      : DEFAULT_PREFERENCES.theme
  const density: Density =
    c.density === 'compact' || c.density === 'comfortable'
      ? c.density
      : DEFAULT_PREFERENCES.density
  const visionMode: VisionMode =
    c.visionMode === 'online' || c.visionMode === 'offline'
      ? c.visionMode
      : DEFAULT_PREFERENCES.visionMode
  return {
    theme,
    density,
    visionMode,
    reducedMotion: typeof c.reducedMotion === 'boolean' ? c.reducedMotion : false,
    retentionDays:
      typeof c.retentionDays === 'number' && c.retentionDays >= 0 ? c.retentionDays : 0,
    onboarded: typeof c.onboarded === 'boolean' ? c.onboarded : false,
  }
}
