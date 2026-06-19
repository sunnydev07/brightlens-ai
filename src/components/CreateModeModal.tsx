import { useEffect, useRef } from "react";
import type React from "react";
import type { ThemeTokens, Mode } from "../types";

export interface CreateModeModalProps {
  theme: ThemeTokens;
  newModeName: string;
  setNewModeName: (val: string) => void;
  newModePrompt: string;
  setNewModePrompt: (val: string) => void;
  setShowCreateMode: (val: boolean) => void;
  setModes: React.Dispatch<React.SetStateAction<Mode[]>>;
  setSelectedModeName: (val: string) => void;
}

export function CreateModeModal({
  theme,
  newModeName,
  setNewModeName,
  newModePrompt,
  setNewModePrompt,
  setShowCreateMode,
  setModes,
  setSelectedModeName
}: CreateModeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCreateMode(false);
        setNewModeName("");
        setNewModePrompt("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShowCreateMode, setNewModeName, setNewModePrompt]);

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
      aria-labelledby="create-mode-modal-title"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: theme.overlay, zIndex: 100, backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", WebkitAppRegion: "no-drag"
      } as React.CSSProperties}
    >
      <div 
        ref={modalRef}
        style={{
          backgroundColor: theme.modal, borderRadius: "16px", padding: "24px", 
          width: "90%", maxWidth: "400px", border: theme.border, color: theme.text,
          boxShadow: theme.shadow
        }}
      >
        <h2 id="create-mode-modal-title" style={{ fontSize: "18px", marginBottom: "20px", marginTop: 0, fontWeight: 600 }}>Create Mode</h2>
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
  );
}
