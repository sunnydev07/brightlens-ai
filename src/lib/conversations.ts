import type { ChatMessage, Conversation, ConversationStore } from './types'
import { formatMiniJarvisResult } from './jarvis'

/** Generate a reasonably unique id without external deps. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Derive a short conversation title from the first user message. */
export function titleFromText(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New conversation'
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** Create a fresh, empty conversation. */
export function createConversation(now = Date.now()): Conversation {
  return {
    id: newId(),
    title: 'New conversation',
    messages: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const m = value as Partial<ChatMessage>
  return (
    typeof m.id === 'string' &&
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    typeof m.createdAt === 'number'
  )
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false
  const c = value as Partial<Conversation>
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    Array.isArray(c.messages) &&
    c.messages.every(isMessage) &&
    typeof c.createdAt === 'number' &&
    typeof c.updatedAt === 'number'
  )
}

/** Validate and migrate an unknown value into a versioned conversation store. */
export function parseConversationStore(value: unknown): ConversationStore {
  if (!value || typeof value !== 'object') return { version: 1, conversations: [] }
  const candidate = value as Partial<ConversationStore>
  const list = Array.isArray(candidate.conversations) ? candidate.conversations : []
  const conversations = list.filter(isConversation).map((c) => ({
    ...c,
    pinned: Boolean(c.pinned),
  }))
  return { version: 1, conversations }
}

/** Pinned first, then most recently updated. */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

/** Case-insensitive search across titles and message content. */
export function searchConversations(
  conversations: Conversation[],
  query: string,
): Conversation[] {
  const q = query.trim().toLowerCase()
  if (!q) return conversations
  return conversations.filter((c) => {
    if (c.title.toLowerCase().includes(q)) return true
    return c.messages.some((m) => m.content.toLowerCase().includes(q))
  })
}

/** Drop conversations older than `retentionDays` (0 = keep forever). Pinned are kept. */
export function pruneByRetention(
  conversations: Conversation[],
  retentionDays: number,
  now = Date.now(),
): Conversation[] {
  if (!retentionDays || retentionDays <= 0) return conversations
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
  return conversations.filter((c) => c.pinned || c.updatedAt >= cutoff)
}

/** Render a conversation as Markdown for export. */
export function exportConversationMarkdown(conversation: Conversation): string {
  const lines: string[] = [`# ${conversation.title}`, '']
  lines.push(`_Exported ${new Date().toLocaleString()}_`, '')
  for (const message of conversation.messages) {
    if (message.role === 'user') {
      lines.push('## You', '', message.content || '_(screenshot only)_', '')
    } else {
      lines.push('## Brightlens', '')
      if (message.jarvis) {
        lines.push(formatMiniJarvisResult(message.jarvis), '')
      } else if (message.error) {
        lines.push(`> Error: ${message.error}`, '')
      } else {
        lines.push(message.content || '_(no response)_', '')
      }
    }
  }
  return lines.join('\n').trim() + '\n'
}

/** Trigger a client-side download of a text file. */
export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Safe filename slug from a title. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'conversation'
  )
}
