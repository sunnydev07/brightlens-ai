import { useState, useEffect, useRef } from "react";
import type React from "react";
import { themeEntries } from "../theme";
import type { ThemeTokens, ThemeName } from "../types";

export interface SettingsModalProps {
  theme: ThemeTokens;
  selectedThemeName: ThemeName;
  setSelectedThemeName: (theme: ThemeName) => void;
  onlineVisionModel: "gemini" | "nvidia";
  setOnlineVisionModel: (model: "gemini" | "nvidia") => void;
  offlineTextModel: string;
  setOfflineTextModel: (model: string) => void;
  offlineVisionModel: string;
  setOfflineVisionModel: (model: string) => void;
  ocrEnabled: boolean;
  setOcrEnabled: (val: boolean) => void;
  setShowSettings: (val: boolean) => void;
  geminiKey: string;
  setGeminiKey: (val: string) => void;
  openrouterKey: string;
  setOpenrouterKey: (val: string) => void;
  nvidiaKey: string;
  setNvidiaKey: (val: string) => void;
  apiBase: string;
}

export function SettingsModal({
  theme,
  selectedThemeName,
  setSelectedThemeName,
  onlineVisionModel,
  setOnlineVisionModel,
  offlineTextModel,
  setOfflineTextModel,
  offlineVisionModel,
  setOfflineVisionModel,
  ocrEnabled,
  setOcrEnabled,
  setShowSettings,
  geminiKey,
  setGeminiKey,
  openrouterKey,
  setOpenrouterKey,
  nvidiaKey,
  setNvidiaKey,
  apiBase
}: SettingsModalProps) {
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenRouter, setShowOpenRouter] = useState(false);
  const [showNvidia, setShowNvidia] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Ollama Connection states
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/api/ollama/models`)
      .then(res => res.json())
      .then((data: { online: boolean, models: Array<{ name: string }> }) => {
        setOllamaOnline(data.online);
        setOllamaModels(data.models?.map(m => m.name) || []);
      })
      .catch(() => {
        setOllamaOnline(false);
      })
      .finally(() => {
        setOllamaLoading(false);
      });
  }, [apiBase]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShowSettings]);

  useEffect(() => {
    const focusableElementsString = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const modalElement = modalRef.current;
    if (!modalElement) return;

    const focusableElements = Array.from(modalElement.querySelectorAll(focusableElementsString)) as HTMLElement[];
    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];

    firstFocusableElement?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstFocusableElement) {
          lastFocusableElement?.focus();
          e.preventDefault();
        }
      } else {
        if (activeEl === lastFocusableElement) {
          firstFocusableElement?.focus();
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: theme.overlay, zIndex: 100, backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", WebkitAppRegion: "no-drag"
      } as React.CSSProperties}
    >
      <div 
        ref={modalRef}
        style={{
          backgroundColor: theme.modal, borderRadius: "16px", padding: "20px 24px", 
          width: "90%", maxWidth: "440px", border: theme.border, color: theme.text,
          boxShadow: theme.shadow,
          display: "flex", flexDirection: "column", gap: "16px",
          maxHeight: "85vh", overflowY: "auto"
        }}
      >
        <h2 id="settings-modal-title" style={{ fontSize: "18px", margin: 0, fontWeight: 600, color: theme.heading }}>Settings</h2>
        
        {/* Theme Settings */}
        <div>
          <label style={{ display: "block", fontSize: "13px", color: theme.text, marginBottom: "6px", fontWeight: 500 }}>Theme</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
            {themeEntries.map(([themeName, themeChoice]) => {
              const isActive = selectedThemeName === themeName;
              return (
                <button
                  key={themeName}
                  onClick={() => setSelectedThemeName(themeName)}
                  style={{
                    padding: "8px 6px", borderRadius: "8px", border: isActive ? `1px solid ${theme.accent}` : theme.borderSoft,
                    backgroundColor: isActive ? theme.accentSoft : theme.input,
                    color: isActive ? theme.accentText : theme.textMuted,
                    cursor: "pointer", transition: "all 0.2s", fontWeight: isActive ? 700 : 500,
                    boxShadow: isActive ? theme.accentGlow : "none", fontSize: "11px"
                  }}
                >
                  {themeChoice.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Model Settings */}
        <div>
          <label style={{ display: "block", fontSize: "13px", color: theme.text, marginBottom: "6px", fontWeight: 500 }}>Online Vision Model</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setOnlineVisionModel("gemini")}
              style={{
                flex: 1, padding: "8px", borderRadius: "8px", border: theme.border,
                backgroundColor: onlineVisionModel === "gemini" ? theme.accentSoft : theme.input,
                color: onlineVisionModel === "gemini" ? theme.accentText : theme.textSubtle,
                cursor: "pointer", transition: "all 0.2s", fontWeight: onlineVisionModel === "gemini" ? 600 : 400,
                boxShadow: onlineVisionModel === "gemini" ? `inset 0 0 0 1px ${theme.accent}` : "none",
                fontSize: "12px"
              }}
            >
              Gemini
            </button>
            <button
              onClick={() => setOnlineVisionModel("nvidia")}
              style={{
                flex: 1, padding: "8px", borderRadius: "8px", border: theme.border,
                backgroundColor: onlineVisionModel === "nvidia" ? "rgba(16, 185, 129, 0.2)" : theme.input,
                color: onlineVisionModel === "nvidia" ? theme.success : theme.textSubtle,
                cursor: "pointer", transition: "all 0.2s", fontWeight: onlineVisionModel === "nvidia" ? 600 : 400,
                boxShadow: onlineVisionModel === "nvidia" ? `inset 0 0 0 1px ${theme.success}` : "none",
                fontSize: "12px"
              }}
            >
              NVIDIA (Phi-4)
            </button>
          </div>
        </div>

        {/* Ollama Offline Settings */}
        <div style={{ padding: "10px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.03)", border: theme.borderSoft }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600 }}>Ollama Offline Status</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: ollamaLoading ? theme.textSubtle : ollamaOnline ? theme.success : theme.danger }}>
              {ollamaLoading ? "Checking..." : ollamaOnline ? "🟢 Connected" : "🔴 Offline"}
            </span>
          </div>

          {ollamaOnline && ollamaModels.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: theme.textSubtle, marginBottom: "4px" }}>Offline Text Model</label>
                <select
                  value={offlineTextModel}
                  onChange={(e) => setOfflineTextModel(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: theme.borderSoft, backgroundColor: theme.input, color: theme.text, fontSize: "12px", outline: "none" }}
                >
                  {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: theme.textSubtle, marginBottom: "4px" }}>Offline Vision Model</label>
                <select
                  value={offlineVisionModel}
                  onChange={(e) => setOfflineVisionModel(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: theme.borderSoft, backgroundColor: theme.input, color: theme.text, fontSize: "12px", outline: "none" }}
                >
                  {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* OCR Pre-processing Toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
          <div>
            <span style={{ display: "block", fontSize: "12px", fontWeight: 600 }}>Enable Screen OCR</span>
            <span style={{ display: "block", fontSize: "10px", color: theme.textSubtle }}>Extract text locally from screenshots</span>
          </div>
          <input 
            type="checkbox"
            checked={ocrEnabled}
            onChange={(e) => setOcrEnabled(e.target.checked)}
            style={{ width: "16px", height: "16px", cursor: "pointer" }}
          />
        </div>

        {/* API Key Override Settings */}
        <div>
          <label style={{ display: "block", fontSize: "13px", color: theme.text, marginBottom: "6px", fontWeight: 500 }}>API Keys (Secure Storage)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ fontSize: "10px", color: theme.textSubtle }}>Gemini API Key</span>
                <span style={{ fontSize: "9px", color: theme.success }}>{geminiKey ? "🔒 Encrypted" : "Fallback to .env"}</span>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input 
                  type={showGemini ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Paste Gemini Key here..."
                  style={{
                    flex: 1, padding: "6px 8px", borderRadius: "6px", border: theme.borderSoft,
                    backgroundColor: theme.input, color: theme.text, fontSize: "12px", outline: "none"
                  }}
                />
                <button 
                  type="button"
                  onClick={() => setShowGemini(!showGemini)}
                  style={{
                    padding: "0 8px", borderRadius: "6px", border: "none",
                    backgroundColor: theme.button, color: theme.textMuted, cursor: "pointer", fontSize: "10px"
                  }}
                >
                  {showGemini ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ fontSize: "10px", color: theme.textSubtle }}>OpenRouter API Key</span>
                <span style={{ fontSize: "9px", color: theme.success }}>{openrouterKey ? "🔒 Encrypted" : "Fallback to .env"}</span>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input 
                  type={showOpenRouter ? "text" : "password"}
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  placeholder="Paste OpenRouter Key here..."
                  style={{
                    flex: 1, padding: "6px 8px", borderRadius: "6px", border: theme.borderSoft,
                    backgroundColor: theme.input, color: theme.text, fontSize: "12px", outline: "none"
                  }}
                />
                <button 
                  type="button"
                  onClick={() => setShowOpenRouter(!showOpenRouter)}
                  style={{
                    padding: "0 8px", borderRadius: "6px", border: "none",
                    backgroundColor: theme.button, color: theme.textMuted, cursor: "pointer", fontSize: "10px"
                  }}
                >
                  {showOpenRouter ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                <span style={{ fontSize: "10px", color: theme.textSubtle }}>NVIDIA API Key</span>
                <span style={{ fontSize: "9px", color: theme.success }}>{nvidiaKey ? "🔒 Encrypted" : "Fallback to .env"}</span>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input 
                  type={showNvidia ? "text" : "password"}
                  value={nvidiaKey}
                  onChange={(e) => setNvidiaKey(e.target.value)}
                  placeholder="Paste NVIDIA Key here..."
                  style={{
                    flex: 1, padding: "6px 8px", borderRadius: "6px", border: theme.borderSoft,
                    backgroundColor: theme.input, color: theme.text, fontSize: "12px", outline: "none"
                  }}
                />
                <button 
                  type="button"
                  onClick={() => setShowNvidia(!showNvidia)}
                  style={{
                    padding: "0 8px", borderRadius: "6px", border: "none",
                    backgroundColor: theme.button, color: theme.textMuted, cursor: "pointer", fontSize: "10px"
                  }}
                >
                  {showNvidia ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts Documentation */}
        <div style={{ padding: "8px 10px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.02)", border: theme.borderSoft }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 600, color: theme.textMuted, marginBottom: "4px" }}>Keyboard Shortcuts</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: theme.textSubtle }}>Screen Capture</span>
              <kbd style={{ fontFamily: "monospace", padding: "1px 4px", borderRadius: "4px", backgroundColor: theme.button, border: theme.borderSoft }}>Ctrl+Shift+S</kbd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: theme.textSubtle }}>Toggle Window visibility</span>
              <kbd style={{ fontFamily: "monospace", padding: "1px 4px", borderRadius: "4px", backgroundColor: theme.button, border: theme.borderSoft }}>Ctrl+O</kbd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: theme.textSubtle }}>Push to Talk (Voice)</span>
              <kbd style={{ fontFamily: "monospace", padding: "1px 4px", borderRadius: "4px", backgroundColor: theme.button, border: theme.borderSoft }}>Hold Shift</kbd>
            </div>
          </div>
        </div>

        {/* Modal Done Control */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button 
            onClick={() => setShowSettings(false)}
            style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: theme.accent, color: "white", cursor: "pointer", fontSize: "13px", fontWeight: 500, transition: "all 0.2s", boxShadow: theme.accentGlow }}
          >Done</button>
        </div>
      </div>
    </div>
  );
}
