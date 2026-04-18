import { useEffect, useRef, useState } from "react";
import axios from "axios";

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [speechText, setSpeechText] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechTextRef = useRef("");

  const buildAnalyzePrompt = (spokenQuestion: string) => {
    const trimmedQuestion = spokenQuestion.trim();

    if (!trimmedQuestion) {
      return "Explain this in simple steps";
    }

    return `Answer the user's spoken question using the screenshot as context. Spoken question: ${trimmedQuestion}`;
  };

  const transcribeAudioBlob = async (audioBlob: Blob) => {
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
  };

  useEffect(() => {
    speechTextRef.current = speechText;
  }, [speechText]);

  const startRecording = async () => {
    try {
      setError("");
      setSpeechText("");
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        await transcribeAudioBlob(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: unknown) {
      console.error("Recording start error:", err);
      const fallbackMessage = err instanceof Error ? err.message : undefined;
      setError(fallbackMessage || "Unable to start recording");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    setIsRecording(false);
  };

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

        // 🔥 Send to backend
        const res = await axios.post("http://localhost:5000/analyze", {
          image: base64,
          prompt: buildAnalyzePrompt(speechTextRef.current)
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
          || (status === 401 ? "Gemini API key is missing or invalid." : "")
          || (status === 402 ? "Gemini billing or quota issue." : "")
          || (status === 429 ? "Gemini rate limit reached. Try again shortly." : "")
          || (status === 500 ? "Server error while analyzing the capture." : "")
          || (status === 503 ? "Gemini service is unavailable." : "")
          || (!status ? "Backend not reachable. Start with: npm run server" : "")
          || fallbackMessage
          || "Failed to capture or analyze image"
        );
      } finally {
        setLoading(false);
      }
    });

    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
    };
  }, []);

  return (
    <div style={{ padding: "20px", color: "white", minHeight: "100vh", backgroundColor: "#1a1a2e" }}>
      <h1 style={{ marginBottom: "10px" }}>brightlens AI</h1>
      <p style={{ color: "#888", marginBottom: "20px" }}>Press Ctrl+Shift+S to capture screen</p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <button
          onClick={startRecording}
          disabled={isRecording || speechLoading}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "none", cursor: "pointer" }}
        >
          Start Recording
        </button>
        <button
          onClick={stopRecording}
          disabled={!isRecording}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "none", cursor: "pointer" }}
        >
          Stop Recording
        </button>
        <label style={{ padding: "8px 12px", borderRadius: "8px", background: "#30344f", cursor: "pointer" }}>
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