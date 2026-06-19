import type React from "react";
import type { ThemeTokens } from "../types";

export interface TitleBarProps {
  theme: ThemeTokens;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
}

export function TitleBar({
  theme,
  isRecording,
  startRecording,
  stopRecording
}: TitleBarProps) {
  return (
    <header style={{
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
           aria-label={isRecording ? "Stop recording voice input" : "Start listening to voice input"}
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
          aria-label="Minimize application"
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
          aria-label="Maximize application"
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
          aria-label="Close application"
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
    </header>
  );
}
