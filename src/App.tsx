import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";

// ── Streaming helper (module-level, no React deps) ────────────────────────────
async function streamAnalyze(
  payload: { image?: string | null; prompt: string; mode: string; systemPrompt?: string | null },
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
  const [loading, setLoading] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const [imageMode, setImageMode] = useState<"online" | "offline">("online");

  const [showModeMenu, setShowModeMenu] = useState(false);
  const [modes, setModes] = useState<{name: string, systemPrompt: string | null}[]>(() => {
    const saved = localStorage.getItem("brightlens_modes");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [{ name: "Default", systemPrompt: null }];
  });
  const [selectedModeName, setSelectedModeName] = useState("Default");
  const [showCreateMode, setShowCreateMode] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [newModePrompt, setNewModePrompt] = useState("");

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

  const stopGeneration = useCallback(() => {
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
      autoScrollRef.current = true; // reset to true on new request
      const currentMode = modesRef.current.find(m => m.name === selectedModeNameRef.current);
      
      const controller = new AbortController();
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

        const currentMode = modesRef.current.find(m => m.name === selectedModeNameRef.current);
        autoScrollRef.current = true; // reset to true on new request

        const controller = new AbortController();
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
    <div style={{ padding: "20px", color: "white", minHeight: "100vh", backgroundColor: "#1a1a2e", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "4px", fontSize: "22px" }}>brightlens AI</h1>
      <p style={{ color: "#555", marginBottom: "20px", fontSize: "13px" }}>Press Ctrl+Shift+S to capture screen</p>

      {/* Vision toggle */}
      <div style={{
        marginBottom: "16px", padding: "10px 14px", borderRadius: "10px",
        backgroundColor: "rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"
      }}>
        <span style={{ fontSize: "12px", color: "#888" }}>📷 Vision:</span>
        <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden", border: "1px solid #333" }}>
          <button onClick={() => setImageMode("online")} style={{
            padding: "5px 14px", fontSize: "12px", fontWeight: 600, border: "none", cursor: "pointer",
            backgroundColor: imageMode === "online" ? "#7c3aed" : "#1e1e35",
            color: imageMode === "online" ? "#fff" : "#666", transition: "all 0.2s"
          }}>🌐 Online (Gemini)</button>
          <button onClick={() => setImageMode("offline")} style={{
            padding: "5px 14px", fontSize: "12px", fontWeight: 600, border: "none",
            borderLeft: "1px solid #333", cursor: "pointer",
            backgroundColor: imageMode === "offline" ? "#059669" : "#1e1e35",
            color: imageMode === "offline" ? "#fff" : "#666", transition: "all 0.2s"
          }}>🦙 Offline (llava)</button>
        </div>
        <span style={{ fontSize: "11px", color: imageMode === "offline" ? "#6ee7b7" : "#c4b5fd", fontStyle: "italic" }}>
          {imageMode === "offline" ? "Runs locally — no internet" : "Uses Google Gemini API"}
        </span>
      </div>

      {/* Unified question input */}
      <div style={{
        marginBottom: "12px", borderRadius: "12px", border: "1px solid #2a2a45",
        backgroundColor: "rgba(255,255,255,0.04)", overflow: "hidden"
      }}>
        <textarea
          id="question-input"
          value={questionText}
          onChange={e => setQuestionText(e.target.value)}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleAskText(); }
          }}
          placeholder={
            speechLoading ? "Transcribing audio..."
            : isRecording ? "🔴 Recording... release Shift to stop"
            : "Type your question, or hold Shift / click 🎤 to record audio..."
          }
          disabled={speechLoading}
          rows={3}
          style={{
            width: "100%", background: "transparent", border: "none", outline: "none",
            color: speechLoading ? "#7dd3fc" : isRecording ? "#f97316" : "white",
            fontSize: "14px", padding: "14px 16px", resize: "none",
            boxSizing: "border-box", fontFamily: "inherit", lineHeight: "1.5"
          }}
        />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", gap: "8px", flexWrap: "wrap"
        }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            
            {/* New UI Buttons from Screenshot */}
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
                 display: "flex", alignItems: "center", gap: "6px",
                 padding: "6px 12px", borderRadius: "20px", border: "1px solid #333",
                 backgroundColor: "rgba(255,255,255,0.05)", color: "#aaa", fontSize: "13px",
                 cursor: "pointer", transition: "all 0.2s"
               }}
               onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
               onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
            >
              🖼️ Use Screen
            </button>

            <button
               style={{
                 display: "flex", alignItems: "center", gap: "6px",
                 padding: "6px 12px", borderRadius: "20px", border: "1px solid #333",
                 backgroundColor: "rgba(255,255,255,0.05)", color: "#aaa", fontSize: "13px",
                 cursor: "pointer", transition: "all 0.2s"
               }}
               onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
               onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
            >
              ⚡ Smart
            </button>

            <div style={{ position: "relative" }}>
              <button
                 onClick={() => setShowModeMenu(!showModeMenu)}
                 style={{
                   display: "flex", alignItems: "center", gap: "6px",
                   padding: "6px 12px", borderRadius: "20px", border: "none",
                   backgroundColor: showModeMenu ? "rgba(255,255,255,0.1)" : "transparent",
                   color: "#aaa", fontSize: "13px",
                   cursor: "pointer", transition: "all 0.2s"
                 }}
              >
                {selectedModeName} <span style={{fontSize: "10px", opacity: 0.7}}>﹀</span>
              </button>

              {showModeMenu && (
                <div style={{
                  position: "absolute", bottom: "100%", left: 0, marginBottom: "8px",
                  backgroundColor: "#1e1e35", border: "1px solid #333", borderRadius: "8px",
                  padding: "8px 0", minWidth: "160px", zIndex: 50,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
                }}>
                  <div style={{ padding: "4px 12px", fontSize: "11px", color: "#888", marginBottom: "4px" }}>
                    Your Modes
                  </div>
                  {modes.map(m => (
                    <div 
                      key={m.name}
                      onClick={() => { setSelectedModeName(m.name); setShowModeMenu(false); }}
                      style={{
                        padding: "6px 12px", fontSize: "13px", color: "#ddd", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        backgroundColor: selectedModeName === m.name ? "rgba(255,255,255,0.05)" : "transparent"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedModeName === m.name ? "rgba(255,255,255,0.05)" : "transparent"}
                    >
                      {m.name} {selectedModeName === m.name && <span>✓</span>}
                    </div>
                  ))}
                  <div style={{ height: "1px", backgroundColor: "#333", margin: "4px 0" }} />
                  <div 
                    onClick={() => { setShowModeMenu(false); setShowCreateMode(true); }}
                    style={{
                      padding: "6px 12px", fontSize: "13px", color: "#fff", cursor: "pointer",
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

            <div style={{ width: "1px", height: "16px", backgroundColor: "#333", margin: "0 4px" }} />

            {/* Mic button */}
            <button
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              disabled={speechLoading}
              title="Hold to record"
              style={{
                width: "32px", height: "32px", borderRadius: "50%", border: "none",
                cursor: speechLoading ? "not-allowed" : "pointer",
                backgroundColor: isRecording ? "#ef4444" : "transparent",
                color: "#aaa", fontSize: "15px", display: "flex",
                alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                boxShadow: isRecording ? "0 0 0 3px rgba(239,68,68,0.3)" : "none"
              }}
              onMouseEnter={(e) => { if(!isRecording) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={(e) => { if(!isRecording) e.currentTarget.style.backgroundColor = "transparent"; }}
            >{isRecording ? "⏹" : "🎤"}</button>

            {/* Upload audio */}
            <label title="Upload audio file" style={{
              width: "32px", height: "32px", borderRadius: "50%",
              backgroundColor: "transparent", cursor: "pointer", color: "#aaa",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              📎<input type="file" accept="audio/*" onChange={handleAudioUpload} style={{ display: "none" }} />
            </label>

            {/* Clear */}
            {(questionText || response) && (
              <button onClick={() => { setQuestionText(""); setResponse(""); setImage(null); setError(""); }}
                title="Clear all" style={{
                  width: "32px", height: "32px", borderRadius: "50%", border: "none",
                  cursor: "pointer", backgroundColor: "transparent", color: "#aaa", fontSize: "14px",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >✕</button>
            )}

            {isRecording && <span style={{ fontSize: "11px", color: "#ef4444" }}>🔴 Recording…</span>}
            {speechLoading && <span style={{ fontSize: "11px", color: "#a78bfa" }}>⏳ Transcribing…</span>}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#444", display: "none" }}>or Ctrl+Shift+S</span>
            <button
              onClick={loading ? stopGeneration : handleAskText}
              disabled={!loading && !questionText.trim()}
              title={loading ? "Stop generation" : "Ask without screenshot (Ctrl+Enter)"}
              style={{
                width: "36px", height: "36px", borderRadius: "50%", border: "none",
                cursor: !loading && !questionText.trim() ? "not-allowed" : "pointer",
                backgroundColor: !loading && !questionText.trim() ? "#1e1e35" : loading ? "#ef4444" : "#0f5fff",
                color: !loading && !questionText.trim() ? "#555" : "white",
                fontSize: "16px", display: "flex",
                alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                boxShadow: !loading && !questionText.trim() ? "none" : loading ? "0 2px 8px rgba(239,68,68,0.3)" : "0 2px 8px rgba(15,95,255,0.3)"
              }}
            >
              {loading ? "⏹" : "➤"}
            </button>
          </div>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "12px",
          backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "#fca5a5", fontSize: "13px"
        }}>{error}</div>
      )}

      {/* Loading state */}
      {loading && !response && (
        <div style={{ color: "#a78bfa", fontSize: "13px", marginBottom: "12px" }}>
          ⏳ {image ? "Analyzing screenshot…" : "Thinking…"}
        </div>
      )}

      {/* Screenshot preview */}
      {image && (
        <img src={image} alt="screenshot" style={{
          width: "100%", maxWidth: "500px", borderRadius: "10px", marginBottom: "14px", display: "block"
        }} />
      )}

      {/* Streaming response — appears token by token */}
      {response && (
        <div style={{
          padding: "16px 18px", borderRadius: "12px", fontSize: "14px",
          backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid #2a2a45",
          lineHeight: "1.7", textAlign: "left", fontFamily: "system-ui, sans-serif"
        }}>
          <ReactMarkdown
            components={{
              p: ({node, ...props}) => <p style={{margin: "0 0 1em 0"}} {...props} />,
              pre: ({node, ...props}) => <pre style={{backgroundColor: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", overflowX: "auto", margin: "1em 0"}} {...props} />,
              code: ({node, inline, className, ...props}) => <code style={{backgroundColor: inline ? "rgba(0,0,0,0.2)" : "transparent", padding: inline ? "2px 4px" : 0, borderRadius: "4px", fontFamily: "monospace"}} className={className} {...props} />,
              ul: ({node, ...props}) => <ul style={{listStyleType: "disc", paddingLeft: "20px", marginBottom: "1em"}} {...props} />,
              ol: ({node, ...props}) => <ol style={{listStyleType: "decimal", paddingLeft: "20px", marginBottom: "1em"}} {...props} />,
              li: ({node, ...props}) => <li style={{marginBottom: "0.25em"}} {...props} />,
              h1: ({node, ...props}) => <h1 style={{fontSize: "1.5em", fontWeight: "bold", margin: "1em 0 0.5em"}} {...props} />,
              h2: ({node, ...props}) => <h2 style={{fontSize: "1.3em", fontWeight: "bold", margin: "1em 0 0.5em"}} {...props} />,
              h3: ({node, ...props}) => <h3 style={{fontSize: "1.1em", fontWeight: "bold", margin: "1em 0 0.5em"}} {...props} />,
              a: ({node, ...props}) => <a style={{color: "#3b82f6", textDecoration: "underline"}} {...props} />
            }}
          >
            {response + (loading ? " ▌" : "")}
          </ReactMarkdown>
        </div>
      )}

      {/* Auto-scroll anchor */}
      <div ref={bottomRef} style={{ height: "1px" }} />

      {/* Create Mode Modal */}
      {showCreateMode && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.6)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            backgroundColor: "#1e1e35", borderRadius: "12px", padding: "20px", 
            width: "90%", maxWidth: "500px", border: "1px solid #333", color: "white",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
          }}>
            <h2 style={{ fontSize: "16px", marginBottom: "16px", marginTop: 0 }}>Create Custom Persona</h2>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#aaa", marginBottom: "4px" }}>Mode Name</label>
              <input 
                type="text" 
                value={newModeName} 
                onChange={(e) => setNewModeName(e.target.value)} 
                placeholder="e.g. Code Reviewer"
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #333",
                  backgroundColor: "rgba(0,0,0,0.2)", color: "white", boxSizing: "border-box"
                }}
              />
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "#aaa", marginBottom: "4px" }}>System Prompt (Markdown supported)</label>
              <textarea 
                value={newModePrompt} 
                onChange={(e) => setNewModePrompt(e.target.value)} 
                placeholder="You are an expert code reviewer..."
                rows={5}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #333",
                  backgroundColor: "rgba(0,0,0,0.2)", color: "white", boxSizing: "border-box", resize: "vertical", fontFamily: "monospace"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button 
                onClick={() => { setShowCreateMode(false); setNewModeName(""); setNewModePrompt(""); }}
                style={{ padding: "8px 16px", borderRadius: "6px", border: "none", backgroundColor: "#333", color: "white", cursor: "pointer" }}
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
                  padding: "8px 16px", borderRadius: "6px", border: "none", 
                  backgroundColor: newModeName.trim() ? "#0f5fff" : "#2a2a45", 
                  color: "white", cursor: newModeName.trim() ? "pointer" : "not-allowed",
                  transition: "all 0.2s"
                }}
              >Save Mode</button>
            </div>
          </div>
        </div>
      )}

      {/* Cursor blink animation */}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}

export default App;