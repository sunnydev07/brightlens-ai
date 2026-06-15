import { Loader2, Mic, Square } from 'lucide-react'
import type { RecordingMode } from '../lib/types'

interface VoiceControlProps {
  isRecording: boolean
  recordingMode: RecordingMode | null
  transcribing: boolean
  disabled?: boolean
  /** Press-and-hold start (pointer down). */
  onStart: () => void
  /** Release to stop (pointer up / leave). */
  onStop: () => void
}

/**
 * Push-to-talk microphone button. Press and hold to record, release to
 * transcribe. Mirrors the global Shift-to-talk shortcut and reflects the
 * recording/transcribing state with an animated ring.
 */
export function VoiceControl({
  isRecording,
  recordingMode,
  transcribing,
  disabled = false,
  onStart,
  onStop,
}: VoiceControlProps) {
  const active = isRecording && recordingMode === 'transcription'

  const label = transcribing
    ? 'Transcribing'
    : active
      ? 'Recording — release to send'
      : 'Hold to talk'

  return (
    <button
      type="button"
      className={`mic-btn ${active ? 'is-recording' : ''} ${transcribing ? 'is-busy' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled || transcribing}
      onPointerDown={(e) => {
        e.preventDefault()
        if (!disabled && !transcribing) onStart()
      }}
      onPointerUp={onStop}
      onPointerLeave={() => active && onStop()}
    >
      {transcribing ? (
        <Loader2 size={18} aria-hidden="true" className="spin" />
      ) : active ? (
        <Square size={16} aria-hidden="true" />
      ) : (
        <Mic size={18} aria-hidden="true" />
      )}
      {active && <span className="mic-btn__pulse" aria-hidden="true" />}
    </button>
  )
}
