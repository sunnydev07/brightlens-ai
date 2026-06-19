import type React from "react";
import ReactMarkdown from "react-markdown";
import { ErrorBoundary } from "./ErrorBoundary";
import type { ThemeTokens } from "../types";

export interface ChatAreaProps {
  theme: ThemeTokens;
  loading: boolean;
  speechLoading: boolean;
  response: string;
  submittedQuestion: string;
  image: string | null;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatArea({
  theme,
  loading,
  speechLoading,
  response,
  submittedQuestion,
  image,
  bottomRef
}: ChatAreaProps) {
  return (
    <>
      {/* Compact chat-style loading state */}
      {(loading || speechLoading) && !response && (
        <div style={{
          display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start",
          flex: 1, marginBottom: "20px", overflowY: "auto", justifyContent: "flex-start"
        }}>
          {submittedQuestion && (
            <div style={{
              alignSelf: "flex-end", maxWidth: "82%", padding: "10px 12px", borderRadius: "14px 14px 4px 14px",
              backgroundColor: theme.accentSoft, border: `1px solid ${theme.accent}`,
              color: theme.text, fontSize: "13px", lineHeight: 1.45, boxShadow: theme.insetShadow
            }}>
              {submittedQuestion}
            </div>
          )}
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
      {image && !loading && !response && (
        <div style={{ marginBottom: "20px", position: "relative", borderRadius: "12px", overflow: "hidden", border: theme.border }}>
          <img src={image} alt="Captured context" style={{ width: "100%", display: "block" }} />
          <div style={{ position: "absolute", bottom: "8px", right: "8px", padding: "4px 8px", backgroundColor: theme.control, borderRadius: "6px", fontSize: "11px", color: theme.textMuted }}>Visual Context Attached</div>
        </div>
      )}

      {/* Chat / Response Area */}
      {response && (
        <div style={{
          padding: "16px 20px", borderRadius: "16px", fontSize: "14px",
          backgroundColor: theme.response, border: theme.border,
          lineHeight: "1.6", textAlign: "left", flex: 1, overflowY: "auto", marginBottom: "20px",
          boxShadow: theme.insetShadow, position: "relative"
        }}>
          {image && (
            <div className="visual-context-thumbnail" style={{
              position: "absolute", top: "12px", right: "12px", width: "170px",
              borderRadius: "12px", overflow: "hidden", border: theme.border,
              backgroundColor: theme.input, boxShadow: theme.shadow, zIndex: 2
            }}>
              <img src={image} alt="Captured visual context" style={{ width: "100%", display: "block" }} />
              <div style={{
                position: "absolute", left: "6px", right: "6px", bottom: "6px", padding: "3px 6px",
                backgroundColor: theme.control, borderRadius: "7px", color: theme.textMuted,
                fontSize: "10px", fontWeight: 700, textAlign: "center", backdropFilter: "blur(10px)"
              }}>Visual Context</div>
            </div>
          )}
          <div style={{ paddingRight: image ? "190px" : 0 }}>
            <ErrorBoundary fallback={
              <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: theme.dangerSoft, color: theme.dangerText, border: `1px solid ${theme.danger}`, fontSize: "13px" }}>
                <strong>Failed to render response content safely.</strong>
                <div style={{ marginTop: "4px", fontSize: "12px", fontFamily: "monospace" }}>An error occurred while parsing the markdown content.</div>
              </div>
            }>
              <ReactMarkdown
                components={{
                  p: (props) => <p style={{margin: "0 0 1em 0", color: theme.markdown.text}} {...props} />,
                  pre: (props) => <pre style={{backgroundColor: theme.markdown.codeBg, padding: "16px", borderRadius: "10px", overflowX: "auto", margin: "1em 0", border: theme.border}} {...props} />,
                  code: ({inline, className, ...props}: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) => <code style={{backgroundColor: inline ? theme.markdown.inlineCodeBg : "transparent", padding: inline ? "2px 6px" : 0, borderRadius: "6px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "0.9em", color: inline ? theme.accentText : theme.markdown.text}} className={className} {...props} />,
                  ul: (props) => <ul style={{listStyleType: "disc", paddingLeft: "24px", marginBottom: "1em", color: theme.markdown.muted}} {...props} />,
                  ol: (props) => <ol style={{listStyleType: "decimal", paddingLeft: "24px", marginBottom: "1em", color: theme.markdown.muted}} {...props} />,
                  li: (props) => <li style={{marginBottom: "0.4em"}} {...props} />,
                  h1: (props) => <h1 style={{fontSize: "1.4em", fontWeight: 600, margin: "1.2em 0 0.6em", color: theme.markdown.heading}} {...props} />,
                  h2: (props) => <h2 style={{fontSize: "1.2em", fontWeight: 600, margin: "1.2em 0 0.6em", color: theme.markdown.headingSoft}} {...props} />,
                  h3: (props) => <h3 style={{fontSize: "1.1em", fontWeight: 600, margin: "1.2em 0 0.6em", color: theme.markdown.headingSoft}} {...props} />,
                  a: (props) => <a style={{color: theme.markdown.link, textDecoration: "none", fontWeight: 500}} {...props} />
                }}
              >
                {response + (loading ? " ▌" : "")}
              </ReactMarkdown>
            </ErrorBoundary>
          </div>
          <div ref={bottomRef} style={{ height: "1px" }} />
        </div>
      )}
    </>
  );
}
