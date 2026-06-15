import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio, describeRequestError } from '../lib/transcribe'
import { MIN_AUDIO_BYTES, MIN_AUDIO_MS } from '../lib/constants'
import type { RecordingMode } from '../lib/types'

interface VoiceRecorderOptions {
  /** Called with a non-empty transcript once recording/transcription completes. */
  onResult: (transcript: string, mode: RecordingMode) => void
  onError: (message: string) => void
  /** Called when no usable speech was captured. */
  onEmpty?: (mode: RecordingMode) => void
}

export interface VoiceRecorder {
  isRecording: boolean
  recordingMode: RecordingMode | null
  transcribing: boolean
  startRecording: (mode: RecordingMode) => Promise<void>
  stopRecording: () => void
  uploadAudio: (file: Blob) => Promise<string>
}

/**
 * Microphone capture via MediaRecorder + transcription via the speech
 * endpoint. Stops tracks and recorders on unmount to avoid leaks.
 */
export function useVoiceRecorder(options: VoiceRecorderOptions): VoiceRecorder {
  const optsRef = useRef(options)
  optsRef.current = options

  const [isRecording, setIsRecording] = useState(false)
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null)
  const [transcribing, setTranscribing] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isRecordingRef = useRef(false)
  const startedAtRef = useRef(0)

  const transcribe = useCallback(async (blob: Blob): Promise<string> => {
    if (blob.size === 0) return ''
    try {
      setTranscribing(true)
      return await transcribeAudio(blob)
    } catch (err) {
      optsRef.current.onError(describeRequestError(err, 'Speech transcription failed'))
      return ''
    } finally {
      setTranscribing(false)
    }
  }, [])

  const startRecording = useCallback(async (mode: RecordingMode) => {
    if (isRecordingRef.current) return
    try {
      chunksRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      startedAtRef.current = Date.now()

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const durationMs = Date.now() - startedAtRef.current
        const totalSize = chunksRef.current.reduce((a, c) => a + c.size, 0)
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        recorderRef.current = null
        isRecordingRef.current = false
        setIsRecording(false)
        setRecordingMode(null)

        if (totalSize < MIN_AUDIO_BYTES || durationMs < MIN_AUDIO_MS) {
          chunksRef.current = []
          optsRef.current.onEmpty?.(mode)
          return
        }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []
        const transcript = await transcribe(blob)
        if (!transcript) {
          optsRef.current.onEmpty?.(mode)
          return
        }
        optsRef.current.onResult(transcript, mode)
      }

      recorder.start(200)
      isRecordingRef.current = true
      setIsRecording(true)
      setRecordingMode(mode)
    } catch (err) {
      isRecordingRef.current = false
      setIsRecording(false)
      setRecordingMode(null)
      optsRef.current.onError(
        err instanceof Error ? err.message : 'Unable to start recording',
      )
    }
  }, [transcribe])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state !== 'inactive') {
      recorder.requestData()
      recorder.stop()
    }
    isRecordingRef.current = false
    setIsRecording(false)
  }, [])

  const uploadAudio = useCallback(
    async (file: Blob) => {
      const transcript = await transcribe(file)
      return transcript
    },
    [transcribe],
  )

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  return {
    isRecording,
    recordingMode,
    transcribing,
    startRecording,
    stopRecording,
    uploadAudio,
  }
}
