import type { BrightlensMode } from './types'

export const DEFAULT_MODES: BrightlensMode[] = [{ name: 'Default', systemPrompt: null }]

/** Validate and normalise an unknown value into a list of modes. */
export function parseModes(value: unknown): BrightlensMode[] {
  if (!Array.isArray(value)) return DEFAULT_MODES

  const names = new Set<string>()
  const valid = value
    .filter((mode): mode is BrightlensMode => {
      if (!mode || typeof mode !== 'object') return false
      const candidate = mode as Partial<BrightlensMode>
      if (
        typeof candidate.name !== 'string' ||
        !candidate.name.trim() ||
        (candidate.systemPrompt !== null && typeof candidate.systemPrompt !== 'string')
      ) {
        return false
      }
      const normalized = candidate.name.trim().toLowerCase()
      if (names.has(normalized)) return false
      names.add(normalized)
      return true
    })
    .map((mode) => ({
      name: mode.name.trim(),
      systemPrompt: mode.systemPrompt?.trim() || null,
    }))

  return valid.length > 0 ? valid : DEFAULT_MODES
}

/** Load saved modes from localStorage, falling back to defaults. */
export function loadSavedModes(key: string): BrightlensMode[] {
  const saved = localStorage.getItem(key)
  if (!saved) return DEFAULT_MODES
  try {
    return parseModes(JSON.parse(saved))
  } catch {
    return DEFAULT_MODES
  }
}

/** True when a mode name already exists (case-insensitive). */
export function modeNameExists(modes: BrightlensMode[], name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return modes.some((mode) => mode.name.toLowerCase() === normalized)
}
