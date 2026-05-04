# BrightLens Theme Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Default, Dracula Glass, and GitHub Dark Glass theme options inside Settings and apply them across BrightLens UI and markdown output.

**Architecture:** Add typed theme tokens in `src/App.tsx`, persist selected theme to `localStorage`, and replace key hard-coded colors with active theme values. Keep the transparent Electron glass layout intact.

**Tech Stack:** React 19, TypeScript, Electron, Vite, ReactMarkdown, inline React styles.

---

### Task 1: Add Theme Tokens and Persistent Theme State

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add theme types and token map**
Add `ThemeName`, `ThemeTokens`, and `THEMES` above `function App()`.

**Step 2: Add theme state**
Inside `App`, add `selectedThemeName` state initialized from `localStorage.getItem("brightlens_theme") || "default"`, derive `theme = THEMES[selectedThemeName]`, and persist changes in a `useEffect`.

**Step 3: Build**
Run: `npm run build`
Expected: TypeScript succeeds.

**Step 4: Commit**
Run: `git add src/App.tsx && git commit -m "feat: add BrightLens theme tokens"`

---

### Task 2: Apply Theme Tokens to Main UI

**Files:**
- Modify: `src/App.tsx`

**Step 1: Replace main UI colors**
Apply token values to app icon, top pill, content panel, segmented control, loading card, input panel, action buttons, send/stop buttons, errors, and modals.

**Step 2: Preserve interaction behavior**
Keep existing event handlers, drag regions, hover effects, and Electron APIs unchanged.

**Step 3: Build**
Run: `npm run build`
Expected: TypeScript succeeds.

**Step 4: Commit**
Run: `git add src/App.tsx && git commit -m "feat: apply themes to BrightLens UI"`

---

### Task 3: Theme Markdown Rendering and Settings Option Bar

**Files:**
- Modify: `src/App.tsx`

**Step 1: Theme markdown**
Update `ReactMarkdown` component styles to use theme text, heading, link, code, and panel tokens.

**Step 2: Add Settings Theme option bar**
Inside the Settings modal, add a `Theme` section with buttons for Default, Dracula Glass, and GitHub Dark Glass. Selection updates `selectedThemeName` immediately.

**Step 3: Build and lint**
Run: `npm run build`
Expected: succeeds.
Run: `npm run lint`
Expected: no new lint errors.

**Step 4: Commit**
Run: `git add src/App.tsx && git commit -m "feat: add settings theme selector"`
