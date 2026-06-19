import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { THEMES } from "./theme";
import type { ThemeName, Mode } from "./types";

// Extracted Subcomponents
import { TitleBar } from "./components/TitleBar";
import { VisionToggle } from "./components/VisionToggle";
import { ChatArea } from "./components/ChatArea";
import { InputArea } from "./components/InputArea";
import { SettingsModal } from "./components/SettingsModal";
import { CreateModeModal } from "./components/CreateModeModal";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── Streaming helper (module-level, no React deps) ────────────────────────────
async function streamAnalyze(
  apiBase: string,
  payload: { image?: string | null; prompt: string; mode: string; systemPrompt?: string | null; onlineVisionModel?: string; offlineTextModel?: string; offlineVisionModel?: string },
  onToken: (t: string) => void,
  signal?: AbortSignal,
  keys?: { geminiKey?: string; openrouterKey?: string; nvidiaKey?: string }
): Promise<void> {
  const customHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (keys?.geminiKey) customHeaders["x-gemini-key"] = keys.geminiKey;
  if (keys?.openrouterKey) customHeaders["x-openrouter-key"] = keys.openrouterKey;
  if (keys?.nvidiaKey) customHeaders["x-nvidia-key"] = keys.nvidiaKey;

  const res = await fetch(`${apiBase}/analyze-stream`, {
    method: "POST",
    headers: customHeaders,
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Server error ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) {
      await reader.cancel();
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const data = JSON.parse(raw) as { token?: string; done?: boolean; error?: string };
        if (data.error) throw new Error(data.error);
        if (data.token) onToken(data.token);
      } catch (e: unknown) {
        if (e instanceof Error && !e.message.startsWith("{")) throw e;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [questionText, setQuestionText] = useState("");
  const questionTextRef = useRef("");

  const [image, setImage] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const [imageMode, setImageMode] = useState<"online" | "offline">("online");

  const [showModeMenu, setShowModeMenu] = useState(false);
  const [modes, setModes] = useState<Mode[]>(() => {
    const saved = localStorage.getItem("brightlens_modes");
    if (saved) {
      try { return JSON.parse(saved); } catch { localStorage.removeItem("brightlens_modes"); }
    }
    return [{ name: "Default", systemPrompt: null }];
  });
  const [selectedModeName, setSelectedModeName] = useState("Default");
  const [showCreateMode, setShowCreateMode] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [newModePrompt, setNewModePrompt] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [onlineVisionModel, setOnlineVisionModel] = useState<"gemini" | "nvidia">(() => {
    return (localStorage.getItem("brightlens_online_vision") as "gemini" | "nvidia") || "gemini";
  });
  const [offlineTextModel, setOfflineTextModel] = useState(() => {
    return localStorage.getItem("brightlens_offline_text") || "llama3.2:latest";
  });
  const [offlineVisionModel, setOfflineVisionModel] = useState(() => {
    return localStorage.getItem("brightlens_offline_vision") || "llava:latest";
  });
  const [ocrEnabled, setOcrEnabled] = useState(() => {
    return localStorage.getItem("brightlens_ocr_enabled") === "true";
  });

  const [selectedThemeName, setSelectedThemeName] = useState<ThemeName>(() => {
    const savedTheme = localStorage.getItem("brightlens_theme") as ThemeName | null;
    return savedTheme && savedTheme in THEMES ? savedTheme : "default";
  });
  const theme = THEMES[selectedThemeName];

  // API key override states (loaded securely from IPC or fallback to local storage)
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("brightlens_gemini_key") || "");
  const [openrouterKey, setOpenrouterKey] = useState(() => localStorage.getItem("brightlens_openrouter_key") || "");
  const [nvidiaKey, setNvidiaKey] = useState(() => localStorage.getItem("brightlens_nvidia_key") || "");

  // Dynamic Express backend port
  const [apiPort, setApiPort] = useState(5000);
  const apiBase = `http://localhost:${apiPort}`;

  // Session states
  const [activeSessionId, setActiveSessionId] = useState("");
  const [sessionsList, setSessionsList] = useState<Array<{ sessionId: string, question: string, timestamp: string }>>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const imageModeRef = useRef<"online" | "offline">("online");
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const hotkeyActiveRef = useRef(false);
  const recordingStartRef = useRef<number>(0);
  const autoScrollRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch session list
  const fetchSessions = useCallback(async (port = apiPort) => {
    try {
      const res = await axios.get(`http://localhost:${port}/api/sessions`);
      setSessionsList(res.data?.sessions || []);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, [apiPort]);

  // Fetch current session history
  const fetchHistory = useCallback(async (port = apiPort) => {
    try {
      const res = await axios.get(`http://localhost:${port}/api/history`);
      const historyList = res.data?.history || [];
      const mapped: Message[] = [];
      for (const h of historyList) {
        mapped.push({ role: "user", content: h.question });
        mapped.push({ role: "assistant", content: h.answer });
      }
      setMessages(mapped);
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, [apiPort]);

  // Expose backend port and load secure credentials
  useEffect(() => {
    window.electronAPI?.getBackendPort?.().then((port: number) => {
      const activePort = port || 5000;
      setApiPort(activePort);
      
      // Load active session and history
      axios.get(`http://localhost:${activePort}/api/sessions/active`)
        .then(res => {
          setActiveSessionId(res.data.sessionId);
        })
        .catch(err => console.error("Active session fetch failed:", err));
        
      fetchSessions(activePort);
    });

    if (window.electronAPI?.getSecureKeys) {
      window.electronAPI.getSecureKeys().then((keys) => {
        if (keys.gemini) setGeminiKey(keys.gemini);
        if (keys.openrouter) setOpenrouterKey(keys.openrouter);
        if (keys.nvidia) setNvidiaKey(keys.nvidia);
      });
    }
  }, [fetchSessions]);

  // Save secure credentials when updated
  useEffect(() => {
    if (window.electronAPI?.saveSecureKeys) {
      window.electronAPI.saveSecureKeys({
        gemini: geminiKey,
        openrouter: openrouterKey,
        nvidia: nvidiaKey
      });
    } else {
      localStorage.setItem("brightlens_gemini_key", geminiKey);
      localStorage.setItem("brightlens_openrouter_key", openrouterKey);
      localStorage.setItem("brightlens_nvidia_key", nvidiaKey);
    }
  }, [geminiKey, openrouterKey, nvidiaKey]);

  useEffect(() => {
    if (activeSessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchHistory(apiPort);
    }
  }, [activeSessionId, fetchHistory, apiPort]);

  useEffect(() => {
    localStorage.setItem("brightlens_offline_text", offlineTextModel);
  }, [offlineTextModel]);
  useEffect(() => {
    localStorage.setItem("brightlens_offline_vision", offlineVisionModel);
  }, [offlineVisionModel]);
  useEffect(() => {
    localStorage.setItem("brightlens_ocr_enabled", String(ocrEnabled));
  }, [ocrEnabled]);

  // Keep refs in sync so Electron closure always has latest values
  useEffect(() => { questionTextRef.current = questionText; }, [questionText]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { imageModeRef.current = imageMode; }, [imageMode]);
  const keysRef = useRef({ geminiKey, openrouterKey, nvidiaKey });
  useEffect(() => {
    keysRef.current = { geminiKey, openrouterKey, nvidiaKey };
  }, [geminiKey, openrouterKey, nvidiaKey]);

  const selectedModeNameRef = useRef("Default");
  useEffect(() => { selectedModeNameRef.current = selectedModeName; }, [selectedModeName]);
  const modesRef = useRef<Mode[]>([]);
  useEffect(() => { 
    modesRef.current = modes; 
    localStorage.setItem("brightlens_modes", JSON.stringify(modes));
  }, [modes]);
  const onlineVisionModelRef = useRef<"gemini" | "nvidia">("gemini");
  useEffect(() => { 
    onlineVisionModelRef.current = onlineVisionModel; 
    localStorage.setItem("brightlens_online_vision", onlineVisionModel);
  }, [onlineVisionModel]);
  useEffect(() => {
    localStorage.setItem("brightlens_theme", selectedThemeName);
  }, [selectedThemeName]);

  // ── Auto-scroll logic ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollHeight - (scrollTop + clientHeight) < 50) {
        autoScrollRef.current = true;
      } else {
        autoScrollRef.current = false;
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (loading && autoScrollRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, loading]);

  const stopGeneration = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }, []);

  // ── Audio transcription → fills textarea ───────────────────────────────────
  const transcribeAudioBlob = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size === 0) { setSpeechLoading(false); return; }
    try {
      setSpeechLoading(true);
      setError("");
      const formData = new FormData();
      formData.append("audio", audioBlob, "speech.webm");
      const res = await axios.post(`${apiBase}/speech`, formData);
      const transcribed = res.data?.text || "";
      if (transcribed) {
        setQuestionText(prev => prev.trim() ? `${prev.trim()} ${transcribed}` : transcribed);
      }
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error || err.response?.data?.message
        : err instanceof Error ? err.message : undefined;
      setError(msg || "Speech transcription failed");
    } finally {
      setSpeechLoading(false);
    }
  }, [apiBase]);

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;
    try {
      setError("");
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingStartRef.current = Date.now();

      recorder.ondataavailable = (e) => { if (e.data?.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const durationMs = Date.now() - recordingStartRef.current;
        const totalSize = audioChunksRef.current.reduce((a, c) => a + c.size, 0);
        const activeStream = streamRef.current;
        activeStream?.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        if (totalSize < 1024 || durationMs < 250) {
          audioChunksRef.current = [];
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];
        await transcribeAudioBlob(blob);
      };
      recorder.start(200);
      setIsRecording(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to start recording");
    }
  }, [transcribeAudioBlob]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") { recorder.requestData(); recorder.stop(); }
    setIsRecording(false);
  }, []);

  // ── Text-only Ask ──────────────────────────────────────────────────────────
  const handleAskText = async () => {
    const q = questionTextRef.current.trim();
    if (!q) { setError("Please type or record a question first."); return; }
    try {
      setLoading(true);
      setError("");
      setQuestionText(""); // Clear input area
      autoScrollRef.current = true; // reset to true on new request
      const currentMode = modesRef.current.find(m => m.name === selectedModeNameRef.current);
      
      // Append user message immediately
      setMessages(prev => [...prev, { role: "user", content: q }]);
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      await streamAnalyze(
        apiBase,
        { 
          prompt: q, 
          mode: imageModeRef.current, 
          systemPrompt: currentMode?.systemPrompt, 
          onlineVisionModel: onlineVisionModelRef.current,
          offlineTextModel,
          offlineVisionModel
        },
        (token) => {
          setMessages(prev => {
            const next = [...prev];
            if (next.length > 0) {
              const last = next[next.length - 1];
              if (last.role === "assistant") {
                last.content += token;
              }
            }
            return next;
          });
        },
        controller.signal,
        { geminiKey, openrouterKey, nvidiaKey }
      );
      fetchSessions(apiPort);
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        console.log("Generation stopped by user");
      } else {
        setError(err instanceof Error ? err.message : "Failed to get answer");
      }
    } finally {
      if (abortControllerRef.current) abortControllerRef.current = null;
      setLoading(false);
    }
  };

  // ── Audio file upload ──────────────────────────────────────────────────────
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await transcribeAudioBlob(file);
    e.target.value = "";
  };

  // ── Session utilities ──────────────────────────────────────────────────────
  const handleClearChat = async () => {
    try {
      const res = await axios.post(`${apiBase}/api/sessions/new`);
      setActiveSessionId(res.data.sessionId);
      setMessages([]);
      setImage(null);
      setError("");
      fetchSessions(apiPort);
    } catch {
      setError("Failed to start new session");
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    try {
      await axios.post(`${apiBase}/api/sessions/active`, { sessionId });
      setActiveSessionId(sessionId);
      setShowHistoryDrawer(false);
      setImage(null);
      setError("");
    } catch {
      setError("Failed to load session");
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await axios.delete(`${apiBase}/api/sessions/${sessionId}`);
      fetchSessions(apiPort);
      if (sessionId === activeSessionId) {
        const res = await axios.get(`${apiBase}/api/sessions/active`);
        setActiveSessionId(res.data.sessionId);
      }
    } catch {
      setError("Failed to delete session");
    }
  };

  // ── Electron screen capture ────────────────────────────────────────────────
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.onScreenCapture) {
      console.log("⚠️ Running in browser (Electron not available)");
      return;
    }

    electronAPI.onScreenCapture(async (_event: unknown, source: { id: string }) => {
      try {
        setLoading(true);
        setError("");

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: source.id
            }
          } as unknown as MediaTrackConstraints
        });

        const track = stream.getVideoTracks()[0];
        const imageCapture = new ImageCapture(track);
        const bitmap = await imageCapture.grabFrame();

        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        const base64 = canvas.toDataURL("image/jpeg", 0.8);
        setImage(base64);

        let ocrText = "";
        if (ocrEnabled) {
          try {
            const { createWorker } = await import("tesseract.js");
            const worker = await createWorker('eng');
            const ret = await worker.recognize(canvas);
            ocrText = ret.data.text;
            await worker.terminate();
          } catch (ocrErr) {
            console.error("Local OCR failed:", ocrErr);
          }
        }

        const q = questionTextRef.current.trim();
        let prompt = q
          ? `Answer the user's question using the screenshot as context. Question: ${q}`
          : "Explain what's on screen in simple steps";

        if (ocrText.trim()) {
          prompt += `\n\n[OCR Extracted Text from screen for reference]:\n${ocrText}`;
        }

        const userQ = q || "Explain what's on screen in simple steps";
        
        // Push user message immediately
        setMessages(prev => [...prev, { role: "user", content: userQ }]);
        setMessages(prev => [...prev, { role: "assistant", content: "" }]);
        setQuestionText(""); // Clear input area

        const currentMode = modesRef.current.find(m => m.name === selectedModeNameRef.current);
        autoScrollRef.current = true; // reset to true on new request

        const controller = new AbortController();
        abortControllerRef.current = controller;

        await streamAnalyze(
          apiBase,
          { 
            image: base64, 
            prompt, 
            mode: imageModeRef.current, 
            systemPrompt: currentMode?.systemPrompt, 
            onlineVisionModel: onlineVisionModelRef.current,
            offlineTextModel,
            offlineVisionModel
          },
          (token) => {
            setMessages(prev => {
              const next = [...prev];
              if (next.length > 0) {
                const last = next[next.length - 1];
                if (last.role === "assistant") {
                  last.content += token;
                }
              }
              return next;
            });
          },
          controller.signal,
          keysRef.current
        );
        fetchSessions(apiPort);
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") {
          console.log("Generation stopped by user");
          return;
        }
        console.error("Capture error:", err);
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const msg = err instanceof Error ? err.message : undefined;
        setError(
          msg
          || (status === 503 ? "AI service unavailable. Make sure Ollama is running." : "")
          || "Failed to capture or analyze image"
        );
      } finally {
        setLoading(false);
        electronAPI.captureDone?.();
      }
    });

    // Push-to-talk: hold Shift
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !hotkeyActiveRef.current && !isRecordingRef.current) {
        hotkeyActiveRef.current = true;
        startRecording();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey && hotkeyActiveRef.current) {
        hotkeyActiveRef.current = false;
        if (isRecordingRef.current) stopRecording();
      }
    };
    const stopIfInterrupted = () => {
      hotkeyActiveRef.current = false;
      if (isRecordingRef.current) stopRecording();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", stopIfInterrupted);
    document.addEventListener("visibilitychange", stopIfInterrupted);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", stopIfInterrupted);
      document.removeEventListener("visibilitychange", stopIfInterrupted);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [startRecording, stopRecording, apiBase, apiPort, ocrEnabled, fetchSessions, offlineTextModel, offlineVisionModel]);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", height: "100vh", overflow: "hidden", backgroundColor: "transparent", boxSizing: "border-box", fontFamily: "system-ui, sans-serif", color: theme.text }}>
      
      {/* GLOBAL CONTROL PILL */}
      <TitleBar 
        theme={theme}
        isRecording={isRecording}
        startRecording={startRecording}
        stopRecording={stopRecording}
      />

      {/* INTEGRATED CONTENT AREA */}
      <main style={{
        display: "flex", flexDirection: "column", flex: 1, padding: "20px",
        borderRadius: "24px", backgroundColor: theme.panel,
        backdropFilter: "blur(30px)", border: theme.border,
        boxShadow: theme.shadow, overflow: "hidden",
        WebkitAppRegion: "no-drag", position: "relative"
      } as React.CSSProperties}>

        {/* Sleek Vision Segmented Control */}
        <VisionToggle 
          theme={theme}
          imageMode={imageMode}
          setImageMode={setImageMode}
        />

        {/* Response / Thinking / Image Preview Area */}
        <ChatArea 
          theme={theme}
          loading={loading}
          speechLoading={speechLoading}
          messages={messages}
          image={image}
          bottomRef={bottomRef}
        />

        {/* Spacer if empty to push input to bottom */}
        {messages.length === 0 && !loading && !speechLoading && <div style={{ flex: 1 }} />}

        {/* Input Area */}
        <InputArea 
          theme={theme}
          questionText={questionText}
          setQuestionText={setQuestionText}
          loading={loading}
          speechLoading={speechLoading}
          showModeMenu={showModeMenu}
          setShowModeMenu={setShowModeMenu}
          modes={modes}
          selectedModeName={selectedModeName}
          setSelectedModeName={setSelectedModeName}
          setShowCreateMode={setShowCreateMode}
          handleAudioUpload={handleAudioUpload}
          handleAskText={handleAskText}
          stopGeneration={stopGeneration}
          setShowSettings={setShowSettings}
          hasMessages={messages.length > 0}
          handleClearChat={handleClearChat}
          toggleHistoryDrawer={() => setShowHistoryDrawer(!showHistoryDrawer)}
          setError={setError}
        />

        {/* Errors */}
        {error && (
          <div style={{
            marginTop: "12px", padding: "10px 14px", borderRadius: "8px", 
            backgroundColor: theme.dangerSoft, border: `1px solid ${theme.danger}`,
            color: theme.dangerText, fontSize: "13px"
          }}>{error}</div>
        )}

      </main>

      {/* Create Mode Modal */}
      {showCreateMode && (
        <CreateModeModal 
          theme={theme}
          newModeName={newModeName}
          setNewModeName={setNewModeName}
          newModePrompt={newModePrompt}
          setNewModePrompt={setNewModePrompt}
          setShowCreateMode={setShowCreateMode}
          setModes={setModes}
          setSelectedModeName={setSelectedModeName}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal 
          theme={theme}
          selectedThemeName={selectedThemeName}
          setSelectedThemeName={setSelectedThemeName}
          onlineVisionModel={onlineVisionModel}
          setOnlineVisionModel={setOnlineVisionModel}
          offlineTextModel={offlineTextModel}
          setOfflineTextModel={setOfflineTextModel}
          offlineVisionModel={offlineVisionModel}
          setOfflineVisionModel={setOfflineVisionModel}
          ocrEnabled={ocrEnabled}
          setOcrEnabled={setOcrEnabled}
          setShowSettings={setShowSettings}
          geminiKey={geminiKey}
          setGeminiKey={setGeminiKey}
          openrouterKey={openrouterKey}
          setOpenrouterKey={setOpenrouterKey}
          nvidiaKey={nvidiaKey}
          setNvidiaKey={setNvidiaKey}
          apiBase={apiBase}
        />
      )}

      {/* History Drawer Overlay */}
      {showHistoryDrawer && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-drawer-title"
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: theme.overlay, zIndex: 90, backdropFilter: "blur(4px)",
            display: "flex", justifyContent: "flex-start", WebkitAppRegion: "no-drag"
          } as React.CSSProperties}
          onClick={() => setShowHistoryDrawer(false)}
        >
          <div 
            style={{
              width: "280px", height: "100%", backgroundColor: theme.modal,
              borderRight: theme.border, display: "flex", flexDirection: "column",
              boxShadow: theme.shadow, padding: "20px 16px", boxSizing: "border-box",
              gap: "16px", animation: "slideIn 0.25s ease-out"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 id="history-drawer-title" style={{ fontSize: "16px", margin: 0, color: theme.heading, fontWeight: 600 }}>Sessions History</h3>
              <button 
                onClick={() => setShowHistoryDrawer(false)}
                style={{ background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: "16px" }}
              >✕</button>
            </div>

            <button
              onClick={() => { handleClearChat(); setShowHistoryDrawer(false); }}
              style={{
                width: "100%", padding: "10px", borderRadius: "8px", border: "none",
                backgroundColor: theme.accent, color: "white", cursor: "pointer",
                fontWeight: 500, fontSize: "13px", display: "flex", alignItems: "center",
                justifyContent: "center", gap: "6px", boxShadow: theme.accentGlow
              }}
            >
              <span>+</span> New Chat
            </button>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {sessionsList.length === 0 ? (
                <div style={{ fontSize: "12px", color: theme.textSubtle, textAlign: "center", marginTop: "20px" }}>No past sessions found</div>
              ) : (
                sessionsList.map(s => {
                  const isActive = s.sessionId === activeSessionId;
                  const title = s.question?.substring(0, 30) + (s.question?.length > 30 ? "..." : "") || "Untitled Session";
                  return (
                    <div
                      key={s.sessionId}
                      onClick={() => handleSelectSession(s.sessionId)}
                      style={{
                        padding: "10px 12px", borderRadius: "8px",
                        backgroundColor: isActive ? theme.accentSoft : theme.input,
                        border: isActive ? `1px solid ${theme.accent}` : theme.borderSoft,
                        cursor: "pointer", display: "flex", justifyContent: "space-between",
                        alignItems: "center", gap: "8px", transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = theme.buttonHover; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = theme.input; }}
                    >
                      <span style={{
                        fontSize: "12px", color: isActive ? theme.accentText : theme.text,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1
                      }}>{title}</span>
                      <button
                        onClick={(e) => handleDeleteSession(e, s.sessionId)}
                        title="Delete session"
                        style={{
                          background: "transparent", border: "none",
                          color: theme.dangerText, cursor: "pointer", fontSize: "11px", padding: "2px"
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes thinkingShimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .thinking-shimmer {
          color: transparent;
          background: linear-gradient(90deg, ${theme.textSubtle}, ${theme.accentText}, ${theme.text}, ${theme.accentText}, ${theme.textSubtle});
          background-size: 220% auto;
          -webkit-background-clip: text;
          background-clip: text;
          animation: thinkingShimmer 1.4s linear infinite;
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}

export default App;