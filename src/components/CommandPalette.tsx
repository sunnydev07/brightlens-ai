import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  History,
  MessageSquare,
  PenSquare,
  Search,
  Settings,
  Sparkles,
  Wifi,
} from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { Conversation } from '../lib/types'

export interface Command {
  id: string
  label: string
  hint?: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  conversations: Conversation[]
  onNewChat: () => void
  onToggleVision: () => void
  onOpenHistory: () => void
  onOpenSettings: () => void
  onNewMode: () => void
  onSelectConversation: (id: string) => void
}

/** Spotlight-style command launcher with keyboard navigation (Cmd/Ctrl+K). */
export function CommandPalette(props: CommandPaletteProps) {
  if (!props.open) return null
  return <CommandPaletteInner {...props} />
}

function CommandPaletteInner({
  onClose,
  conversations,
  onNewChat,
  onToggleVision,
  onOpenHistory,
  onOpenSettings,
  onNewMode,
  onSelectConversation,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const ref = useFocusTrap<HTMLDivElement>(true, onClose)
  const inputRef = useRef<HTMLInputElement>(null)

  const run = (fn: () => void) => {
    fn()
    onClose()
  }

  const actions = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'new-chat', label: 'New chat', hint: 'Start a fresh conversation', icon: PenSquare, run: () => run(onNewChat) },
      { id: 'toggle-vision', label: 'Toggle vision mode', hint: 'Online / Offline', icon: Wifi, run: () => run(onToggleVision) },
      { id: 'new-mode', label: 'Create new mode', hint: 'Add a custom persona', icon: Sparkles, run: () => run(onNewMode) },
      { id: 'history', label: 'Open history', icon: History, run: () => run(onOpenHistory) },
      { id: 'settings', label: 'Open settings', icon: Settings, run: () => run(onOpenSettings) },
    ]
    const convoCommands: Command[] = conversations.slice(0, 8).map((c) => ({
      id: `convo-${c.id}`,
      label: c.title,
      hint: 'Jump to conversation',
      icon: MessageSquare,
      run: () => run(() => onSelectConversation(c.id)),
    }))
    return [...base, ...convoCommands]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, onNewChat, onToggleVision, onNewMode, onOpenHistory, onOpenSettings, onSelectConversation])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.hint?.toLowerCase().includes(q),
    )
  }, [actions, query])

  // Keep the highlighted index valid as the filtered list shrinks, without
  // resetting state in an effect (which the compiler flags).
  const activeIndex = filtered.length === 0 ? -1 : Math.min(highlight, filtered.length - 1)

  useEffect(() => {
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(Math.min(filtered.length - 1, activeIndex + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(Math.max(0, activeIndex - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[activeIndex]?.run()
    }
  }

  return (
    <div className="overlay overlay--palette">
      <div className="overlay__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        ref={ref}
        onKeyDown={onKeyDown}
      >
        <div className="palette__search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="palette__input"
            placeholder="Search commands and conversations…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlight(0)
            }}
            aria-label="Search commands"
          />
          <kbd className="palette__kbd">Esc</kbd>
        </div>
        {filtered.length === 0 ? (
          <p className="palette__empty">No matching commands.</p>
        ) : (
          <ul className="palette__list" role="listbox" aria-label="Commands">
            {filtered.map((command, index) => {
              const Icon = command.icon
              return (
                <li key={command.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    className={`palette__item ${index === activeIndex ? 'is-highlight' : ''}`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={command.run}
                  >
                    <Icon size={16} aria-hidden={true} />
                    <span className="palette__item-label">{command.label}</span>
                    {command.hint && <span className="palette__item-hint">{command.hint}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
