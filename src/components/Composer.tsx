import { useEffect, useRef } from 'react'
import { ArrowUp, Camera, Loader2, Square, Terminal } from 'lucide-react'
import { VoiceControl } from './VoiceControl'
import { ScreenshotPreview } from './ScreenshotPreview'
import type { RecordingMode } from '../lib/types'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
  onStop: () => void

  pendingImage: string | null
  onRemoveImage: () => void
  onCapture: () => void
  capturing: boolean
  captureAvailable: boolean

  isRecording: boolean
  recordingMode: RecordingMode | null
  transcribing: boolean
  onStartVoice: () => void
  onStopVoice: () => void

  jarvisAvailable: boolean
  onStartJarvis: () => void
  onStopJarvis: () => void
}

/**
 * Bottom input dock: auto-growing textarea plus screen capture, push-to-talk,
 * desktop-action (Jarvis) and send/stop controls. Enter submits; Shift+Enter
 * inserts a newline.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  onStop,
  pendingImage,
  onRemoveImage,
  onCapture,
  capturing,
  captureAvailable,
  isRecording,
  recordingMode,
  transcribing,
  onStartVoice,
  onStopVoice,
  jarvisAvailable,
  onStartJarvis,
  onStopJarvis,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [value])

  const canSend = (value.trim().length > 0 || !!pendingImage) && !busy
  const jarvisActive = isRecording && recordingMode === 'jarvis'

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) onSubmit()
    }
  }

  return (
    <div className="composer">
      {pendingImage && (
        <div className="composer__attachment">
          <ScreenshotPreview src={pendingImage} onRemove={onRemoveImage} caption="Attached screen" />
        </div>
      )}

      <div className={`composer__bar ${busy ? 'is-busy' : ''}`}>
        <div className="composer__tools composer__tools--left">
          {captureAvailable && (
            <button
              type="button"
              className="composer__tool"
              onClick={onCapture}
              disabled={capturing || busy}
              aria-label="Capture screen"
              title="Capture screen"
            >
              {capturing ? (
                <Loader2 size={18} aria-hidden="true" className="spin" />
              ) : (
                <Camera size={18} aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="composer__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask Brightlens anything…"
          rows={1}
          aria-label="Message Brightlens"
          disabled={busy}
        />

        <div className="composer__tools composer__tools--right">
          {jarvisAvailable && (
            <button
              type="button"
              className={`composer__tool ${jarvisActive ? 'is-active' : ''}`}
              aria-label="Hold to run a desktop action"
              title="Hold to run a desktop action"
              aria-pressed={jarvisActive}
              disabled={busy || transcribing}
              onPointerDown={(e) => {
                e.preventDefault()
                if (!busy && !transcribing) onStartJarvis()
              }}
              onPointerUp={onStopJarvis}
              onPointerLeave={() => jarvisActive && onStopJarvis()}
            >
              <Terminal size={18} aria-hidden="true" />
            </button>
          )}

          <VoiceControl
            isRecording={isRecording}
            recordingMode={recordingMode}
            transcribing={transcribing}
            disabled={busy}
            onStart={onStartVoice}
            onStop={onStopVoice}
          />

          {busy ? (
            <button
              type="button"
              className="composer__send composer__send--stop"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop"
            >
              <Square size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="composer__send"
              onClick={onSubmit}
              disabled={!canSend}
              aria-label="Send message"
              title="Send"
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <p className="composer__hint">
        <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line · Hold{' '}
        <kbd>Shift</kbd> to talk
      </p>
    </div>
  )
}
