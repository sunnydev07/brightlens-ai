import { useMemo, useState } from 'react'
import { Download, Pin, PinOff, Search, Trash2 } from 'lucide-react'
import { Overlay } from './ui/Overlay'
import { searchConversations } from '../lib/conversations'
import type { Conversation } from '../lib/types'

interface HistorySheetProps {
  open: boolean
  onClose: () => void
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onClearAll: () => void
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

/** Slide-in history panel: search, select, pin, export and delete chats. */
export function HistorySheet({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onTogglePin,
  onDelete,
  onExport,
  onClearAll,
}: HistorySheetProps) {
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const filtered = useMemo(
    () => searchConversations(conversations, query),
    [conversations, query],
  )

  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="sheet-right"
      title="History"
      description={`${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}
      labelledBy="history-title"
    >
      <div className="history">
        <div className="history__search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="history__search-input"
            placeholder="Search conversations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search conversations"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="history__empty">
            {conversations.length === 0
              ? 'No conversations yet. Your chats will appear here.'
              : 'No conversations match your search.'}
          </p>
        ) : (
          <ul className="history__list">
            {filtered.map((conversation) => {
              const isActive = conversation.id === activeId
              return (
                <li
                  key={conversation.id}
                  className={`history__item ${isActive ? 'is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="history__item-main"
                    onClick={() => {
                      onSelect(conversation.id)
                      onClose()
                    }}
                  >
                    <span className="history__item-title">
                      {conversation.pinned && (
                        <Pin size={12} aria-hidden="true" className="history__pin-flag" />
                      )}
                      {conversation.title}
                    </span>
                    <span className="history__item-meta">
                      {conversation.messages.length} messages · {relativeTime(conversation.updatedAt)}
                    </span>
                  </button>
                  <div className="history__item-actions">
                    <button
                      type="button"
                      className="history__action"
                      onClick={() => onTogglePin(conversation.id)}
                      aria-label={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
                      title={conversation.pinned ? 'Unpin' : 'Pin'}
                    >
                      {conversation.pinned ? (
                        <PinOff size={15} aria-hidden="true" />
                      ) : (
                        <Pin size={15} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="history__action"
                      onClick={() => onExport(conversation.id)}
                      aria-label="Export conversation as Markdown"
                      title="Export"
                    >
                      <Download size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="history__action history__action--danger"
                      onClick={() => onDelete(conversation.id)}
                      aria-label="Delete conversation"
                      title="Delete"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {conversations.length > 0 && (
          <div className="history__footer">
            {confirmClear ? (
              <div className="history__confirm">
                <span>Delete all conversations?</span>
                <div className="history__confirm-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() => {
                      onClearAll()
                      setConfirmClear(false)
                    }}
                  >
                    Delete all
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--ghost btn--sm history__clear"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Clear all history
              </button>
            )}
          </div>
        )}
      </div>
    </Overlay>
  )
}
