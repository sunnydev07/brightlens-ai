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
      setQuestionText(""); // Clear input area
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
          
        setQuestionText(""); // Clear input area

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
             onMouseDown={startRecording} onMouseUp={stopRecording}
             onTouchStart={startRecording} onTouchEnd={stopRecording}
             style={{
               display: "flex", alignItems: "center", gap: "8px",
               padding: "6px 14px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)",
               backgroundColor: isRecording ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
               color: isRecording ? "#fca5a5" : "#eee", fontSize: "13px", fontWeight: 500, cursor: "pointer",
               transition: "all 0.2s"
             }}
           >
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: isRecording ? "#ef4444" : "#10b981", boxShadow: isRecording ? "0 0 10px #ef4444" : "0 0 10px #10b981", animation: isRecording ? "blink 1.5s infinite" : "none" }} />
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
             }}>🌐 Gemini (Online)</button>
             <button onClick={() => setImageMode("offline")} style={{
               padding: "6px 16px", borderRadius: "10px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer",
               backgroundColor: imageMode === "offline" ? "rgba(255,255,255,0.15)" : "transparent",
               color: imageMode === "offline" ? "#fff" : "#777", transition: "all 0.2s",
               boxShadow: imageMode === "offline" ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
             }}>🦙 LlaVA (Local)</button>
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
                p: ({node, ...props}) => <p style={{margin: "0 0 1em 0", color: "#e2e8f0"}} {...props} />,
                pre: ({node, ...props}) => <pre style={{backgroundColor: "rgba(0,0,0,0.4)", padding: "16px", borderRadius: "10px", overflowX: "auto", margin: "1em 0", border: "1px solid rgba(255,255,255,0.1)"}} {...props} />,
                code: ({node, inline, className, ...props}: any) => <code style={{backgroundColor: inline ? "rgba(255,255,255,0.1)" : "transparent", padding: inline ? "2px 6px" : 0, borderRadius: "6px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.9em"}} className={className} {...props} />,
                ul: ({node, ...props}) => <ul style={{listStyleType: "disc", paddingLeft: "24px", marginBottom: "1em", color: "#cbd5e1"}} {...props} />,
                ol: ({node, ...props}) => <ol style={{listStyleType: "decimal", paddingLeft: "24px", marginBottom: "1em", color: "#cbd5e1"}} {...props} />,
                li: ({node, ...props}) => <li style={{marginBottom: "0.4em"}} {...props} />,
                h1: ({node, ...props}) => <h1 style={{fontSize: "1.4em", fontWeight: 600, margin: "1.2em 0 0.6em", color: "#fff"}} {...props} />,
                h2: ({node, ...props}) => <h2 style={{fontSize: "1.2em", fontWeight: 600, margin: "1.2em 0 0.6em", color: "#f8fafc"}} {...props} />,
                h3: ({node, ...props}) => <h3 style={{fontSize: "1.1em", fontWeight: 600, margin: "1.2em 0 0.6em", color: "#f1f5f9"}} {...props} />,
                a: ({node, ...props}) => <a style={{color: "#8b5cf6", textDecoration: "none", fontWeight: 500}} {...props} />
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
            disabled={speechLoading}
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
                   padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)",
                   backgroundColor: "rgba(255,255,255,0.08)", color: "#ccc", fontSize: "12px", fontWeight: 500,
                   cursor: "pointer", transition: "all 0.2s"
                 }}
                 onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"}
                 onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"}
              >
                <span style={{ fontSize: "14px" }}>⛶</span> Use Screen
              </button>

              <button
                 style={{
                   display: "flex", alignItems: "center", gap: "4px",
                   padding: "6px 10px", borderRadius: "8px", border: "none",
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
                     padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)",
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

            {loading ? (
              <button
                onClick={stopGeneration}
                title="Stop Generation"
                style={{
                  width: "32px", height: "32px", borderRadius: "8px", border: "none",
                  cursor: "pointer",
                  backgroundColor: "rgba(239, 68, 68, 0.2)",
                  color: "#ef4444",
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
                  backgroundColor: !questionText.trim() ? "rgba(255,255,255,0.05)" : "#7c3aed",
                  color: !questionText.trim() ? "#555" : "white",
                  fontSize: "14px", display: "flex",
                  alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                  boxShadow: !questionText.trim() ? "none" : "0 2px 10px rgba(124, 58, 237, 0.4)",
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