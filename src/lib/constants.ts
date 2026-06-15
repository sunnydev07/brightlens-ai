// Backend contract — do not change these endpoints.
export const API_BASE_URL = 'http://127.0.0.1:5000'

// Versioned localStorage keys.
export const STORAGE_KEYS = {
  modes: 'brightlens_modes',
  conversations: 'brightlens_conversations_v1',
  preferences: 'brightlens_preferences_v1',
} as const

// Minimum recording thresholds before we attempt transcription.
export const MIN_AUDIO_BYTES = 1024
export const MIN_AUDIO_MS = 250
