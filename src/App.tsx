import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [speechText, setSpeechText] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const [imageMode, setImageMode] = useState<"online" | "offline">("online"); // online = Gemini, offline = llava

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechTextRef = useRef("");
  const imageModeRef = useRef<"online" | "offline">("online");
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);
  const hotkeyActiveRef = useRef(false);
  const recordingStartRef = useRef<number>(0);

  const buildAnalyzePrompt = (spokenQuestion: string) => {
    const trimmedQuestion = spokenQuestion.trim();

    if (!trimmedQuestion) {
      return "Explain this in simple steps";
    }

    return `Answer the user's spoken question using the screenshot as context. Spoken question: ${trimmedQuestion}`;
  };

  const transcribeAudioBlob = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size === 0) {
      console.log("Empty audio blob, skipping transcription");
      setSpeechText("");
      setSpeechLoading(false);
      return;
    }

    try {
      setSpeechLoading(true);
      setError("");
      setSpeechText("");

      const formData = new FormData();
      formData.append("audio", audioBlob, "speech.webm");

      const res = await axios.post("http://localhost:5000/speech", formData);
      setSpeechText(res.data?.text || "");
    } catch (err: unknown) {
      console.error("Speech error:", err);
      const backendMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.response?.data?.message
        : undefined;
      const fallbackMessage = err instanceof Error ? err.message : undefined;

      setError(
        backendMessage
        || fallbackMessage
        || "Speech transcription failed"
      );
    } finally {
      setSpeechLoading(false);
    }
  }, [setError, setSpeechText, setSpeechLoading]);

  useEffect(() => {
    speechTextRef.current = speechText;
  }, [speechText]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Keep ref in sync so the Electron capture closure always reads the latest mode
  useEffect(() => {
    imageModeRef.current = imageMode;
  }, [imageMode]);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) {
      return;
    }

    try {
      setError("");
      setSpeechText("");
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingStartRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const activeStream = streamRef.current;
        const durationMs = Date.now() - recordingStartRef.current;

        // Guard: ignore recordings with no/small data (incomplete WebM)
        const totalSize = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
        if (totalSize < 1024 || durationMs < 250) {
          console.log("Audio recording too short or empty, ignoring");
          audioChunksRef.current = [];
          if (activeStream) {
            activeStream.getTracks().forEach((track) => track.stop());
          }
          streamRef.current = null;
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];
        if (activeStream) {
          activeStream.getTracks().forEach((track) => track.stop());
        }
        streamRef.current = null;
        await transcribeAudioBlob(audioBlob);
      };

      recorder.start(200);
      setIsRecording(true);
    } catch (err: unknown) {
      console.error("Recording start error:", err);
      const fallbackMessage = err instanceof Error ? err.message : undefined;
      setError(fallbackMessage || "Unable to start recording");
    }
  }, [setError, setSpeechText, transcribeAudioBlob]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    if (recorder.state !== "inactive") {
      // Request a final chunk before stopping to avoid truncated blobs.
      recorder.requestData();
      recorder.stop();
    }

    setIsRecording(false);
  }, [setIsRecording]);

  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await transcribeAudioBlob(file);
    event.target.value = "";
  };

  useEffect(() => {
    const electronAPI = window.electronAPI;

    if (!electronAPI || !electronAPI.onScreenCapture) {
      console.log("⚠️ Running in browser (Electron not available)");
      return;
    }

    electronAPI.onScreenCapture(async (_event, source) => {
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

        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(bitmap, 0, 0);

        const base64 = canvas.toDataURL("image/png");
        setImage(base64);

        // Guard: require both image and audio before analyzing
        if (!speechTextRef.current.trim()) {
          setError("Please record audio first before capturing the screen.");
          setLoading(false);
          electronAPI.captureDone?.();
          return;
        }

        const res = await axios.post("http://localhost:5000/analyze", {
          image: base64,
          prompt: buildAnalyzePrompt(speechTextRef.current),
          mode: imageModeRef.current   // ← use ref, not stale state
        });

        setResponse(res.data.result);
      } catch (err: unknown) {
        console.error("Capture error:", err);
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const backendMessage = axios.isAxiosError(err)
          ? err.response?.data?.error || err.response?.data?.message
          : undefined;
        const fallbackMessage = err instanceof Error ? err.message : undefined;

        setError(
          backendMessage
          || (status === 400 ? "Invalid request payload." : "")
          || (status === 401 ? "API key is missing or invalid." : "")
          || (status === 402 ? "API billing or quota issue." : "")
          || (status === 429 ? "Rate limit reached. Try again shortly." : "")
          || (status === 500 ? "Server error while analyzing the capture." : "")
          || (status === 503 ? "AI service unavailable. Make sure Ollama is running (ollama serve)." : "")
          || (status === 504 ? "AI model timed out. Try again in a moment." : "")
          || (!status ? "Backend not reachable. Start with: npm run server" : "")
          || fallbackMessage
          || "Failed to capture or analyze image"
        );
      } finally {
        setLoading(false);
        electronAPI.captureDone?.();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) {
        return;
      }

      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
        || target.tagName === 'SELECT';

      if (isInputFocused) {
        return;
      }

      const isComboPressed = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (isComboPressed && !hotkeyActiveRef.current && !isRecordingRef.current) {
        hotkeyActiveRef.current = true;
        startRecording();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const comboStillPressed = e.shiftKey && !e.ctrlKey;
      if (!comboStillPressed && hotkeyActiveRef.current) {
        hotkeyActiveRef.current = false;
        if (isRecordingRef.current) {
          stopRecording();
        }
      }
    };

    const stopIfHotkeyInterrupted = () => {
      if (hotkeyActiveRef.current) {
        hotkeyActiveRef.current = false;
      }

      if (isRecordingRef.current) {
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", stopIfHotkeyInterrupted);
    document.addEventListener("visibilitychange", stopIfHotkeyInterrupted);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", stopIfHotkeyInterrupted);
      document.removeEventListener("visibilitychange", stopIfHotkeyInterrupted);

      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }

      const activeStream = streamRef.current;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [startRecording, stopRecording]);

  return (
    <div style={{ padding: "20px", color: "white", minHeight: "100vh", backgroundColor: "#1a1a2e" }}>
      <h1 style={{ marginBottom: "10px" }}>brightlens AI</h1>
      <p style={{ color: "#888", marginBottom: "20px" }}>Press Ctrl+Shift+S to capture screen</p>

      {/* Vision Model Toggle */}
      <div style={{
        marginBottom: "16px",
        padding: "12px 16px",
        borderRadius: "10px",
        backgroundColor: "rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        flexWrap: "wrap"
      }}>
        <span style={{ fontSize: "13px", color: "#aaa", fontWeight: 500 }}>📷 Image Vision:</span>

        <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid #444" }}>
          <button
            onClick={() => setImageMode("online")}
            style={{
              padding: "6px 16px",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              backgroundColor: imageMode === "online" ? "#7c3aed" : "#1e1e35",
              color: imageMode === "online" ? "#fff" : "#888",
              transition: "all 0.2s"
            }}
          >
            🌐 Online (Gemini)
          </button>
          <button
            onClick={() => setImageMode("offline")}
            style={{
              padding: "6px 16px",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              borderLeft: "1px solid #444",
              cursor: "pointer",
              backgroundColor: imageMode === "offline" ? "#059669" : "#1e1e35",
              color: imageMode === "offline" ? "#fff" : "#888",
              transition: "all 0.2s"
            }}
          >
            🦙 Offline (llava)
          </button>
        </div>

        <span style={{
          fontSize: "11px",
          color: imageMode === "offline" ? "#6ee7b7" : "#c4b5fd",
          fontStyle: "italic"
        }}>
          {imageMode === "offline"
            ? "Running locally — no internet needed"
            : "Using Google Gemini API"}
        </span>
      </div>

      <div style={{ marginBottom: "20px", padding: "12px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.05)" }}>
        <p style={{ margin: 0, fontWeight: "500" }}>🎤 Push-to-Talk: Hold <kbd style={{ 
          padding: "2px 6px", 
          borderRadius: "4px", 
          background: "#30344f", 
          border: "1px solid #444",
          fontSize: "12px",
          marginLeft: "4px",
          marginRight: "4px"
        }}>Shift</kbd> to record</p>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <button
          onClick={startRecording}
          disabled={isRecording || speechLoading}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "none", cursor: isRecording || speechLoading ? "not-allowed" : "pointer" }}
        >
          Start Recording (manual)
        </button>
        <button
          onClick={stopRecording}
          disabled={!isRecording}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "none", cursor: !isRecording ? "not-allowed" : "pointer" }}
        >
          Stop Recording (manual)
        </button>
        <label style={{ 
          padding: "8px 12px", 
          borderRadius: "8px", 
          background: "#30344f", 
          cursor: "pointer" 
        }}>
          Upload Audio
          <input
            type="file"
            accept="audio/*"
            onChange={handleAudioUpload}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {loading && <p style={{ color: "#aa3bff" }}>Analyzing...</p>}
      {speechLoading && <p style={{ color: "#7dd3fc" }}>Transcribing audio...</p>}
      {isRecording && <p style={{ color: "#f97316" }}>Recording...</p>}
      {error && <p style={{ color: "#ff4444" }}>{error}</p>}
      {image && <img src={image} width={300} style={{ borderRadius: "8px", marginBottom: "20px" }} />}
      {speechText && (
        <div style={{
          textAlign: "left",
          maxWidth: "500px",
          margin: "0 auto 16px",
          padding: "15px",
          backgroundColor: "rgba(125,211,252,0.15)",
          borderRadius: "8px"
        }}>
          <h3 style={{ marginTop: 0 }}>Speech Transcript</h3>
          <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{speechText}</p>
        </div>
      )}
      {response && (
        <div style={{
          textAlign: "left",
          maxWidth: "500px",
          margin: "0 auto",
          padding: "15px",
          backgroundColor: "rgba(255,255,255,0.1)",
          borderRadius: "8px"
        }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{response}</p>
        </div>
      )}
    </div>
  );
}

export default App;