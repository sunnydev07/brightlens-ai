import type { ThemeTokens } from "../types";

export interface VisionToggleProps {
  theme: ThemeTokens;
  imageMode: "online" | "offline";
  setImageMode: (mode: "online" | "offline") => void;
}

export function VisionToggle({
  theme,
  imageMode,
  setImageMode
}: VisionToggleProps) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
      <div style={{ display: "flex", backgroundColor: theme.control, borderRadius: "14px", padding: "4px", boxShadow: theme.insetShadow }}>
        <button onClick={() => setImageMode("online")} style={{
          padding: "6px 16px", borderRadius: "10px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer",
          backgroundColor: imageMode === "online" ? theme.controlActive : "transparent",
          color: imageMode === "online" ? theme.text : theme.textSubtle, transition: "all 0.2s",
          boxShadow: imageMode === "online" ? theme.accentGlow : "none"
        }}>online</button>
        <button onClick={() => setImageMode("offline")} style={{
          padding: "6px 16px", borderRadius: "10px", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer",
          backgroundColor: imageMode === "offline" ? theme.controlActive : "transparent",
          color: imageMode === "offline" ? theme.text : theme.textSubtle, transition: "all 0.2s",
          boxShadow: imageMode === "offline" ? theme.accentGlow : "none"
        }}>offline</button>
      </div>
    </div>
  );
}
