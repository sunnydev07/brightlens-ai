# 🔍 Brightlens AI — Context-Aware Visual AI Assistant

[![Electron](https://img.shields.io/badge/Electron-Latest-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.0-blue?style=flat-square&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

**Brightlens AI** is a local-first desktop study and productivity assistant. Built with Electron, Express, Ollama, and SQLite, it allows you to capture any area of your screen with a single hotkey (`Ctrl + Shift + S`) and receive instant, step-by-step visual AI explanations and tutor guidance.

---

## ✨ Highlights

- 📸 **Global Screen Capture**: Press `Ctrl + Shift + S` (`Cmd + Shift + S` on Mac) anywhere on your OS to instantly snapshot and query visual context.
- 🧠 **Hybrid Cloud & Local AI**:
  - **Online**: Google Gemini Vision, NVIDIA NIMs (Phi-4 Multimodal), and OpenRouter (Nemotron 30B).
  - **Offline / Local**: 100% private local inference powered by Ollama (Llama 3.2 & LlaVA).
- 🎙️ **Push-to-Talk Voice Transcription**: Dictate queries directly into the assistant.
- 💾 **Persistent Chat Memory**: Automatic SQLite session storage for uninterrupted context across sessions.
- 🎨 **Glassmorphic Floating UI**: Minimalist, semi-transparent desktop overlay design.

---

## 🛠️ Architecture & Tech Stack

```
[ Electron Window ] <--- IPC ---> [ Express Server (Port 5000) ]
                                            |
                         +------------------+------------------+
                         |                                     |
                [ Cloud AI Routers ]                 [ Local Ollama ]
            (Gemini / NVIDIA / OpenRouter)          (Llama 3.2 / LlaVA)
                         |                                     |
                         +------------------+------------------+
                                            |
                                  [ SQLite Storage ]
```

- **Desktop Shell**: Electron
- **Frontend**: React 19, Vite, Tailwind CSS, TypeScript
- **Backend & Memory**: Express.js, SQLite3
- **AI Integrations**: Google Gemini, NVIDIA API, OpenRouter, Ollama

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- *(Optional for Offline Mode)* **Ollama** installed on `http://127.0.0.1:11434`:
  ```bash
  ollama run llama3.2
  ollama run llava
  ```

### 2. Installation

```bash
git clone https://github.com/sunnydev07/brightlens-ai.git
cd brightlens-ai
npm install
```

### 3. Environment Setup

Create `.env` in the root directory:

```env
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key
NVIDIA_API_KEY=your_nvidia_key
OLLAMA_BASE=http://127.0.0.1:11434
```

### 4. Running the App

Start the backend router and desktop app:

```bash
# Terminal 1: Backend Router
npm run server

# Terminal 2: Electron Frontend
npm run dev
```

---

## 📄 License

Distributed under the MIT License. Created by [Sunny Kumar Dev](https://github.com/sunnydev07).
