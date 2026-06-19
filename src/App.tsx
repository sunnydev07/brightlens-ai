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

// Configurable API base URL
const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:5000").replace(/\/$/, "");

// ── Streaming helper (module-level, no React deps) ────────────────────────────
async function streamAnalyze(
  payload: { image?: string | null; prompt: string; mode: string; systemPrompt?: string | null; onlineVisionModel?: string },
  onToken: (t: string) => void,
  signal?: AbortSignal,
  keys?: { geminiKey?: string; openrouterKey?: string; nvidiaKey?: string }
): Promise<void> {
  const customHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (keys?.geminiKey) customHeaders["x-gemini-key"] = keys.geminiKey;
  if (keys?.openrouterKey) customHeaders["x-openrouter-key"] = keys.openrouterKey;
  if (keys?.nvidiaKey) customHeaders["x-nvidia-key"] = keys.nvidiaKey;

  const res = await fetch(`${API_BASE}/analyze-stream`, {
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
        // Re-throw only real errors, swallow JSON parse errors
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
  const [response, setResponse] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
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
  const [selectedThemeName, setSelectedThemeName] = useState<ThemeName>(() => {
    const savedTheme = localStorage.getItem("brightlens_theme") as ThemeName | null;
    return savedTheme && savedTheme in THEMES ? savedTheme : "default";
  });
  const theme = THEMES[selectedThemeName];

  // API key override states
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("brightlens_gemini_key") || "");
  const [openrouterKey, setOpenrouterKey] = useState(() => localStorage.getItem("brightlens_openrouter_key") || "");
  const [nvidiaKey, setNvidiaKey] = useState(() => localStorage.getItem("brightlens_nvidia_key") || "");

  useEffect(() => { localStorage.setItem("brightlens_gemini_key", geminiKey); }, [geminiKey]);
  useEffect(() => { localStorage.setItem("brightlens_openrouter_key", openrouterKey); }, [openrouterKey]);
  useEffect(() => { localStorage.setItem("brightlens_nvidia_key", nvidiaKey); }, [nvidiaKey]);

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
      // If we are within 50px of the bottom, enable auto-scroll, else disable it
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
  }, [response, loading]);

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
      const res = await axios.post(`${API_BASE}/speech`, formData);
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
  }, []);

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
      setResponse("");
      setImage(null);
      setSubmittedQuestion(q);
      setQuestionText(""); // Clear input area
      autoScrollRef.current = true; // reset to true on new request
      const currentMode = modesRef.current.find(m => m.name === selectedModeNameRef.current);
      
      const controller = new AbortController();
      abortControllerRef.current = controller;

      await streamAnalyze(
        { prompt: q, mode: imageModeRef.current, systemPrompt: currentMode?.systemPrompt, onlineVisionModel: onlineVisionModelRef.current },
        (token) => setResponse(prev => prev + token),
        controller.signal,
        { geminiKey, openrouterKey, nvidiaKey }
      );
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
        setResponse("");

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

        const q = questionTextRef.current.trim();
        const prompt = q
          ? `Answer the user's question using the screenshot as context. Question: ${q}`
          : "Explain what's on screen in simple steps";
        setSubmittedQuestion(q || "Explain what's on screen in simple steps");
          
        setQuestionText(""); // Clear input area

        const currentMode = modesRef.current.find(m => m.name === selectedModeNameRef.current);
        autoScrollRef.current = true; // reset to true on new request

        const controller = new AbortController();
        abortControllerRef.current = controller;

        await streamAnalyze(
          { image: base64, prompt, mode: imageModeRef.current, systemPrompt: currentMode?.systemPrompt, onlineVisionModel: onlineVisionModelRef.current },
          (token) => setResponse(prev => prev + token),
          controller.signal,
          keysRef.current
        );
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
  }, [startRecording, stopRecording]);

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
        WebkitAppRegion: "no-drag"
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
          response={response}
          submittedQuestion={submittedQuestion}
          image={image}
          bottomRef={bottomRef}
        />

        {/* Spacer if empty to push input to bottom */}
        {!response && !loading && !speechLoading && <div style={{ flex: 1 }} />}

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
          response={response}
          submittedQuestion={submittedQuestion}
          setImage={setImage}
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
          setShowSettings={setShowSettings}
          geminiKey={geminiKey}
          setGeminiKey={setGeminiKey}
          openrouterKey={openrouterKey}
          setOpenrouterKey={setOpenrouterKey}
          nvidiaKey={nvidiaKey}
          setNvidiaKey={setNvidiaKey}
        />
      )}

      {/* Animations */}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes thinkingShimmer { 0% { background-position: 200% center; } 100% { background-position: -200% center; } }
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