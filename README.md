# Brightlens AI

Brightlens AI is a Windows desktop assistant built with Electron, React, and
local AI models. It combines screen-aware chat, local voice transcription, and
Mini-Jarvis desktop tools in one compact interface.

## What It Can Do

- **Mini-Jarvis Windows tools**: use natural chat commands, `/jarvis`, or local
  voice commands to open apps, search the web, use the clipboard, find files,
  and run confirmed PowerShell commands through FunctionGemma tool calling.
- Understand natural desktop requests without requiring `/jarvis`.
- Execute ordered plans of up to four supported actions.
- Open applications, websites, and searches in Chrome, Edge, or the default
  browser.
- Control windows, system volume, mute state, clipboard contents, and
  screenshots.
- Find, list, create, rename, move, and recycle files inside the current
  Windows user profile.
- Create persistent local reminders and show Windows notifications.
- Read basic system information and manage shutdown or restart requests.
- Analyze screen captures with Gemini online or LLaVA locally.
- Run text chat locally with Ollama and preserve conversation history in SQLite.
- Transcribe microphone or uploaded audio locally with `faster-whisper`.

## Natural Commands

Exact command syntax is not required. Examples:

```text
Open Chrome
Open Chrome and YouTube inside it
Open Notepad and then open Calculator
Search YouTube for local AI assistants
Set the volume to 40
Take a screenshot
Find files named report
Create folder Desktop/Projects
Remind me in 20 minutes to check the build
Maximize Visual Studio Code
```

Common commands are recognized locally without contacting the tool model.
Ambiguous supported action requests can be routed through Ollama using
FunctionGemma. Ordinary questions automatically fall back to chat.

The older `/jarvis` prefix remains compatible, but it is no longer needed.

## Safety

- Risky and destructive actions require a native confirmation dialog.
- File operations are restricted to the current Windows user profile.
- Deletes move items to the Recycle Bin.
- Protected Windows processes cannot be closed.
- PowerShell execution requires confirmation and blocks known destructive
  command patterns.
- Tool validation, confirmations, results, and failures are written to
  `mini-jarvis-actions.jsonl` in Electron's user-data directory.
- Multi-step execution stops when a step is rejected, cancelled, or fails.

## Current Scope

Mini-Jarvis currently uses structured Windows tools and bounded action plans. It
does not yet perform full Codex-style visual Computer Use such as repeatedly
observing screenshots, locating arbitrary UI elements, clicking them, and
verifying each visual state change.

## Requirements

- Windows 10 or 11
- Node.js `^20.19.0` or `>=22.12.0`
- Ollama running at `http://127.0.0.1:11434`
- Optional: a Gemini API key for online screen-image analysis
- Optional: Python 3.10+ and `faster-whisper` for local voice transcription

## Setup

```powershell
git clone https://github.com/sunnydev07/brightlens-ai.git
cd brightlens-ai
npm install

ollama pull llama3.2
ollama pull llava
ollama pull functiongemma
```

For Mini-Jarvis tool calling, FunctionGemma must be available locally. See the
[Mini-Jarvis Windows guide](docs/mini-jarvis-windows.md) for usage, safety, and
local action-log details.

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key

# Optional model overrides
GEMINI_MODEL=gemini-3-flash-preview
OLLAMA_BASE=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:latest
OLLAMA_VISION_MODEL=llava:latest
OLLAMA_CHAT_URL=http://127.0.0.1:11434/api/chat
BRIGHTLENS_TOOL_MODEL=functiongemma
BRIGHTLENS_TOOL_TIMEOUT_MS=60000
```

For optional local voice transcription:

```powershell
python -m pip install faster-whisper
```

Set `BRIGHTLENS_PYTHON` if `python` is not the correct executable. The Whisper
model must already be available locally because runtime downloads are disabled.
Use `BRIGHTLENS_WHISPER_MODEL` to provide a local model path or cached model
name.

## Run

Start the backend:

```powershell
npm run server
```

In a second terminal, start Vite and Electron:

```powershell
npm run dev
```

## Controls

- `Ctrl + Shift + S`: capture the screen and analyze it.
- `Ctrl + O`: show or hide Brightlens.
- Hold `Shift` outside an editable field: push-to-talk transcription.
- Voice Jarvis button: transcribe speech and run it as a desktop action.
- Tray icon: show, hide, or quit Brightlens.

## Development

```powershell
node --test test/*.test.cjs
npm run lint
npm run build
```

## Architecture

- `src/App.tsx`: chat, screen capture, voice, and command-routing interface.
- `server/`: Express API, Ollama/Gemini routing, SQLite history, and speech.
- `electron/tools/planner.cjs`: natural command normalization and tool planning.
- `electron/tools/registry.cjs`: supported tool schemas and safety levels.
- `electron/tools/safety.cjs`: argument validation and policy checks.
- `electron/tools/executor.cjs`: dispatches validated actions.
- `electron/tools/windows.cjs`: Windows application, file, audio, and system
  integrations.

## Tech Stack

Electron, React 19, TypeScript, Vite, Express, SQLite, Ollama, Gemini, and
faster-whisper.
