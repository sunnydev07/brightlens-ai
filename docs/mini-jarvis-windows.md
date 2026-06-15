# Brightlens Mini-Jarvis for Windows

Mini-Jarvis lets Brightlens control safe Windows actions through local tool
calling.

## Requirements

- Windows 10 or 11
- Node.js `^20.19.0` or `>=22.12.0`
- Ollama running at `http://127.0.0.1:11434`
- FunctionGemma pulled locally:

```powershell
ollama pull functiongemma
```

## Usage

Start the backend:

```powershell
npm run server
```

In a second terminal, start the Electron app:

```powershell
npm run dev
```

Use natural commands in chat. The `/jarvis` prefix remains supported but is
optional:

```text
/jarvis open notepad
/jarvis search the web for Ollama FunctionGemma
/jarvis search YouTube for local AI assistant
/jarvis run powershell Get-Process chrome
```

You can also use the Voice Jarvis button to transcribe a local voice command
and run it as a desktop action.

PowerShell commands always require confirmation.

## Safety Model

Common commands are parsed into tool calls locally. Ambiguous supported
requests can use FunctionGemma for tool-call planning. Planning never executes
an action directly: Electron main validates every tool call before execution.

Safe tools can run immediately. Risky and dangerous tools require confirmation.
File operations are restricted to the current Windows user profile, and deletes
move items to the Recycle Bin.

Local execution results and cancelled actions are saved to:

```text
%USERPROFILE%\.brightlens-ai\mini-jarvis-actions.jsonl
```

Brightlens also keeps a detailed audit log of validation, confirmation,
execution, and failure events in Electron's user-data directory.
