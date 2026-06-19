import { useState, useEffect } from "react";
import type React from "react";
import ReactMarkdown from "react-markdown";
import { ErrorBoundary } from "./ErrorBoundary";
import type { ThemeTokens } from "../types";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatAreaProps {
  theme: ThemeTokens;
  loading: boolean;
  speechLoading: boolean;
  messages: Message[];
  image: string | null;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatArea({
  theme,
  loading,
  speechLoading,
  messages,
  image,
  bottomRef
}: ChatAreaProps) {
  const [activeSpeechText, setActiveSpeechText] = useState<string | null>(null);

  useEffect(() => {
    const checkSpeech = setInterval(() => {
      if (!window.speechSynthesis.speaking && activeSpeechText !== null) {
        setActiveSpeechText(null);
      }
    }, 500);
    return () => clearInterval(checkSpeech);
  }, [activeSpeechText]);

  const toggleSpeech = (text: string) => {
    if (window.speechSynthesis.speaking && activeSpeechText === text) {
      window.speechSynthesis.cancel();
      setActiveSpeechText(null);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setActiveSpeechText(null);
      utterance.onerror = () => setActiveSpeechText(null);
      setActiveSpeechText(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <>
      {/* Compact chat-style loading state */}
      {(loading || speechLoading) && messages.length === 0 && (
        <div style={{
          display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start",
          flex: 1, marginBottom: "20px", overflowY: "auto", justifyContent: "flex-start"
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px", width: "fit-content",
            padding: "8px 12px", borderRadius: "999px", backgroundColor: theme.response,
            border: theme.border, boxShadow: theme.insetShadow
          }}>
            <span style={{
              width: "7px", height: "7px", borderRadius: "50%", backgroundColor: speechLoading ? theme.success : theme.accent,
              boxShadow: `0 0 10px ${speechLoading ? theme.success : theme.accent}`
            }} />
            <span className="thinking-shimmer" style={{ fontSize: "13px", fontWeight: 700 }}>
              {speechLoading ? "Listening" : "Thinking"}
            </span>
          </div>
        </div>
      )}

      {/* Screenshot preview if provided */}
      {image && !loading && messages.length === 0 && (
        <div style={{ marginBottom: "20px", position: "relative", borderRadius: "12px", overflow: "hidden", border: theme.border }}>
          <img src={image} alt="Captured context" style={{ width: "100%", display: "block" }} />
          <div style={{ position: "absolute", bottom: "8px", right: "8px", padding: "4px 8px", backgroundColor: theme.control, borderRadius: "6px", fontSize: "11px", color: theme.textMuted }}>Visual Context Attached</div>
        </div>
      )}

      {/* Chat / Response Area */}
      {messages.length > 0 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "16px 20px",
          borderRadius: "16px",
          fontSize: "14px",
          backgroundColor: theme.response,
          border: theme.border,
          lineHeight: "1.6",
          textAlign: "left",
          flex: 1,
          overflowY: "auto",
          marginBottom: "20px",
          boxShadow: theme.insetShadow,
          position: "relative"
        }}>
          {image && (
            <div className="visual-context-thumbnail" style={{
              position: "absolute", top: "12px", right: "12px", width: "120px",
              borderRadius: "12px", overflow: "hidden", border: theme.border,
              backgroundColor: theme.input, boxShadow: theme.shadow, zIndex: 2
            }}>
              <img src={image} alt="Captured visual context" style={{ width: "100%", display: "block" }} />
              <div style={{
                position: "absolute", left: "6px", right: "6px", bottom: "6px", padding: "3px 6px",
                backgroundColor: theme.control, borderRadius: "7px", color: theme.textMuted,
                fontSize: "9px", fontWeight: 700, textAlign: "center", backdropFilter: "blur(10px)"
              }}>Visual Context</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingRight: image ? "140px" : 0 }}>
            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={idx}
                  style={{
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    backgroundColor: isUser ? theme.accentSoft : "transparent",
                    border: isUser ? `1px solid ${theme.borderSoft}` : "none",
                    color: theme.text,
                    position: "relative"
                  }}
                >
                  {!isUser && msg.content && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
                      <button
                        onClick={() => toggleSpeech(msg.content)}
                        title={activeSpeechText === msg.content ? "Stop speaking" : "Speak response"}
                        style={{
                          background: "transparent", border: "none", color: activeSpeechText === msg.content ? theme.danger : theme.textSubtle,
                          cursor: "pointer", fontSize: "13px", padding: "2px"
                        }}
                      >
                        {activeSpeechText === msg.content ? "🛑" : "🔊"}
                      </button>
                    </div>
                  )}
                  {isUser ? (
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                  ) : (
                    <ErrorBoundary fallback={
                      <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: theme.dangerSoft, color: theme.dangerText, border: `1px solid ${theme.danger}`, fontSize: "13px" }}>
                        <strong>Failed to render response content safely.</strong>
                      </div>
                    }>
                      <ReactMarkdown
                        components={{
                          p: (props) => <p style={{margin: "0 0 1em 0", color: theme.markdown.text}} {...props} />,
                          pre: ({children, ...props}) => {
                            let codeText = "";
                            try {
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              if (children && (children as any).props && (children as any).props.children) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                codeText = String((children as any).props.children).trim();
                              } else {
                                codeText = String(children);
                              }
                            } catch {
                              codeText = "";
                            }

                            const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
                              if (codeText) {
                                navigator.clipboard.writeText(codeText);
                                const btn = e.currentTarget;
                                btn.innerText = "Copied!";
                                setTimeout(() => { btn.innerText = "Copy"; }, 2000);
                              }
                            };

                            return (
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={handleCopy}
                                  style={{
                                    position: "absolute", top: "6px", right: "6px",
                                    padding: "3px 6px", borderRadius: "4px", border: "none",
                                    backgroundColor: "rgba(255,255,255,0.08)", color: "#aaa",
                                    fontSize: "10px", cursor: "pointer", zIndex: 10
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = "#fff"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#aaa"; }}
                                >
                                  Copy
                                </button>
                                <pre style={{backgroundColor: theme.markdown.codeBg, padding: "12px", borderRadius: "8px", overflowX: "auto", margin: "1em 0", border: theme.border}} {...props}>
                                  {children}
                                </pre>
                              </div>
                            );
                          },
                          code: ({inline, className, ...props}: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) => <code style={{backgroundColor: inline ? theme.markdown.inlineCodeBg : "transparent", padding: inline ? "2px 4px" : 0, borderRadius: "4px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.9em", color: inline ? theme.accentText : theme.markdown.text}} className={className} {...props} />,
                          ul: (props) => <ul style={{listStyleType: "disc", paddingLeft: "20px", marginBottom: "1em", color: theme.markdown.muted}} {...props} />,
                          ol: (props) => <ol style={{listStyleType: "decimal", paddingLeft: "20px", marginBottom: "1em", color: theme.markdown.muted}} {...props} />,
                          li: (props) => <li style={{marginBottom: "0.3em"}} {...props} />,
                          h1: (props) => <h1 style={{fontSize: "1.3em", fontWeight: 600, margin: "1em 0 0.5em", color: theme.markdown.heading}} {...props} />,
                          h2: (props) => <h2 style={{fontSize: "1.15em", fontWeight: 600, margin: "1em 0 0.5em", color: theme.markdown.headingSoft}} {...props} />,
                          h3: (props) => <h3 style={{fontSize: "1.05em", fontWeight: 600, margin: "1em 0 0.5em", color: theme.markdown.headingSoft}} {...props} />,
                          a: (props) => <a style={{color: theme.markdown.link, textDecoration: "none", fontWeight: 500}} {...props} />
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </ErrorBoundary>
                  )}
                </div>
              );
            })}
          </div>
          <div ref={bottomRef} style={{ height: "1px" }} />
        </div>
      )}
    </>
  );
}
