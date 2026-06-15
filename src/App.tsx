import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ComponentPropsWithoutRef,
} from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";

const API_BASE_URL = "http://127.0.0.1:5000";

type BrightlensMode = {
  name: string;
  systemPrompt: string | null;
};

const DEFAULT_MODES: BrightlensMode[] = [
  { name: "Default", systemPrompt: null },
];

function loadSavedModes(): BrightlensMode[] {
  const saved = localStorage.getItem("brightlens_modes");
  if (!saved) return DEFAULT_MODES;

  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return DEFAULT_MODES;

    const names = new Set<string>();
    const validModes = parsed.filter((mode): mode is BrightlensMode => {
      if (!mode || typeof mode !== "object") return false;
      const candidate = mode as Partial<BrightlensMode>;
      if (
        typeof candidate.name !== "string"
        || !candidate.name.trim()
        || (
          candidate.systemPrompt !== null
          && typeof candidate.systemPrompt !== "string"
        )
      ) {
        return false;
      }

      const normalizedName = candidate.name.trim().toLowerCase();
      if (names.has(normalizedName)) return false;
      names.add(normalizedName);
      return true;
    }).map((mode) => ({
      name: mode.name.trim(),
      systemPrompt: mode.systemPrompt?.trim() || null,
    }));

    return validModes.length > 0 ? validModes : DEFAULT_MODES;
  } catch {
    return DEFAULT_MODES;
  }
}

function processSseLine(line: string, onToken: (token: string) => void) {
  if (!line.startsWith("data: ")) return;
  const raw = line.slice(6).trim();
  if (!raw) return;

  let data: { token?: string; error?: string };
  try {
    data = JSON.parse(raw) as { token?: string; error?: string };
  } catch {
    return;
  }

  if (data.error) throw new Error(data.error);
  if (data.token) onToken(data.token);
}

// ── Streaming helper (module-level, no React deps) ────────────────────────────
async function streamAnalyze(
  payload: { image?: string | null; prompt: string; mode: string; systemPrompt?: string | null },
  onToken: (t: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/analyze-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `Server error ${res.status}`);
  }

  if (!res.body) {
    throw new Error("The server returned an empty streaming response.");
  }

  const reader = res.body.getReader();
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
      processSseLine(line, onToken);
    }
  }

  buffer += decoder.decode();
  for (const line of buffer.split("\n")) {
    processSseLine(line, onToken);
  }
}

function withoutMarkdownNode<T extends { node?: unknown }>(
  props: T,
): Omit<T, "node"> {
  const { node, ...domProps } = props;
  void node;
  return domProps;
}

// ─────────────────────────────────────────────────────────────────────────────

function formatMiniJarvisResult(result: MiniJarvisCommandResult): string {
  const heading = result.ok ? "Done." : "I couldn't complete that action.";

  if (result.results?.length) {
    const messages = result.results
      .map((entry) => {
        if (entry.error) return entry.error;
        if (entry.cancelled) return "Action cancelled.";
        if (!entry.result || typeof entry.result !== "object") return "";

        const detail = entry.result as {
          message?: unknown;
          error?: unknown;
          text?: unknown;
        };
        if (typeof detail.message === "string") return detail.message;
        if (typeof detail.error === "string") return detail.error;
        if (typeof detail.text === "string") {
          return detail.text ? `Clipboard: ${detail.text}` : "The clipboard is empty.";
        }
        return "";
      })
      .filter(Boolean);

    if (messages.length) {
      return `${heading}\n\n${messages.join("\n")}`;
    }

    return `${heading}\n\n\`\`\`json\n${JSON.stringify(result.results, null, 2)}\n\`\`\``;
  }

  return `${heading}\n\n${result.message || "No result details were returned."}`;
}

type RecordingMode = "transcription" | "jarvis";

