import { useEffect, useState } from 'react'
import { Overlay } from './ui/Overlay'
import { modeNameExists } from '../lib/modes'
import type { BrightlensMode } from '../lib/types'

interface CreateModeDialogProps {
  open: boolean
  onClose: () => void
  existing: BrightlensMode[]
  onCreate: (mode: BrightlensMode) => void
}

/** Dialog to create a custom assistant persona with an optional system prompt. */
export function CreateModeDialog({ open, onClose, existing, onCreate }: CreateModeDialogProps) {
  const [name, setName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setSystemPrompt('')
      setError(null)
    }
  }, [open])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter a name for this mode.')
      return
    }
    if (modeNameExists(existing, trimmed)) {
      setError('A mode with that name already exists.')
      return
    }
    onCreate({ name: trimmed, systemPrompt: systemPrompt.trim() || null })
    onClose()
  }

  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="center"
      title="New mode"
      description="Give your assistant a persona and an optional system prompt."
      labelledBy="create-mode-title"
      className="overlay__panel--narrow"
    >
      <form
        className="mode-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="e.g. Code Reviewer"
            maxLength={40}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span className="field__label">
            System prompt <span className="field__optional">optional</span>
          </span>
          <textarea
            className="field__textarea"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Describe how the assistant should behave in this mode…"
            rows={5}
          />
        </label>

        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}

        <div className="mode-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Create mode
          </button>
        </div>
      </form>
    </Overlay>
  )
}
