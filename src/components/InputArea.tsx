import type React from "react";
import type { ThemeTokens, Mode } from "../types";

export interface InputAreaProps {
  theme: ThemeTokens;
  questionText: string;
  setQuestionText: (val: string) => void;
  loading: boolean;
  speechLoading: boolean;
  showModeMenu: boolean;
  setShowModeMenu: (val: boolean) => void;
  modes: Mode[];
  selectedModeName: string;
  setSelectedModeName: (val: string) => void;
  setShowCreateMode: (val: boolean) => void;
  handleAudioUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAskText: () => void;
  stopGeneration: (e?: React.MouseEvent) => void;
  setShowSettings: (val: boolean) => void;
  response: string;
  submittedQuestion: string;
  setImage: (val: string | null) => void;
  setError: (val: string) => void;
}

export function InputArea({
  theme,
  questionText,
  setQuestionText,
  loading,
  speechLoading,
  showModeMenu,
  setShowModeMenu,
  modes,
  selectedModeName,
  setSelectedModeName,
  setShowCreateMode,
  handleAudioUpload,
  handleAskText,
  stopGeneration,
  setShowSettings,
  response,
  submittedQuestion,
  setImage,
  setError
}: InputAreaProps) {
  return (
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
        aria-label="Question prompt"
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
             aria-label="Capture screen screenshot for context"
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
             aria-label="Smart processing indicator"
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
               aria-label={`Select AI system prompt mode, current mode: ${selectedModeName}`}
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
              <div 
                role="menu"
                style={{
                  position: "absolute", bottom: "100%", left: 0, marginBottom: "8px",
                  backgroundColor: theme.modal, backdropFilter: "blur(20px)",
                  border: theme.border, borderRadius: "12px",
                  padding: "8px 0", minWidth: "160px", zIndex: 100,
                  boxShadow: theme.shadow
                }}
              >
                <div style={{ padding: "4px 12px", fontSize: "11px", color: theme.textSubtle, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Your Modes
                </div>
                {modes.map(m => (
                  <div 
                    key={m.name}
                    role="menuitem"
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
                  role="menuitem"
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

          <label 
            title="Upload Audio" 
            aria-label="Upload audio file to transcribe"
            style={{
              width: "28px", height: "28px", borderRadius: "8px",
              backgroundColor: theme.button, cursor: "pointer", color: theme.textSubtle,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.buttonHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.button}
          >
            📎<input type="file" accept="audio/*" onChange={handleAudioUpload} aria-label="Audio file selector" style={{ display: "none" }} />
          </label>

          {(questionText || response || submittedQuestion) && (
            <button onClick={() => { setQuestionText(""); setImage(null); setError(""); }}
              title="Clear all" 
              aria-label="Clear current question, image preview, and response"
              style={{
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
            title="Settings" 
            aria-label="Open application settings modal"
            style={{
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
            aria-label="Stop generating AI response"
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
            aria-label="Submit question to AI"
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
  );
}
