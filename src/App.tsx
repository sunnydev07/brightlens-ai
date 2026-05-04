import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";

// ── Streaming helper (module-level, no React deps) ────────────────────────────
async function streamAnalyze(
  payload: { image?: string | null; prompt: string; mode: string; systemPrompt?: string | null; onlineVisionModel?: string },
  onToken: (t: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("http://localhost:5000/analyze-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

type ThemeName = "default" | "dracula" | "githubDark";

type ThemeTokens = {
  label: string;
  appIcon: string;
  appIconShadow: string;
  topPillBg: string;
  panel: string;
  modal: string;
  overlay: string;
  border: string;
  borderSoft: string;
  shadow: string;
  insetShadow: string;
  control: string;
  controlActive: string;
  button: string;
  buttonHover: string;
  input: string;
  response: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  placeholder: string;
  heading: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentGlow: string;
  smartBg: string;
  smartText: string;
  success: string;
  danger: string;
  dangerText: string;
  dangerSoft: string;
  markdown: {
    text: string;
    muted: string;
    heading: string;
    headingSoft: string;
    link: string;
    codeBg: string;
    inlineCodeBg: string;
  };
};

const THEMES: Record<ThemeName, ThemeTokens> = {
  default: {
    label: "Default",
    appIcon: "linear-gradient(135deg, #7c3aed, #ec4899)",
    appIconShadow: "0 2px 10px rgba(124, 58, 237, 0.4)",
    topPillBg: "rgba(30, 30, 35, 0.75)",
    panel: "rgba(30, 30, 35, 0.65)",
    modal: "rgba(30, 30, 35, 0.95)",
    overlay: "rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderSoft: "1px solid rgba(255,255,255,0.05)",
    shadow: "0 8px 32px rgba(0,0,0,0.4)",
    insetShadow: "inset 0 2px 10px rgba(0,0,0,0.2)",
    control: "rgba(0,0,0,0.4)",
    controlActive: "rgba(255,255,255,0.15)",
    button: "rgba(255,255,255,0.05)",
    buttonHover: "rgba(255,255,255,0.15)",
    input: "rgba(0,0,0,0.3)",
    response: "rgba(255,255,255,0.04)",
    text: "#ffffff",
    textMuted: "#cbd5e1",
    textSubtle: "#888888",
    placeholder: "rgba(255,255,255,0.45)",
    heading: "#ffffff",
    accent: "#7c3aed",
    accentText: "#a78bfa",
    accentSoft: "rgba(124, 58, 237, 0.2)",
    accentGlow: "0 2px 10px rgba(124, 58, 237, 0.4)",
    smartBg: "rgba(234, 88, 12, 0.15)",
    smartText: "#fb923c",
    success: "#10b981",
    danger: "#ef4444",
    dangerText: "#fca5a5",
    dangerSoft: "rgba(239,68,68,0.15)",
    markdown: {
      text: "#e2e8f0",
      muted: "#cbd5e1",
      heading: "#ffffff",
      headingSoft: "#f1f5f9",
      link: "#8b5cf6",
      codeBg: "rgba(0,0,0,0.4)",
      inlineCodeBg: "rgba(255,255,255,0.1)"
    }
  },
  dracula: {
    label: "Dracula Glass",
    appIcon: "linear-gradient(135deg, #bd93f9, #ff79c6)",
    appIconShadow: "0 2px 14px rgba(255, 121, 198, 0.42)",
    topPillBg: "rgba(33, 30, 48, 0.78)",
    panel: "rgba(40, 42, 62, 0.66)",
    modal: "rgba(40, 42, 62, 0.96)",
    overlay: "rgba(12,10,18,0.66)",
    border: "1px solid rgba(189,147,249,0.2)",
    borderSoft: "1px solid rgba(255,121,198,0.12)",
    shadow: "0 8px 36px rgba(8, 6, 16, 0.55)",
    insetShadow: "inset 0 2px 12px rgba(0,0,0,0.26)",
    control: "rgba(20, 18, 31, 0.58)",
    controlActive: "rgba(189,147,249,0.24)",
    button: "rgba(189,147,249,0.1)",
    buttonHover: "rgba(255,121,198,0.18)",
    input: "rgba(20, 18, 31, 0.5)",
    response: "rgba(68,71,90,0.32)",
    text: "#f8f8f2",
    textMuted: "#d6d2f0",
    textSubtle: "#9a8fb8",
    placeholder: "rgba(248,248,242,0.45)",
    heading: "#f8f8f2",
    accent: "#bd93f9",
    accentText: "#ff79c6",
    accentSoft: "rgba(189,147,249,0.22)",
    accentGlow: "0 2px 14px rgba(189,147,249,0.42)",
    smartBg: "rgba(255,184,108,0.16)",
    smartText: "#ffb86c",
    success: "#50fa7b",
    danger: "#ff5555",
    dangerText: "#ffb3b3",
    dangerSoft: "rgba(255,85,85,0.16)",
    markdown: {
      text: "#f8f8f2",
      muted: "#d6d2f0",
      heading: "#ffffff",
      headingSoft: "#bd93f9",
      link: "#8be9fd",
      codeBg: "rgba(20, 18, 31, 0.72)",
      inlineCodeBg: "rgba(255,121,198,0.14)"
    }
  },
  githubDark: {
    label: "GitHub Dark Glass",
    appIcon: "linear-gradient(135deg, #2f81f7, #58a6ff)",
    appIconShadow: "0 2px 14px rgba(47,129,247,0.42)",
    topPillBg: "rgba(13, 17, 23, 0.78)",
    panel: "rgba(22, 27, 34, 0.68)",
    modal: "rgba(22, 27, 34, 0.96)",
    overlay: "rgba(1,4,9,0.66)",
    border: "1px solid rgba(139,148,158,0.22)",
    borderSoft: "1px solid rgba(139,148,158,0.14)",
    shadow: "0 8px 36px rgba(1,4,9,0.52)",
    insetShadow: "inset 0 2px 12px rgba(1,4,9,0.34)",
    control: "rgba(1, 4, 9, 0.56)",
    controlActive: "rgba(47,129,247,0.22)",
    button: "rgba(139,148,158,0.1)",
    buttonHover: "rgba(47,129,247,0.16)",
    input: "rgba(1,4,9,0.42)",
    response: "rgba(13,17,23,0.44)",
    text: "#f0f6fc",
    textMuted: "#c9d1d9",
    textSubtle: "#8b949e",
    placeholder: "rgba(240,246,252,0.42)",
    heading: "#f0f6fc",
    accent: "#2f81f7",
    accentText: "#58a6ff",
    accentSoft: "rgba(47,129,247,0.2)",
    accentGlow: "0 2px 14px rgba(47,129,247,0.42)",
    smartBg: "rgba(210,153,34,0.16)",
    smartText: "#d29922",
    success: "#3fb950",
    danger: "#f85149",
    dangerText: "#ffa198",
    dangerSoft: "rgba(248,81,73,0.16)",
    markdown: {
      text: "#c9d1d9",
      muted: "#b1bac4",
      heading: "#f0f6fc",
      headingSoft: "#dbeafe",
      link: "#58a6ff",
      codeBg: "rgba(1,4,9,0.68)",
      inlineCodeBg: "rgba(110,118,129,0.2)"
    }
  }
};

const themeEntries = Object.entries(THEMES) as [ThemeName, ThemeTokens][];

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
  const [modes, setModes] = useState<{name: string, systemPrompt: string | null}[]>(() => {
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

  const selectedModeNameRef = useRef("Default");
  useEffect(() => { selectedModeNameRef.current = selectedModeName; }, [selectedModeName]);
  const modesRef = useRef<{name: string, systemPrompt: string | null}[]>([]);
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
      const res = await axios.post("http://localhost:5000/speech", formData);
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
        controller.signal
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
        const base64 = canvas.toDataURL("image/png");
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
          controller.signal
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
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderRadius: "50px", 
        backgroundColor: theme.topPillBg, backdropFilter: "blur(24px)",
        boxShadow: theme.shadow,
        border: theme.border,
        WebkitAppRegion: "drag", // Makes it draggable
        position: "relative", zIndex: 50
      } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
           {/* Application icon (minimal) */}
           <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: theme.appIcon, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "bold", color: "#fff", boxShadow: theme.appIconShadow }}>B</div>
           
           {/* Recording Action Button */}
           <button
             onMouseDown={startRecording} onMouseUp={stopRecording}
             onTouchStart={startRecording} onTouchEnd={stopRecording}
             style={{
               display: "flex", alignItems: "center", gap: "8px",
               padding: "6px 14px", borderRadius: "20px", border: theme.borderSoft,
               backgroundColor: isRecording ? theme.dangerSoft : theme.button,
               color: isRecording ? theme.dangerText : theme.text, fontSize: "13px", fontWeight: 500, cursor: "pointer",
               transition: "all 0.2s"
             }}
           >
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: isRecording ? theme.danger : theme.success, boxShadow: isRecording ? `0 0 10px ${theme.danger}` : `0 0 10px ${theme.success}`, animation: isRecording ? "blink 1.5s infinite" : "none" }} />
              {isRecording ? "Stop Recording" : "Start Listening"}
           </button>
           

        </div>
        
        {/* Window Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          {/* Minimize Button */}
          <button 
            onClick={(e) => { e.preventDefault(); window.electronAPI?.minimizeApp?.(); }}
            title="Minimize"
            style={{
              width: "28px", height: "28px", borderRadius: "50%", border: "none", 
              backgroundColor: "transparent", color: "#aaa", fontSize: "14px",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#aaa"; }}
          >
            ─
          </button>
          {/* Maximize Button */}
          <button 
            onClick={(e) => { e.preventDefault(); window.electronAPI?.maximizeApp?.(); }}
            title="Maximize"
            style={{
              width: "28px", height: "28px", borderRadius: "50%", border: "none", 
              backgroundColor: "transparent", color: "#aaa", fontSize: "12px",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#aaa"; }}
          >
            □
          </button>
          {/* Close Button */}
          <button 
            onClick={(e) => { e.preventDefault(); window.electronAPI?.closeApp?.(); }}
            title="Close"
            style={{
              width: "28px", height: "28px", borderRadius: "50%", border: "none", 
              backgroundColor: "transparent", color: "#aaa", fontSize: "14px",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.2)"; e.currentTarget.style.color = "#fca5a5"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#aaa"; }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* INTEGRATED CONTENT AREA */}
      <div style={{
        display: "flex", flexDirection: "column", flex: 1, padding: "20px",
        borderRadius: "24px", backgroundColor: theme.panel,
        backdropFilter: "blur(30px)", border: theme.border,
        boxShadow: theme.shadow, overflow: "hidden",
        WebkitAppRegion: "no-drag"
      } as React.CSSProperties}>

        {/* Sleek Vision Segmented Control */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
           <div style={{ display: "flex", backgroundColor: theme.control, borderRadius: "14px", padding: "4px", boxShadow: theme.insetShadow }}>
             <button onClick={() => setImageMode("online")} style={{
               padding: "6px 16px", borderRadius: "10px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer",
               backgroundColor: imageMode === "online" ? theme.controlActive : "transparent",
               color: imageMode === "online" ? theme.text : theme.textSubtle, transition: "all 0.2s",
               boxShadow: imageMode === "online" ? theme.accentGlow : "none"
             }}>online</button>
             <button onClick={() => setImageMode("offline")} style={{
               padding: "6px 16px", borderRadius: "10px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer",
               backgroundColor: imageMode === "offline" ? theme.controlActive : "transparent",
               color: imageMode === "offline" ? theme.text : theme.textSubtle, transition: "all 0.2s",
               boxShadow: imageMode === "offline" ? theme.accentGlow : "none"
             }}>offline</button>
           </div>
        </div>

        {/* Compact chat-style loading state */}
        {(loading || speechLoading) && !response && (
          <div style={{
            display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start",
            flex: 1, marginBottom: "20px", overflowY: "auto", justifyContent: "flex-start"
          }}>
            {submittedQuestion && (
              <div style={{
                alignSelf: "flex-end", maxWidth: "82%", padding: "10px 12px", borderRadius: "14px 14px 4px 14px",
                backgroundColor: theme.accentSoft, border: `1px solid ${theme.accent}`,
                color: theme.text, fontSize: "13px", lineHeight: 1.45, boxShadow: theme.insetShadow
              }}>
                {submittedQuestion}
              </div>
            )}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "8px", width: "fit-content",
              padding: "8px 12px", borderRadius: "999px", backgroundColor: theme.response,
              border: theme.border, boxShadow: theme.insetShadow
            }}>
              <span style={{
                width: "7px", height: "7px", borderRadius: "50%", backgroundColor: speechLoading ? theme.success : theme.accent,
                boxShadow: `0 0 10px ${speechLoading ? theme.success : theme.accent}`
              }} />
              <span className="thinking-shimmer" style={{ fontSize: "13px", fontWeight: 700 }}>
                {speechLoading ? "Listening" : "Thinking"}
              </span>
            </div>
          </div>
        )}

        {/* Screenshot preview if provided */}
        {image && !loading && !response && (
          <div style={{ marginBottom: "20px", position: "relative", borderRadius: "12px", overflow: "hidden", border: theme.border }}>
            <img src={image} alt="Captured context" style={{ width: "100%", display: "block" }} />
            <div style={{ position: "absolute", bottom: "8px", right: "8px", padding: "4px 8px", backgroundColor: theme.control, borderRadius: "6px", fontSize: "11px", color: theme.textMuted }}>Visual Context Attached</div>
          </div>
        )}

        {/* Chat / Response Area */}
        {response && (
          <div style={{
            padding: "16px 20px", borderRadius: "16px", fontSize: "14px",
            backgroundColor: theme.response, border: theme.border,
            lineHeight: "1.6", textAlign: "left", flex: 1, overflowY: "auto", marginBottom: "20px",
            boxShadow: theme.insetShadow, position: "relative"
          }}>
            {image && (
              <div className="visual-context-thumbnail" style={{
                position: "absolute", top: "12px", right: "12px", width: "170px",
                borderRadius: "12px", overflow: "hidden", border: theme.border,
                backgroundColor: theme.input, boxShadow: theme.shadow, zIndex: 2
              }}>
                <img src={image} alt="Captured visual context" style={{ width: "100%", display: "block" }} />
                <div style={{
                  position: "absolute", left: "6px", right: "6px", bottom: "6px", padding: "3px 6px",
                  backgroundColor: theme.control, borderRadius: "7px", color: theme.textMuted,
                  fontSize: "10px", fontWeight: 700, textAlign: "center", backdropFilter: "blur(10px)"
                }}>Visual Context</div>
              </div>
            )}
            <div style={{ paddingRight: image ? "190px" : 0 }}>
              <ReactMarkdown
                components={{
                  p: (props) => <p style={{margin: "0 0 1em 0", color: theme.markdown.text}} {...props} />,
                  pre: (props) => <pre style={{backgroundColor: theme.markdown.codeBg, padding: "16px", borderRadius: "10px", overflowX: "auto", margin: "1em 0", border: theme.border}} {...props} />,
                  code: ({inline, className, ...props}: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) => <code style={{backgroundColor: inline ? theme.markdown.inlineCodeBg : "transparent", padding: inline ? "2px 6px" : 0, borderRadius: "6px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.9em", color: inline ? theme.accentText : theme.markdown.text}} className={className} {...props} />,
                  ul: (props) => <ul style={{listStyleType: "disc", paddingLeft: "24px", marginBottom: "1em", color: theme.markdown.muted}} {...props} />,
                  ol: (props) => <ol style={{listStyleType: "decimal", paddingLeft: "24px", marginBottom: "1em", color: theme.markdown.muted}} {...props} />,
                  li: (props) => <li style={{marginBottom: "0.4em"}} {...props} />,
                  h1: (props) => <h1 style={{fontSize: "1.4em", fontWeight: 600, margin: "1.2em 0 0.6em", color: theme.markdown.heading}} {...props} />,
                  h2: (props) => <h2 style={{fontSize: "1.2em", fontWeight: 600, margin: "1.2em 0 0.6em", color: theme.markdown.headingSoft}} {...props} />,
                  h3: (props) => <h3 style={{fontSize: "1.1em", fontWeight: 600, margin: "1.2em 0 0.6em", color: theme.markdown.headingSoft}} {...props} />,
                  a: (props) => <a style={{color: theme.markdown.link, textDecoration: "none", fontWeight: 500}} {...props} />
                }}
              >
                {response + (loading ? " ▌" : "")}
              </ReactMarkdown>
            </div>
            <div ref={bottomRef} style={{ height: "1px" }} />
          </div>
        )}

        {/* Spacer if empty to push input to bottom */}
        {!response && !loading && !speechLoading && <div style={{ flex: 1 }} />}

        {/* Input Area */}
        <div style={{
          borderRadius: "16px", border: theme.border,
          backgroundColor: theme.input, overflow: "visible", position: "relative",
          boxShadow: theme.insetShadow
        }}>
          <textarea
            id="question-input"
            value={questionText}
            onChange={e => setQuestionText(e.target.value)}
            onKeyDown={e => {
              if (!e.shiftKey && e.key === "Enter") { e.preventDefault(); handleAskText(); }
            }}
            placeholder="Ask about your screen..."
            disabled={speechLoading}
            rows={2}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              color: theme.text,
              fontSize: "14px", padding: "16px 16px 44px 16px", resize: "none",
              boxSizing: "border-box", fontFamily: "inherit", lineHeight: "1.5"
            }}
          />
          {/* Action Row Inside Input */}
          <div style={{
            position: "absolute", bottom: "8px", left: "12px", right: "8px",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                 onClick={(e) => {
                   e.preventDefault();
                   if (window.electronAPI?.requestScreenCapture) {
                     window.electronAPI.requestScreenCapture();
                   } else {
                     setError("Screen capture only works in Electron app.");
                   }
                 }}
                 style={{
                   display: "flex", alignItems: "center", gap: "4px",
                   padding: "6px 10px", borderRadius: "8px", border: theme.borderSoft,
                   backgroundColor: theme.button, color: theme.textMuted, fontSize: "12px", fontWeight: 500,
                   cursor: "pointer", transition: "all 0.2s"
                 }}
                 onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.buttonHover}
                 onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.button}
              >
                <span style={{ fontSize: "14px" }}>⛶</span> Use Screen
              </button>

              <button
                 style={{
                   display: "flex", alignItems: "center", gap: "4px",
                   padding: "6px 10px", borderRadius: "8px", border: "none",
                   backgroundColor: theme.smartBg, color: theme.smartText, fontSize: "12px", fontWeight: 500,
                   cursor: "default"
                 }}
              >
                <span style={{ fontSize: "14px" }}>⚡</span> Smart
              </button>

              {/* Mode Selector inside Action Row */}
              <div style={{ position: "relative" }}>
                <button
                   onClick={() => setShowModeMenu(!showModeMenu)}
                   style={{
                     display: "flex", alignItems: "center", gap: "4px",
                     padding: "6px 10px", borderRadius: "8px", border: theme.borderSoft,
                     backgroundColor: showModeMenu ? theme.controlActive : theme.button,
                     color: theme.textMuted, fontSize: "12px", cursor: "pointer", transition: "all 0.2s"
                   }}
                   onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.buttonHover}
                   onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showModeMenu ? theme.controlActive : theme.button}
                >
                  {selectedModeName} <span style={{fontSize: "10px", opacity: 0.7}}>﹀</span>
                </button>

                {showModeMenu && (
                  <div style={{
                    position: "absolute", bottom: "100%", left: 0, marginBottom: "8px",
                    backgroundColor: theme.modal, backdropFilter: "blur(20px)",
                    border: theme.border, borderRadius: "12px",
                    padding: "8px 0", minWidth: "160px", zIndex: 100,
                    boxShadow: theme.shadow
                  }}>
                    <div style={{ padding: "4px 12px", fontSize: "11px", color: theme.textSubtle, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Your Modes
                    </div>
                    {modes.map(m => (
                      <div 
                        key={m.name}
                        onClick={() => { setSelectedModeName(m.name); setShowModeMenu(false); }}
                        style={{
                          padding: "8px 16px", fontSize: "13px", color: theme.textMuted, cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          backgroundColor: selectedModeName === m.name ? theme.controlActive : "transparent"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.buttonHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedModeName === m.name ? theme.controlActive : "transparent"}
                      >
                        {m.name} {selectedModeName === m.name && <span style={{color: theme.accent}}>✓</span>}
                      </div>
                    ))}
                    <div style={{ height: "1px", backgroundColor: theme.border.replace("1px solid ", ""), margin: "4px 0" }} />
                    <div 
                      onClick={() => { setShowModeMenu(false); setShowCreateMode(true); }}
                      style={{
                        padding: "8px 16px", fontSize: "13px", color: theme.text, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: "6px"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.buttonHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      + Create Mode
                    </div>
                  </div>
                )}
              </div>

              <label title="Upload Audio" style={{
                width: "28px", height: "28px", borderRadius: "8px",
                backgroundColor: theme.button, cursor: "pointer", color: theme.textSubtle,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.buttonHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.button}
              >
                📎<input type="file" accept="audio/*" onChange={handleAudioUpload} style={{ display: "none" }} />
              </label>

              {(questionText || response || submittedQuestion) && (
                <button onClick={() => { setQuestionText(""); setResponse(""); setSubmittedQuestion(""); setImage(null); setError(""); }}
                  title="Clear all" style={{
                    width: "28px", height: "28px", borderRadius: "8px", border: "none",
                    cursor: "pointer", backgroundColor: theme.button, color: theme.textSubtle, fontSize: "12px",
                    transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.buttonHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.button}
                >✕</button>
              )}

              <button 
                onClick={(e) => { e.preventDefault(); setShowSettings(true); }}
                title="Settings" style={{
                  width: "28px", height: "28px", borderRadius: "8px", border: "none",
                  cursor: "pointer", backgroundColor: theme.button, color: theme.textSubtle, fontSize: "14px",
                  transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.buttonHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.button}
              >⚙</button>
            </div>

            {loading ? (
              <button
                onClick={stopGeneration}
                title="Stop Generation"
                style={{
                  width: "32px", height: "32px", borderRadius: "8px", border: "none",
                  cursor: "pointer",
                  backgroundColor: theme.dangerSoft,
                  color: theme.danger,
                  fontSize: "14px", display: "flex",
                  alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                }}
              >
                ■
              </button>
            ) : (
              <button
                onClick={handleAskText}
                disabled={!questionText.trim()}
                title="Send (Enter)"
                style={{
                  width: "32px", height: "32px", borderRadius: "8px", border: "none",
                  cursor: !questionText.trim() ? "not-allowed" : "pointer",
                  backgroundColor: !questionText.trim() ? theme.button : theme.accent,
                  color: !questionText.trim() ? theme.textSubtle : "white",
                  fontSize: "14px", display: "flex",
                  alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                  boxShadow: !questionText.trim() ? "none" : theme.accentGlow,
                }}
              >
                ➤
              </button>
            )}
          </div>
        </div>

        {/* Errors */}
        {error && (
          <div style={{
            marginTop: "12px", padding: "10px 14px", borderRadius: "8px", 
            backgroundColor: theme.dangerSoft, border: `1px solid ${theme.danger}`,
            color: theme.dangerText, fontSize: "13px"
          }}>{error}</div>
        )}

      </div>



      {/* Create Mode Modal */}
      {showCreateMode && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: theme.overlay, zIndex: 100, backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", WebkitAppRegion: "no-drag"
        } as React.CSSProperties}>
          <div style={{
            backgroundColor: theme.modal, borderRadius: "16px", padding: "24px", 
            width: "90%", maxWidth: "400px", border: theme.border, color: theme.text,
            boxShadow: theme.shadow
          }}>
            <h2 style={{ fontSize: "18px", marginBottom: "20px", marginTop: 0, fontWeight: 600 }}>Create Mode</h2>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: theme.textSubtle, marginBottom: "6px" }}>Name</label>
              <input 
                type="text" 
                value={newModeName} 
                onChange={(e) => setNewModeName(e.target.value)} 
                placeholder="e.g. Code Reviewer"
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "8px", border: theme.border,
                  backgroundColor: theme.input, color: theme.text, boxSizing: "border-box", outline: "none"
                }}
              />
            </div>
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "12px", color: theme.textSubtle, marginBottom: "6px" }}>System Prompt (Markdown supported)</label>
              <textarea 
                value={newModePrompt} 
                onChange={(e) => setNewModePrompt(e.target.value)} 
                placeholder="You are an expert code reviewer..."
                rows={4}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "8px", border: theme.border,
                  backgroundColor: theme.input, color: theme.text, boxSizing: "border-box", resize: "vertical", fontFamily: "monospace", outline: "none"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button 
                onClick={() => { setShowCreateMode(false); setNewModeName(""); setNewModePrompt(""); }}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: theme.button, color: theme.text, cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
              >Cancel</button>
              <button 
                onClick={() => {
                  if (newModeName.trim()) {
                    setModes(prev => [...prev, { name: newModeName.trim(), systemPrompt: newModePrompt.trim() }]);
                    setSelectedModeName(newModeName.trim());
                    setShowCreateMode(false);
                    setNewModeName("");
                    setNewModePrompt("");
                  }
                }}
                disabled={!newModeName.trim()}
                style={{ 
                  padding: "8px 16px", borderRadius: "8px", border: "none", 
                  backgroundColor: newModeName.trim() ? theme.accent : theme.button, 
                  color: newModeName.trim() ? "white" : theme.textSubtle, cursor: newModeName.trim() ? "pointer" : "not-allowed",
                  transition: "all 0.2s", fontSize: "13px", fontWeight: 500
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: theme.overlay, zIndex: 100, backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", WebkitAppRegion: "no-drag"
        } as React.CSSProperties}>
          <div style={{
            backgroundColor: theme.modal, borderRadius: "16px", padding: "24px", 
            width: "90%", maxWidth: "440px", border: theme.border, color: theme.text,
            boxShadow: theme.shadow
          }}>
            <h2 style={{ fontSize: "18px", marginBottom: "20px", marginTop: 0, fontWeight: 600, color: theme.heading }}>Settings</h2>
            
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "13px", color: theme.text, marginBottom: "8px", fontWeight: 500 }}>Theme</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                {themeEntries.map(([themeName, themeChoice]) => {
                  const isActive = selectedThemeName === themeName;
                  return (
                    <button
                      key={themeName}
                      onClick={() => setSelectedThemeName(themeName)}
                      style={{
                        padding: "10px 8px", borderRadius: "10px", border: isActive ? `1px solid ${theme.accent}` : theme.borderSoft,
                        backgroundColor: isActive ? theme.accentSoft : theme.input,
                        color: isActive ? theme.accentText : theme.textMuted,
                        cursor: "pointer", transition: "all 0.2s", fontWeight: isActive ? 700 : 500,
                        boxShadow: isActive ? theme.accentGlow : "none", fontSize: "12px"
                      }}
                    >
                      {themeChoice.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: "11px", color: theme.textSubtle, marginTop: "8px" }}>
                Choose the transparent developer theme used for controls and markdown responses.
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "13px", color: theme.text, marginBottom: "8px", fontWeight: 500 }}>Online Vision Model</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setOnlineVisionModel("gemini")}
                  style={{
                    flex: 1, padding: "10px", borderRadius: "8px", border: theme.border,
                    backgroundColor: onlineVisionModel === "gemini" ? theme.accentSoft : theme.input,
                    color: onlineVisionModel === "gemini" ? theme.accentText : theme.textSubtle,
                    cursor: "pointer", transition: "all 0.2s", fontWeight: onlineVisionModel === "gemini" ? 600 : 400,
                    boxShadow: onlineVisionModel === "gemini" ? `inset 0 0 0 1px ${theme.accent}` : "none"
                  }}
                >
                  Gemini
                </button>
                <button
                  onClick={() => setOnlineVisionModel("nvidia")}
                  style={{
                    flex: 1, padding: "10px", borderRadius: "8px", border: theme.border,
                    backgroundColor: onlineVisionModel === "nvidia" ? "rgba(16, 185, 129, 0.2)" : theme.input,
                    color: onlineVisionModel === "nvidia" ? theme.success : theme.textSubtle,
                    cursor: "pointer", transition: "all 0.2s", fontWeight: onlineVisionModel === "nvidia" ? 600 : 400,
                    boxShadow: onlineVisionModel === "nvidia" ? `inset 0 0 0 1px ${theme.success}` : "none"
                  }}
                >
                  NVIDIA (Phi-4)
                </button>
              </div>
              <div style={{ fontSize: "11px", color: theme.textSubtle, marginTop: "8px" }}>
                {onlineVisionModel === "nvidia" 
                  ? "Uses NVIDIA's microsoft/phi-4-multimodal-instruct API. Requires NVIDIA_API_KEY in .env." 
                  : "Uses Google's Gemini 3 Flash Preview. Requires GEMINI_API_KEY in .env."}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button 
                onClick={() => setShowSettings(false)}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: theme.accent, color: "white", cursor: "pointer", fontSize: "13px", fontWeight: 500, transition: "all 0.2s", boxShadow: theme.accentGlow }}
              >Done</button>
            </div>
          </div>
        </div>
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