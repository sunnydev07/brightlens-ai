import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Sparkles } from 'lucide-react'
import type { BrightlensMode } from '../lib/types'

interface ModePickerProps {
  modes: BrightlensMode[]
  activeName: string
  onSelect: (name: string) => void
  onCreate: () => void
  disabled?: boolean
}

/**
 * Accessible persona selector. Implements a button + listbox popover with
 * roving keyboard support (Arrow keys, Enter, Escape) and outside-click
 * dismissal.
 */
export function ModePicker({
  modes,
  activeName,
  onSelect,
  onCreate,
  disabled = false,
}: ModePickerProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const activeIndex = Math.max(
    0,
    modes.findIndex((m) => m.name === activeName),
  )

  useEffect(() => {
    if (!open) return
    setHighlight(activeIndex)
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, activeIndex])

  const choose = (name: string) => {
    onSelect(name)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(modes.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const mode = modes[highlight]
      if (mode) choose(mode.name)
    }
  }

  return (
    <div className="mode-picker" ref={rootRef}>
      <button
        type="button"
        className="mode-picker__trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      >
        <Sparkles size={14} aria-hidden="true" className="mode-picker__icon" />
        <span className="mode-picker__label">{activeName}</span>
        <ChevronDown size={14} aria-hidden="true" className="mode-picker__chevron" />
      </button>

      {open && (
        <div className="mode-picker__popover" role="presentation">
          <ul className="mode-picker__list" id={listId} role="listbox" aria-label="Assistant modes">
            {modes.map((mode, index) => {
              const selected = mode.name === activeName
              return (
                <li
                  key={mode.name}
                  role="option"
                  aria-selected={selected}
                  className={`mode-picker__option ${index === highlight ? 'is-highlight' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(mode.name)}
                >
                  <span className="mode-picker__option-name">{mode.name}</span>
                  {selected && <Check size={14} aria-hidden="true" />}
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="mode-picker__create"
            onClick={() => {
              setOpen(false)
              onCreate()
            }}
          >
            <Plus size={14} aria-hidden="true" />
            New mode
          </button>
        </div>
      )}
    </div>
  )
}
