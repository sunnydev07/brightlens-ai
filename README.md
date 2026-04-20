<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success.svg?style=for-the-badge" alt="Status Badge">
</div>

# Brightlens AI

**Brightlens AI** is an advanced, context-aware AI desktop application that bridges the gap between powerful cloud LLMs (Google Gemini) and robust local inference (Ollama - Llama 3.2 & LlaVA). Built natively on Electron with a stunning glassmorphism React/Vite interface, Brightlens acts as your personalized, visual digital brain right on your desktop.

## ✨ Features

- 🖥️ **Smart Screen Context**: Quickly capture anything on your screen using the global hotkey (`Ctrl + Shift + S` or `Cmd + Shift + S`) and ask the AI questions directly about your visual workspace.
- 🧠 **Hybrid Model Routing**:
  - **Online Mode**: Ultrafast generation using Google Gemini.
  - **Offline Mode**: Fully local privacy-centric generation utilizing Ollama (Llama 3.2 text and LlaVA vision models).
- 🎙️ **Voice Transcription**: Record audio inputs directly into the application with smart push-to-talk capability.
- 💾 **Persistent Session Memory**: Your chat context is efficiently preserved and passed down to each subsequent question using a lightweight, built-in SQLite database—allowing you to continue sessions exactly where you left off.
- 🎨 **Dynamic Glassmorphism UI**: Frameless, elegant transparent design that merges perfectly into modern OS aesthetics, complete with minimal UI controls.
- 🎛️ **Customized Personas (Modes)**: Create and save specialized behaviors tailored via custom system prompts to change how Brightlens responds.

---

## 🚀 Getting Started

### Prerequisites

To fully utilize both cloud and local options, ensure you have:
1. **Node.js** (v18+)
2. **Ollama** installed running locally on `http://127.0.0.1:11434`
   - Don't forget to pull the required local models from your terminal: 
     ```bash
     ollama run llama3.2
     ollama run llava
     ```

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sunnydev07/brightlens-ai.git
   cd brightlens-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file at the root of the project with your Gemini API credentials:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

### Running the App

Brightlens operates securely by separating the internal server logic from the rendering process. You need to start both concurrently.

1. **Start the backend AI router:**
   ```bash
   npm run server
   ```
   *Runs the Express / SQLite server on port 5000.*

2. **Launch the Electron UI:**
   Open a new terminal configuration in the same directory and execute:
   ```bash
   npm run dev
   ```
   *This starts Vite and connects it seamlessly inside the Electron window wrapper.*

---

## 🛠️ Tech Stack

- **Frontend:** React, Vite, Tailwind CSS (Vanilla rendering setup), React-Markdown.
- **Backend:** Node.js, Express, SQlite3 for persistent conversation routing.
- **Desktop Wrapper:** Electron (IPC Main/Renderer)
- **AI Integrations:** Google Generative AI (Gemini Flash), Ollama Server
- **Audio Processing:** MediaRecorder APIs parsed against localized TTS logic.

---

## ⌨️ Controls & Hotkeys

- **Drag Window**: Click and drag from the very top header area.
- **`Ctrl + Shift + S`** (`Cmd + Shift + S` on Mac): Take an active screenshot overlay to pass into text queries instantly.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/sunnydev07/brightlens-ai/issues). 

---

*Handcrafted for modern, seamless productivity.*
