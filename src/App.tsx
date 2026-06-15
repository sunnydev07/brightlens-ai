import { useCallback, useEffect, useRef, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { WindowChrome } from './components/WindowChrome'
import { ConversationView } from './components/ConversationView'
import { Composer } from './components/Composer'
import { HistorySheet } from './components/HistorySheet'
import { SettingsSheet } from './components/SettingsSheet'
import { CommandPalette } from './components/CommandPalette'
import { CreateModeDialog } from './components/CreateModeDialog'
import { Onboarding } from './components/Onboarding'
import { StatusToast, type ToastState, type ToastTone } from './components/StatusToast'
import { useConversations } from './hooks/useConversations'
import { usePreferences } from './hooks/usePreferences'
import { useChatStream } from './hooks/useChatStream'
import { useVoiceRecorder } from './hooks/useVoiceRecorder'
import { useElectronBridge } from './hooks/useElectronBridge'
import { useLocalStorage } from './hooks/useLocalStorage'
import { captureFrameFromSource } from './lib/screenCapture'
import { DEFAULT_MODES, parseModes } from './lib/modes'
import {
  downloadTextFile,
  exportConversationMarkdown,
  newId,
  slugify,
} from './lib/conversations'
import { STORAGE_KEYS } from './lib/constants'
import type { BrightlensMode, ChatMessage, RecordingMode } from './lib/types'

const JARVIS_PREFIX = /^\/jarvis(?:\s|$)/i

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

export default function App() {
  const { preferences, setPreference, resetPreferences } = usePreferences()
  const conversations = useConversations(preferences.retentionDays)
  const chat = useChatStream()
  const bridge = useElectronBridge()

  const [modes, setModes] = useLocalStorage<BrightlensMode[]>(
    STORAGE_KEYS.modes,
    DEFAULT_MODES,
    parseModes,
  )
  const [activeMode, setActiveMode] = useState('Default')

  const [input, setInput] = useState('')
  const inputRef = useRef('')
  inputRef.current = input

  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [createModeOpen, setCreateModeOpen] = useState(false)

  const [toast, setToast] = useState<ToastState | null>(null)
  const toastSeq = useRef(0)
  const showToast = useCallback((tone: ToastTone, message: string) => {
    setToast({ id: ++toastSeq.current, tone, message })
  }, [])

  const visionMode = preferences.visionMode
  const activeSystemPrompt =
    modes.find((m) => m.name === activeMode)?.systemPrompt ?? null

  // Keep the active mode valid if it gets deleted elsewhere.
  useEffect(() => {
    if (!modes.some((m) => m.name === activeMode)) {
      setActiveMode(modes[0]?.name ?? 'Default')
    }
  }, [modes, activeMode])

  const { appendMessage, updateMessage } = conversations

  // ── Message helpers ────────────────────────────────────────────────────────
  const appendUser = useCallback(
    (content: string, image: string | null = null) =>
      appendMessage({
        id: newId(),
        role: 'user',
        content,
        image,
        createdAt: Date.now(),
      }),
    [appendMessage],
  )

  const appendAssistantJarvis = useCallback(
    (result: MiniJarvisCommandResult) =>
      appendMessage({
        id: newId(),
        role: 'assistant',
        content: '',
        jarvis: result,
        createdAt: Date.now(),
      }),
    [appendMessage],
  )

  const appendAssistantError = useCallback(
    (error: string) =>
      appendMessage({
        id: newId(),
        role: 'assistant',
        content: '',
        error,
        createdAt: Date.now(),
      }),
    [appendMessage],
  )

  // ── Streaming analyze ──────────────────────────────────────────────────────
  const streamPrompt = useCallback(
    async (prompt: string, image: string | null) => {
      const user = appendUser(prompt, image)
      const assistantId = newId()
      appendMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      })
      const conversationId = user.conversationId
      setStreamingId(assistantId)

      const outcome = await chat.stream(
        { image, prompt, mode: visionMode, systemPrompt: activeSystemPrompt },
        (token) =>
          updateMessage(conversationId, assistantId, (prev) => ({
            ...prev,
            content: prev.content + token,
          })),
      )

      setStreamingId(null)

      if (outcome.status === 'error') {
        updateMessage(conversationId, assistantId, (prev) =>
          prev.content ? prev : { ...prev, error: outcome.error || 'Failed to get answer' },
        )
        showToast('error', outcome.error || 'Failed to get answer')
      }
    },
    [appendUser, appendMessage, chat, visionMode, activeSystemPrompt, updateMessage, showToast],
  )

  // ── Desktop actions (Mini-Jarvis) ──────────────────────────────────────────
  const runJarvisCommand = useCallback(
    async (command: string, legacy: boolean): Promise<boolean> => {
      const outcome = await chat.runLocked(() => bridge.runMiniJarvisCommand(command))
      if (outcome.status === 'busy') return false
      if (outcome.status === 'error') {
        if (legacy) {
          appendUser(command)
          appendAssistantError(outcome.error || 'Desktop action failed')
        }
        showToast('error', outcome.error || 'Desktop action failed')
        return legacy
      }
      const result = outcome.value
      if (result && (result.handled || legacy)) {
        appendUser(command)
        appendAssistantJarvis(result)
        return true
      }
      return false
    },
    [chat, bridge, appendUser, appendAssistantJarvis, appendAssistantError, showToast],
  )

  // ── Composer submit ────────────────────────────────────────────────────────
  const submitMessage = useCallback(async () => {
    if (chat.busyRef.current) return
    const text = inputRef.current.trim()
    const image = pendingImage
    if (!text && !image) return

    setInput('')
    setPendingImage(null)

    // A screenshot is always sent to the vision model directly.
    if (image) {
      await streamPrompt(text || 'What is on my screen?', image)
      return
    }

    const legacy = JARVIS_PREFIX.test(text)
    const command = legacy ? text.replace(/^\/jarvis\b/i, '').trim() : text
    if (legacy && !command) {
      showToast('error', 'Tell Jarvis what you want to do.')
      return
    }

    // In the desktop app, route text through Mini-Jarvis first; fall back to a
    // streamed answer when the command isn't recognised as a desktop action.
    if (bridge.canRunJarvis) {
      const handled = await runJarvisCommand(command, legacy)
      if (handled) return
    }

    await streamPrompt(text, null)
  }, [chat, pendingImage, streamPrompt, bridge.canRunJarvis, runJarvisCommand, showToast])

  const runVoiceJarvis = useCallback(
    async (transcript: string) => {
      const command = transcript.trim()
      if (!command) {
        showToast('error', 'No speech was detected. Try again.')
        return
      }
      if (!bridge.canRunJarvis) {
        showToast('error', 'Desktop actions are only available in the Electron app.')
        return
      }
      await runJarvisCommand(command, true)
    },
    [bridge.canRunJarvis, runJarvisCommand, showToast],
  )

  // ── Voice recording ────────────────────────────────────────────────────────
  const voice = useVoiceRecorder({
    onResult: (transcript, mode) => {
      if (mode === 'jarvis') {
        void runVoiceJarvis(transcript)
      } else {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
      }
    },
    onEmpty: (mode) => {
      if (mode === 'jarvis') showToast('error', 'No speech was detected. Try again.')
    },
    onError: (message) => showToast('error', message),
  })

  const startVoice = useCallback(
    (mode: RecordingMode) => {
      void voice.startRecording(mode)
    },
    [voice],
  )

  // ── Screen capture (Electron) ──────────────────────────────────────────────
  useEffect(() => {
    if (!bridge.isElectron) return
    return bridge.subscribeScreenCapture(async (_event, source) => {
      if (chat.busyRef.current) {
        showToast('info', 'Finish or stop the current request first.')
        bridge.captureDone()
        return
      }
      try {
        setCapturing(true)
        const image = await captureFrameFromSource(source.id)
        const question = inputRef.current.trim()
        setInput('')
        await streamPrompt(question || 'What is on my screen?', image)
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Screen capture failed')
      } finally {
        setCapturing(false)
        bridge.captureDone()
      }
    })
  }, [bridge, chat.busyRef, streamPrompt, showToast])

  const captureScreen = useCallback(() => {
    if (!bridge.canCaptureScreen) {
      showToast('error', 'Screen capture is only available in the Electron app.')
      return
    }
    bridge.requestScreenCapture()
  }, [bridge, showToast])

  // ── Global shortcuts: push-to-talk (Shift) + command palette (Cmd/Ctrl+K) ──
  const startRecording = voice.startRecording
  const stopRecording = voice.stopRecording
  useEffect(() => {
    let hotkeyActive = false

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if (e.repeat) return
      if (
        e.key === 'Shift' &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !hotkeyActive &&
        !isEditableTarget(document.activeElement)
      ) {
        hotkeyActive = true
        void startRecording('transcription')
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && hotkeyActive) {
        hotkeyActive = false
        stopRecording()
      }
    }

    const stopIfInterrupted = () => {
      if (hotkeyActive) {
        hotkeyActive = false
        stopRecording()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', stopIfInterrupted)
    document.addEventListener('visibilitychange', stopIfInterrupted)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', stopIfInterrupted)
      document.removeEventListener('visibilitychange', stopIfInterrupted)
    }
  }, [startRecording, stopRecording])

  // ── Conversation actions ───────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    chat.stop()
    setStreamingId(null)
    setPendingImage(null)
    setInput('')
    conversations.startNewConversation()
  }, [chat, conversations])

  const handleExport = useCallback(
    (id: string) => {
      const conversation = conversations.conversations.find((c) => c.id === id)
      if (!conversation) return
      downloadTextFile(
        `${slugify(conversation.title)}.md`,
        exportConversationMarkdown(conversation),
      )
    },
    [conversations.conversations],
  )

  const handleCreateMode = useCallback(
    (mode: BrightlensMode) => {
      setModes((prev) => [...prev, mode])
      setActiveMode(mode.name)
      showToast('success', `Created "${mode.name}" mode.`)
    },
    [setModes, showToast],
  )

  const handlePromptSuggestion = useCallback((text: string) => {
    setInput(text)
    const textarea = document.querySelector<HTMLTextAreaElement>('.composer__input')
    textarea?.focus()
  }, [])

  const toggleVision = useCallback(() => {
    setPreference('visionMode', visionMode === 'online' ? 'offline' : 'online')
  }, [setPreference, visionMode])

  const messages: ChatMessage[] = conversations.messages

  return (
    <div className="app">
      <WindowChrome
        available={bridge.canControlWindow}
        onMinimize={bridge.minimize}
        onMaximize={bridge.maximize}
        onClose={bridge.close}
      />

      <AppHeader
        modes={modes}
        activeMode={activeMode}
        onSelectMode={setActiveMode}
        onCreateMode={() => setCreateModeOpen(true)}
        visionMode={visionMode}
        onToggleVision={toggleVision}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewChat={handleNewChat}
        busy={chat.busy}
      />

      <main className="app__main">
        <ConversationView
          messages={messages}
          streamingId={streamingId}
          onPrompt={handlePromptSuggestion}
        />
      </main>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => void submitMessage()}
        busy={chat.busy}
        onStop={chat.stop}
        pendingImage={pendingImage}
        onRemoveImage={() => setPendingImage(null)}
        onCapture={captureScreen}
        capturing={capturing}
        captureAvailable={bridge.canCaptureScreen}
        isRecording={voice.isRecording}
        recordingMode={voice.recordingMode}
        transcribing={voice.transcribing}
        onStartVoice={() => startVoice('transcription')}
        onStopVoice={voice.stopRecording}
        jarvisAvailable={bridge.canRunJarvis}
        onStartJarvis={() => startVoice('jarvis')}
        onStopJarvis={voice.stopRecording}
      />

      <HistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations.conversations}
        activeId={conversations.activeId}
        onSelect={conversations.selectConversation}
        onTogglePin={conversations.togglePin}
        onDelete={conversations.deleteConversation}
        onExport={handleExport}
        onClearAll={conversations.clearAll}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        preferences={preferences}
        onChange={setPreference}
        onReset={resetPreferences}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        conversations={conversations.conversations}
        onNewChat={handleNewChat}
        onToggleVision={toggleVision}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewMode={() => setCreateModeOpen(true)}
        onSelectConversation={conversations.selectConversation}
      />

      <CreateModeDialog
        open={createModeOpen}
        onClose={() => setCreateModeOpen(false)}
        existing={modes}
        onCreate={handleCreateMode}
      />

      <Onboarding
        open={!preferences.onboarded}
        onDismiss={() => setPreference('onboarded', true)}
      />

      <StatusToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
