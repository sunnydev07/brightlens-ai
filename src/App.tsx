import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";

// ── Streaming helper (module-level, no React deps) ────────────────────────────
async function streamAnalyze(
  payload: { image?: string | null; prompt: string; mode: string },
  onToken: (t: string) => void
): Promise<void> {
  const res = await fetch("http://localhost:5000/analyze-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
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

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const imageModeRef = useRef<"online" | "offline">("online");
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const hotkeyActiveRef = useRef(false);
  const recordingStartRef = useRef<number>(0);

  // Keep refs in sync so Electron closure always has latest values
  useEffect(() => { questionTextRef.current = questionText; }, [questionText]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { imageModeRef.current = imageMode; }, [imageMode]);

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
      await streamAnalyze(
        { prompt: q, mode: imageModeRef.current },
        (token) => setResponse(prev => prev + token)
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to get answer");
    } finally {
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

        await streamAnalyze(
          { image: base64, prompt, mode: imageModeRef.current },
          (token) => setResponse(prev => prev + token)
        );
      } catch (err: unknown) {
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
          padding: "8px 12px", borderTop: "1px solid #1e1e35", gap: "8px"
        }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Mic button */}
            <button
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={startRecording} onTouchEnd={stopRecording}
              disabled={speechLoading}
              title="Hold to record"
              style={{
                width: "34px", height: "34px", borderRadius: "50%", border: "none",
                cursor: speechLoading ? "not-allowed" : "pointer",
                backgroundColor: isRecording ? "#ef4444" : "#2a2a45",
                color: "white", fontSize: "15px", display: "flex",
                alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                boxShadow: isRecording ? "0 0 0 3px rgba(239,68,68,0.3)" : "none"
              }}
            >{isRecording ? "⏹" : "🎤"}</button>

            {/* Upload audio */}
            <label title="Upload audio file" style={{
              width: "34px", height: "34px", borderRadius: "50%",
              backgroundColor: "#2a2a45", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px"
            }}>
              📎<input type="file" accept="audio/*" onChange={handleAudioUpload} style={{ display: "none" }} />
            </label>

            {/* Clear */}
            {(questionText || response) && (
              <button onClick={() => { setQuestionText(""); setResponse(""); setImage(null); setError(""); }}
                title="Clear all" style={{
                  width: "34px", height: "34px", borderRadius: "50%", border: "none",
                  cursor: "pointer", backgroundColor: "#2a2a45", color: "#888", fontSize: "14px"
                }}>✕</button>
            )}

            <span style={{ fontSize: "11px", color: "#444" }}>
              {isRecording ? "🔴 Recording…" : speechLoading ? "⏳ Transcribing…" : "Hold Shift / click 🎤"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={handleAskText}
              disabled={loading || !questionText.trim()}
              title="Ask without screenshot (Ctrl+Enter)"
              style={{
                padding: "7px 16px", borderRadius: "8px", border: "none",
                cursor: loading || !questionText.trim() ? "not-allowed" : "pointer",
                backgroundColor: loading || !questionText.trim() ? "#2a2a45" : "#7c3aed",
                color: loading || !questionText.trim() ? "#555" : "white",
                fontSize: "13px", fontWeight: 600, transition: "all 0.2s"
              }}
            >{loading && !image ? "⏳" : "Ask ↵"}</button>
            <span style={{ fontSize: "11px", color: "#444" }}>or Ctrl+Shift+S</span>
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
          lineHeight: "1.7", whiteSpace: "pre-wrap"
        }}>
          {response}
          {/* Blinking cursor while streaming */}
          {loading && (
            <span style={{
              display: "inline-block", width: "2px", height: "1em",
              backgroundColor: "#a78bfa", marginLeft: "2px",
              animation: "blink 1s step-end infinite", verticalAlign: "text-bottom"
            }} />
          )}
        </div>
      )}

      {/* Cursor blink animation */}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}

export default App;