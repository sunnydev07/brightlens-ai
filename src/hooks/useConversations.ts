import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STORAGE_KEYS } from '../lib/constants'
import {
  createConversation,
  parseConversationStore,
  pruneByRetention,
  sortConversations,
  titleFromText,
} from '../lib/conversations'
import type { ChatMessage, Conversation, ConversationStore } from '../lib/types'

function loadStore(retentionDays: number): ConversationStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.conversations)
    const parsed = parseConversationStore(raw ? JSON.parse(raw) : null)
    return { version: 1, conversations: pruneByRetention(parsed.conversations, retentionDays) }
  } catch {
    return { version: 1, conversations: [] }
  }
}

export interface ConversationsController {
  conversations: Conversation[]
  activeId: string | null
  active: Conversation | undefined
  messages: ChatMessage[]
  selectConversation: (id: string | null) => void
  startNewConversation: () => void
  appendMessage: (message: ChatMessage) => { conversationId: string; messageId: string }
  updateMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<ChatMessage> | ((prev: ChatMessage) => ChatMessage),
  ) => void
  renameConversation: (id: string, title: string) => void
  togglePin: (id: string) => void
  deleteConversation: (id: string) => void
  clearAll: () => void
}

/**
 * Manages the versioned conversation store: active selection, message
 * appends/updates, and history operations. Persistence is debounced so that
 * token-by-token streaming does not thrash localStorage, with a flush on
 * page hide.
 */
export function useConversations(retentionDays: number): ConversationsController {
  const [store, setStore] = useState<ConversationStore>(() => loadStore(retentionDays))
  const [activeId, setActiveId] = useState<string | null>(null)
  const storeRef = useRef(store)
  storeRef.current = store

  // Debounced persistence + flush on hide.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(store))
      } catch {
        /* storage unavailable */
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [store])

  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(storeRef.current))
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  const conversations = useMemo(
    () => sortConversations(store.conversations),
    [store.conversations],
  )

  const active = useMemo(
    () => store.conversations.find((c) => c.id === activeId),
    [store.conversations, activeId],
  )

  const messages = active?.messages ?? []

  const selectConversation = useCallback((id: string | null) => setActiveId(id), [])

  const startNewConversation = useCallback(() => setActiveId(null), [])

  const appendMessage = useCallback(
    (message: ChatMessage) => {
      let targetId = activeId
      setStore((prev) => {
        const existing = targetId
          ? prev.conversations.find((c) => c.id === targetId)
          : undefined

        if (!existing) {
          const fresh = createConversation(message.createdAt)
          targetId = fresh.id
          fresh.messages = [message]
          if (message.role === 'user') fresh.title = titleFromText(message.content)
          return { ...prev, conversations: [...prev.conversations, fresh] }
        }

        return {
          ...prev,
          conversations: prev.conversations.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  messages: [...c.messages, message],
                  updatedAt: message.createdAt,
                  title:
                    c.messages.length === 0 && message.role === 'user'
                      ? titleFromText(message.content)
                      : c.title,
                }
              : c,
          ),
        }
      })
      if (targetId && targetId !== activeId) setActiveId(targetId)
      return { conversationId: targetId as string, messageId: message.id }
    },
    [activeId],
  )

  const updateMessage = useCallback<ConversationsController['updateMessage']>(
    (conversationId, messageId, patch) => {
      setStore((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) => {
          if (c.id !== conversationId) return c
          return {
            ...c,
            updatedAt: Date.now(),
            messages: c.messages.map((m) => {
              if (m.id !== messageId) return m
              return typeof patch === 'function' ? patch(m) : { ...m, ...patch }
            }),
          }
        }),
      }))
    },
    [],
  )

  const renameConversation = useCallback((id: string, title: string) => {
    const clean = title.trim()
    if (!clean) return
    setStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === id ? { ...c, title: clean } : c,
      ),
    }))
  }, [])

  const togglePin = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c,
      ),
    }))
  }, [])

  const deleteConversation = useCallback(
    (id: string) => {
      setStore((prev) => ({
        ...prev,
        conversations: prev.conversations.filter((c) => c.id !== id),
      }))
      setActiveId((current) => (current === id ? null : current))
    },
    [],
  )

  const clearAll = useCallback(() => {
    setStore({ version: 1, conversations: [] })
    setActiveId(null)
  }, [])

  return {
    conversations,
    activeId,
    active,
    messages,
    selectConversation,
    startNewConversation,
    appendMessage,
    updateMessage,
    renameConversation,
    togglePin,
    deleteConversation,
    clearAll,
  }
}