function App() {
  const [questionText, setQuestionText] = useState("");
  const questionTextRef = useRef("");

  const [image, setImage] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null);
  const [error, setError] = useState("");
  const [imageMode, setImageMode] = useState<"online" | "offline">("online");

  const [showModeMenu, setShowModeMenu] = useState(false);
  const [modes, setModes] = useState<BrightlensMode[]>(loadSavedModes);
  const [selectedModeName, setSelectedModeName] = useState("Default");
  const [showCreateMode, setShowCreateMode] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [newModePrompt, setNewModePrompt] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const imageModeRef = useRef<"online" | "offline">("online");
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const loadingRef = useRef(false);
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
  const modesRef = useRef<BrightlensMode[]>(modes);
  useEffect(() => { 
    modesRef.current = modes; 
    localStorage.setItem("brightlens_modes", JSON.stringify(modes));
  }, [modes]);

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
    loadingRef.current = false;
    setLoading(false);
  }, []);

  // ── Local audio transcription and voice command routing ────────────────────
  const runMiniJarvisCommand = useCallback(async (command: string) => {
    if (!window.electronAPI?.miniJarvisRunCommand) {
      throw new Error("Jarvis desktop actions are only available in the Electron app.");
    }

    return window.electronAPI.miniJarvisRunCommand(command);
  }, []);

  const runVoiceJarvisCommand = useCallback(async (transcript: string) => {
    const command = transcript.trim();
    if (!command) {
      setError("No speech was detected. Try Voice Jarvis again.");
      return;
    }

    if (loadingRef.current) {
      setError("Wait for the current request to finish or stop it first.");
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      setError("");
      setResponse("");
      setImage(null);
      setQuestionText("");
      autoScrollRef.current = true;

      const result = await runMiniJarvisCommand(command);
      setResponse(
        `**You:** ${command}\n\n${formatMiniJarvisResult(result)}`,
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Voice Jarvis command failed",
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [runMiniJarvisCommand]);

  const transcribeAudioBlob = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size === 0) {
      setSpeechLoading(false);
      return "";
    }

    try {
      setSpeechLoading(true);
      setError("");
      const formData = new FormData();
      formData.append("audio", audioBlob, "speech.webm");
      const res = await axios.post(`${API_BASE_URL}/speech`, formData);
      return String(res.data?.text || "").trim();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error || err.response?.data?.message
        : err instanceof Error ? err.message : undefined;
      setError(msg || "Speech transcription failed");
      return "";
    } finally {
      setSpeechLoading(false);
    }
  }, []);

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(async (mode: RecordingMode) => {
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
        recorderRef.current = null;
        isRecordingRef.current = false;
        setIsRecording(false);
        setRecordingMode(null);

        if (totalSize < 1024 || durationMs < 250) {
          audioChunksRef.current = [];
          if (mode === "jarvis") {
            setError("Voice Jarvis recording was too short. Try again.");
          }
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];
        const transcript = await transcribeAudioBlob(blob);
        if (!transcript) {
          if (mode === "jarvis") {
            setError("No speech was detected. Try Voice Jarvis again.");
          }
          return;
        }

        if (mode === "jarvis") {
          await runVoiceJarvisCommand(transcript);
        } else {
          setQuestionText(prev => (
            prev.trim() ? `${prev.trim()} ${transcript}` : transcript
          ));
        }
      };
      recorder.start(200);
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingMode(mode);
    } catch (err: unknown) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setRecordingMode(null);
      setError(err instanceof Error ? err.message : "Unable to start recording");
    }
  }, [runVoiceJarvisCommand, transcribeAudioBlob]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") { recorder.requestData(); recorder.stop(); }
    isRecordingRef.current = false;
    setIsRecording(false);
  }, []);

  // ── Text-only Ask ──────────────────────────────────────────────────────────
  const handleAskText = async () => {
    if (loadingRef.current) return;

    const q = questionTextRef.current.trim();
    if (!q) { setError("Please type or record a question first."); return; }
    let controller: AbortController | null = null;
    try {
      loadingRef.current = true;
      setLoading(true);
      setError("");
      setResponse("");
      setImage(null);
      setQuestionText(""); // Clear input area
      autoScrollRef.current = true; // reset to true on new request

      const legacyJarvisRequest = /^\/jarvis(?:\s|$)/i.test(q);
      const command = legacyJarvisRequest
        ? q.replace(/^\/jarvis\b/i, "").trim()
        : q;

      if (legacyJarvisRequest && !command) {
        throw new Error("Tell Jarvis what you want to do.");
      }

      if (window.electronAPI?.miniJarvisRunCommand) {
        const result = await runMiniJarvisCommand(command);
        if (result.handled || legacyJarvisRequest) {
          setResponse(formatMiniJarvisResult(result));
          return;
        }
      }

      const currentMode = modesRef.current.find(m => m.name === selectedModeNameRef.current);
      
      controller = new AbortController();
      abortControllerRef.current = controller;

      await streamAnalyze(
        { prompt: q, mode: imageModeRef.current, systemPrompt: currentMode?.systemPrompt },
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
      if (!controller || abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };

  // ── Audio file upload ──────────────────────────────────────────────────────
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const transcript = await transcribeAudioBlob(file);
    if (transcript) {
      setQuestionText(prev => (
        prev.trim() ? `${prev.trim()} ${transcript}` : transcript
      ));
    }
    e.target.value = "";
  };

  // ── Electron screen capture ────────────────────────────────────────────────
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.onScreenCapture) {
      console.log("⚠️ Running in browser (Electron not available)");
      return;
    }

    const unsubscribeScreenCapture = electronAPI.onScreenCapture(async (
      _event: unknown,
      source: { id: string },
    ) => {
      if (loadingRef.current) {
        setError("Wait for the current request to finish or stop it first.");
        electronAPI.captureDone?.();
        return;
      }

      let controller: AbortController | null = null;
      try {
        loadingRef.current = true;
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
          
        setQuestionText(""); // Clear input area

        const currentMode = modesRef.current.find(m => m.name === selectedModeNameRef.current);
        autoScrollRef.current = true; // reset to true on new request

        controller = new AbortController();
        abortControllerRef.current = controller;

        await streamAnalyze(
          { image: base64, prompt, mode: imageModeRef.current, systemPrompt: currentMode?.systemPrompt },
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
        if (!controller || abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          loadingRef.current = false;
          setLoading(false);
        }
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
        void startRecording("transcription");
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
      unsubscribeScreenCapture?.();
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
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", height: "100vh", overflow: "hidden", backgroundColor: "transparent", boxSizing: "border-box", fontFamily: "system-ui, sans-serif" }}>
      
      {/* GLOBAL CONTROL PILL */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderRadius: "50px", 
        backgroundColor: "rgba(30, 30, 35, 0.75)", backdropFilter: "blur(24px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.1)",
        WebkitAppRegion: "drag", // Makes it draggable
        position: "relative", zIndex: 50
      } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", WebkitAppRegion: "no-drag" } as React.CSSProperties}>
           {/* Application icon (minimal) */}
           <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "linear-gradient(135deg, #7c3aed, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "bold", color: "#fff", boxShadow: "0 2px 10px rgba(124, 58, 237, 0.4)" }}>B</div>
           
           {/* Recording Action Button */}
           <button
             type="button"
             onMouseDown={() => void startRecording("transcription")}
             onMouseUp={stopRecording}
             onMouseLeave={() => {
               if (recordingMode === "transcription") stopRecording();
             }}
             onTouchStart={() => void startRecording("transcription")}
             onTouchEnd={stopRecording}
             disabled={
               speechLoading
               || loading
               || (isRecording && recordingMode !== "transcription")
             }
             style={{
               display: "flex", alignItems: "center", gap: "8px",
               padding: "6px 14px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)",
               backgroundColor: recordingMode === "transcription" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
               color: recordingMode === "transcription" ? "#fca5a5" : "#eee", fontSize: "13px", fontWeight: 500,
               cursor: speechLoading || loading ? "not-allowed" : "pointer",
               opacity: speechLoading || loading ? 0.55 : 1, transition: "all 0.2s"
             }}
           >
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: recordingMode === "transcription" ? "#ef4444" : "#10b981", boxShadow: recordingMode === "transcription" ? "0 0 10px #ef4444" : "0 0 10px #10b981", animation: recordingMode === "transcription" ? "blink 1.5s infinite" : "none" }} />
              {recordingMode === "transcription" ? "Stop Recording" : "Start Listening"}
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
        borderRadius: "24px", backgroundColor: "rgba(30, 30, 35, 0.65)",
        backdropFilter: "blur(30px)", border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)", overflow: "hidden",
        WebkitAppRegion: "no-drag"
      } as React.CSSProperties}>

        {/* Sleek Vision Segmented Control */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
           <div style={{ display: "flex", backgroundColor: "rgba(0,0,0,0.4)", borderRadius: "14px", padding: "4px", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)" }}>
             <button onClick={() => setImageMode("online")} style={{
               padding: "6px 16px", borderRadius: "10px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer",
               backgroundColor: imageMode === "online" ? "rgba(255,255,255,0.15)" : "transparent",
               color: imageMode === "online" ? "#fff" : "#777", transition: "all 0.2s",
               boxShadow: imageMode === "online" ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
             }}>online</button>
             <button onClick={() => setImageMode("offline")} style={{
               padding: "6px 16px", borderRadius: "10px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer",
               backgroundColor: imageMode === "offline" ? "rgba(255,255,255,0.15)" : "transparent",
               color: imageMode === "offline" ? "#fff" : "#777", transition: "all 0.2s",
               boxShadow: imageMode === "offline" ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
             }}>offline</button>
           </div>
        </div>

        {/* Dynamic Context Visualizer */}
        {(loading || speechLoading) && !response && (
          <div style={{ 
            padding: "20px", borderRadius: "16px", backgroundColor: "rgba(0,0,0,0.3)", 
            border: "1px dashed rgba(255,255,255,0.15)", display: "flex", flexDirection: "column", 
            alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "20px" 
          }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: "3px solid rgba(124, 58, 237, 0.3)", borderTopColor: "#7c3aed", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: "13px", color: "#a78bfa", fontWeight: 500 }}>
              {speechLoading ? "Listening & Transcribing..." : image ? "Analyzing Visual Context..." : "Processing Command..."}
            </span>
          </div>
        )}

        {/* Screenshot preview if provided */}
        {image && !loading && (
          <div style={{ marginBottom: "20px", position: "relative", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
            <img src={image} alt="Captured context" style={{ width: "100%", display: "block" }} />
            <div style={{ position: "absolute", bottom: "8px", right: "8px", padding: "4px 8px", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: "6px", fontSize: "11px", color: "#ddd" }}>Visual Context Attached</div>
          </div>
        )}

        {/* Chat / Response Area */}
        {response && (
          <div style={{
            padding: "16px 20px", borderRadius: "16px", fontSize: "14px",
            backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            lineHeight: "1.6", textAlign: "left", flex: 1, overflowY: "auto", marginBottom: "20px",
            boxShadow: "inset 0 2px 10px rgba(0,0,0,0.2)"
          }}>
            <ReactMarkdown
              components={{
                p: (props) => <p style={{margin: "0 0 1em 0", color: "#e2e8f0"}} {...withoutMarkdownNode(props)} />,
                pre: (props) => <pre style={{backgroundColor: "rgba(0,0,0,0.4)", padding: "16px", borderRadius: "10px", overflowX: "auto", margin: "1em 0", border: "1px solid rgba(255,255,255,0.1)"}} {...withoutMarkdownNode(props)} />,
                code: (componentProps) => {
                  const {
                    inline,
                    className,
                    ...props
                  } = withoutMarkdownNode(componentProps) as ComponentPropsWithoutRef<"code"> & {
                    inline?: boolean;
                  };
                  return <code style={{backgroundColor: inline ? "rgba(255,255,255,0.1)" : "transparent", padding: inline ? "2px 6px" : 0, borderRadius: "6px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.9em"}} className={className} {...props} />;
                },
                ul: (props) => <ul style={{listStyleType: "disc", paddingLeft: "24px", marginBottom: "1em", color: "#cbd5e1"}} {...withoutMarkdownNode(props)} />,
                ol: (props) => <ol style={{listStyleType: "decimal", paddingLeft: "24px", marginBottom: "1em", color: "#cbd5e1"}} {...withoutMarkdownNode(props)} />,
                li: (props) => <li style={{marginBottom: "0.4em"}} {...withoutMarkdownNode(props)} />,
                h1: (props) => <h1 style={{fontSize: "1.4em", fontWeight: 600, margin: "1.2em 0 0.6em", color: "#fff"}} {...withoutMarkdownNode(props)} />,
                h2: (props) => <h2 style={{fontSize: "1.2em", fontWeight: 600, margin: "1.2em 0 0.6em", color: "#f8fafc"}} {...withoutMarkdownNode(props)} />,
                h3: (props) => <h3 style={{fontSize: "1.1em", fontWeight: 600, margin: "1.2em 0 0.6em", color: "#f1f5f9"}} {...withoutMarkdownNode(props)} />,
                a: (props) => <a target="_blank" rel="noopener noreferrer" style={{color: "#8b5cf6", textDecoration: "none", fontWeight: 500}} {...withoutMarkdownNode(props)} />
              }}
            >
              {response + (loading ? " ▌" : "")}
            </ReactMarkdown>
            <div ref={bottomRef} style={{ height: "1px" }} />
          </div>
        )}

        {/* Spacer if empty to push input to bottom */}
        {!response && !loading && <div style={{ flex: 1 }} />}

        {/* Input Area */}
        <div style={{
          borderRadius: "16px", border: "1px solid rgba(255,255,255,0.1)",
          backgroundColor: "rgba(0,0,0,0.3)", overflow: "visible", position: "relative",
          boxShadow: "inset 0 4px 10px rgba(0,0,0,0.1)"
        }}>
          <textarea
            id="question-input"
            value={questionText}
            onChange={e => setQuestionText(e.target.value)}
            onKeyDown={e => {
              if (!e.shiftKey && e.key === "Enter") { e.preventDefault(); handleAskText(); }
            }}
            placeholder="Ask about your screen..."
            disabled={speechLoading || loading}
            rows={2}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              color: "white",
              fontSize: "14px", padding: "16px 16px 44px 16px", resize: "none",
              boxSizing: "border-box", fontFamily: "inherit", lineHeight: "1.5"
            }}
          />
          {/* Action Row Inside Input */}
          <div style={{
            position: "absolute", bottom: "8px", left: "12px", right: "8px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px"
          }}>
            <div style={{
              display: "flex", gap: "clamp(2px, 0.75vw, 6px)",
              alignItems: "center", minWidth: 0
            }}>
              <button
                 disabled={loading}
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
                   padding: "6px clamp(6px, 1.4vw, 10px)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)",
                   backgroundColor: "rgba(255,255,255,0.08)", color: "#ccc", fontSize: "12px", fontWeight: 500,
                   cursor: loading ? "not-allowed" : "pointer",
                   opacity: loading ? 0.5 : 1,
                   transition: "all 0.2s"
                 }}
                 onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"}
                 onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"}
              >
                <span style={{ fontSize: "14px" }}>⛶</span> Use Screen
              </button>

              <button
                 style={{
                   display: "flex", alignItems: "center", gap: "4px",
                   padding: "6px clamp(6px, 1.4vw, 10px)", borderRadius: "8px", border: "none",
                   backgroundColor: "rgba(234, 88, 12, 0.15)", color: "#fb923c", fontSize: "12px", fontWeight: 500,
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
                     padding: "6px clamp(6px, 1.4vw, 10px)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)",
                     backgroundColor: showModeMenu ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                     color: "#ccc", fontSize: "12px", cursor: "pointer", transition: "all 0.2s"
                   }}
                   onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"}
                   onMouseLeave={(e) => e.currentTarget.style.backgroundColor = showModeMenu ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)"}
                >
                  {selectedModeName} <span style={{fontSize: "10px", opacity: 0.7}}>﹀</span>
                </button>

                {showModeMenu && (
                  <div style={{
                    position: "absolute", bottom: "100%", left: 0, marginBottom: "8px",
                    backgroundColor: "rgba(30, 30, 35, 0.95)", backdropFilter: "blur(20px)",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px",
                    padding: "8px 0", minWidth: "160px", zIndex: 100,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
                  }}>
                    <div style={{ padding: "4px 12px", fontSize: "11px", color: "#888", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Your Modes
                    </div>
                    {modes.map(m => (
                      <div 
                        key={m.name}
                        onClick={() => { setSelectedModeName(m.name); setShowModeMenu(false); }}
                        style={{
                          padding: "8px 16px", fontSize: "13px", color: "#ddd", cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          backgroundColor: selectedModeName === m.name ? "rgba(255,255,255,0.06)" : "transparent"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedModeName === m.name ? "rgba(255,255,255,0.06)" : "transparent"}
                      >
                        {m.name} {selectedModeName === m.name && <span style={{color: "#7c3aed"}}>✓</span>}
                      </div>
                    ))}
                    <div style={{ height: "1px", backgroundColor: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
                    <div 
                      onClick={() => { setShowModeMenu(false); setShowCreateMode(true); }}
                      style={{
                        padding: "8px 16px", fontSize: "13px", color: "#fff", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: "6px"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      + Create Mode
                    </div>
                  </div>
                )}
              </div>

              <label title="Upload Audio" style={{
                width: "28px", height: "28px", borderRadius: "8px",
                backgroundColor: "rgba(255,255,255,0.05)", cursor: "pointer", color: "#aaa",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
              >
                📎<input type="file" accept="audio/*" onChange={handleAudioUpload} style={{ display: "none" }} />
              </label>

              {(questionText || response) && (
                <button onClick={() => { setQuestionText(""); setResponse(""); setImage(null); setError(""); }}
                  title="Clear all" style={{
                    width: "28px", height: "28px", borderRadius: "8px", border: "none",
                    cursor: "pointer", backgroundColor: "rgba(255,255,255,0.05)", color: "#aaa", fontSize: "12px",
                    transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
                >✕</button>
              )}
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "2px", borderRadius: "22px",
              backgroundColor: "rgba(255,255,255,0.04)", flexShrink: 0
            }}>
              <button
                type="button"
                aria-label={recordingMode === "jarvis" ? "Stop Voice Jarvis" : "Start Voice Jarvis"}
                aria-pressed={recordingMode === "jarvis"}
                title={recordingMode === "jarvis" ? "Stop Voice Jarvis" : "Voice Jarvis"}
                onClick={() => {
                  if (!window.electronAPI?.miniJarvisRunCommand) {
                    setError("Jarvis voice actions are only available in the Electron app.");
                    return;
                  }

                  if (recordingMode === "jarvis") {
                    stopRecording();
                  } else if (!isRecording) {
                    void startRecording("jarvis");
                  }
                }}
                disabled={
                  speechLoading
                  || loading
                  || (isRecording && recordingMode !== "jarvis")
                }
                style={{
                  width: "34px", height: "34px", borderRadius: "50%",
                  border: "none", display: "flex", alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: recordingMode === "jarvis"
                    ? "rgba(239,68,68,0.18)"
                    : "transparent",
                  color: recordingMode === "jarvis" ? "#fb7185" : "#9ca3af",
                  cursor: speechLoading || loading ? "not-allowed" : "pointer",
                  opacity: speechLoading || loading ? 0.45 : 1,
                  transition: "all 0.2s",
                  boxShadow: recordingMode === "jarvis"
                    ? "0 0 0 1px rgba(251,113,133,0.25), 0 0 14px rgba(239,68,68,0.18)"
                    : "none",
                }}
              >
                {recordingMode === "jarvis" ? (
                  <span style={{
                    width: "9px", height: "9px", borderRadius: "2px",
                    backgroundColor: "currentColor"
                  }} />
                ) : (
                  <svg
                    aria-hidden="true"
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0" />
                    <path d="M12 17v5" />
                    <path d="M8 22h8" />
                  </svg>
                )}
              </button>

              {loading ? (
                <button
                  onClick={stopGeneration}
                  title="Stop Generation"
                  style={{
                    width: "36px", height: "36px", borderRadius: "50%", border: "none",
                    cursor: "pointer", backgroundColor: "#fff", color: "#171717",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s", boxShadow: "0 2px 10px rgba(0,0,0,0.25)"
                  }}
                >
                  <span style={{
                    width: "10px", height: "10px", borderRadius: "2px",
                    backgroundColor: "currentColor"
                  }} />
                </button>
              ) : (
                <button
                  onClick={handleAskText}
                  disabled={!questionText.trim()}
                  title="Send (Enter)"
                  style={{
                    width: "36px", height: "36px", borderRadius: "50%", border: "none",
                    cursor: !questionText.trim() ? "not-allowed" : "pointer",
                    backgroundColor: !questionText.trim() ? "rgba(255,255,255,0.08)" : "#fff",
                    color: !questionText.trim() ? "#5f6368" : "#171717",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s",
                    boxShadow: !questionText.trim() ? "none" : "0 2px 12px rgba(0,0,0,0.28)",
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 19V5" />
                    <path d="m5 12 7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        <span style={{
          marginTop: "8px", paddingLeft: "4px", color: "#777",
          fontSize: "11px", textAlign: "left"
        }}>
          Try: Open Chrome, take a screenshot, or search YouTube for local AI
        </span>

        {/* Errors */}
        {error && (
          <div style={{
            marginTop: "12px", padding: "10px 14px", borderRadius: "8px", 
            backgroundColor: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#fca5a5", fontSize: "13px"
          }}>{error}</div>
        )}

      </div>



      {/* Create Mode Modal */}
      {showCreateMode && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.6)", zIndex: 100, backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", WebkitAppRegion: "no-drag"
        } as React.CSSProperties}>
          <div style={{
            backgroundColor: "rgba(30, 30, 35, 0.95)", borderRadius: "16px", padding: "24px", 
            width: "90%", maxWidth: "400px", border: "1px solid rgba(255,255,255,0.1)", color: "white",
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)"
          }}>
            <h2 style={{ fontSize: "18px", marginBottom: "20px", marginTop: 0, fontWeight: 600 }}>Create Mode</h2>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#aaa", marginBottom: "6px" }}>Name</label>
              <input 
                type="text" 
                value={newModeName} 
                onChange={(e) => setNewModeName(e.target.value)} 
                placeholder="e.g. Code Reviewer"
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "rgba(0,0,0,0.3)", color: "white", boxSizing: "border-box", outline: "none"
                }}
              />
            </div>
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#aaa", marginBottom: "6px" }}>System Prompt (Markdown supported)</label>
              <textarea 
                value={newModePrompt} 
                onChange={(e) => setNewModePrompt(e.target.value)} 
                placeholder="You are an expert code reviewer..."
                rows={4}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "rgba(0,0,0,0.3)", color: "white", boxSizing: "border-box", resize: "vertical", fontFamily: "monospace", outline: "none"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button 
                onClick={() => { setShowCreateMode(false); setNewModeName(""); setNewModePrompt(""); }}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: "rgba(255,255,255,0.1)", color: "white", cursor: "pointer", fontSize: "13px", fontWeight: 500 }}
              >Cancel</button>
              <button 
                onClick={() => {
                  const modeName = newModeName.trim();
                  if (modeName) {
                    if (
                      modesRef.current.some(
                        (mode) => mode.name.toLowerCase() === modeName.toLowerCase(),
                      )
                    ) {
                      setError(`A mode named "${modeName}" already exists.`);
                      return;
                    }

                    setModes(prev => [
                      ...prev,
                      {
                        name: modeName,
                        systemPrompt: newModePrompt.trim() || null,
                      },
                    ]);
                    setSelectedModeName(modeName);
                    setShowCreateMode(false);
                    setNewModeName("");
                    setNewModePrompt("");
                  }
                }}
                disabled={!newModeName.trim()}
                style={{ 
                  padding: "8px 16px", borderRadius: "8px", border: "none", 
                  backgroundColor: newModeName.trim() ? "#7c3aed" : "rgba(255,255,255,0.05)", 
                  color: newModeName.trim() ? "white" : "#777", cursor: newModeName.trim() ? "pointer" : "not-allowed",
                  transition: "all 0.2s", fontSize: "13px", fontWeight: 500
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}

export default App;
