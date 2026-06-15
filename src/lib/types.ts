// Shared frontend types for Brightlens AI.

export type VisionMode = 'online' | 'offline'
export type RecordingMode = 'transcription' | 'jarvis'
export type ThemePref = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'
export type Density = 'comfortable' | 'compact'
export type MessageRole = 'user' | 'assistant'

/** A custom assistant persona backed by an optional system prompt. */
export interface BrightlensMode {
  name: string
  systemPrompt: string | null
}

/** A single turn in a conversation. */
export interface ChatMessage {
  id: string
  role: MessageRole
  /** Markdown text body (may be empty for an in-progress assistant turn). */
  content: string
  /** Screenshot attached to a user message, if any. */
  image?: string | null
  /** Structured Mini-Jarvis result, present on assistant action turns. */
  jarvis?: MiniJarvisCommandResult
  /** Error string when the turn failed. */
  error?: string
  createdAt: number
}

/** A stored conversation. */
export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  pinned: boolean
  createdAt: number
  updatedAt: number
}

/** Versioned envelope persisted to localStorage. */
export interface ConversationStore {
  version: 1
  conversations: Conversation[]
}

/** Frontend-only preferences. Never store secrets here. */
export interface Preferences {
  theme: ThemePref
  reducedMotion: boolean
  density: Density
  visionMode: VisionMode
  /** Days to retain conversations; 0 means keep forever. */
  retentionDays: number
  onboarded: boolean
}

/** Structured representation of one Mini-Jarvis tool result for the UI. */
export interface JarvisCard {
  tool: string
  status: 'success' | 'error' | 'cancelled'
  message: string
  error?: string
  details?: string
}

/** Contextual busy states surfaced to the user. */
export type ActivityState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'analyzing'
  | 'running'
  | 'stopped'
