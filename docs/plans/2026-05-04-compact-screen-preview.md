# Compact Screen Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the full-width captured screenshot preview with a small top-right visual-context thumbnail so text output gets most of the content area.

**Architecture:** Adjust `src/App.tsx` rendering only. Keep captured image state and server payload unchanged. Hide the old full-width preview when a response exists, render a small absolutely positioned thumbnail inside the response panel, and add right padding to markdown content on larger layouts.

**Tech Stack:** React 19, TypeScript, Electron, Vite, ReactMarkdown, inline React styles, Node test runner.

---

### Task 1: Add Regression Test for Compact Preview

**Files:**
- Modify: `tests/theme-selector.test.cjs`

**Step 1: Write the failing test**
Add a test asserting `src/App.tsx` contains `visual-context-thumbnail`, `Visual Context`, and a width marker such as `170px`.

**Step 2: Run test to verify it fails**
Run: `node --test tests/theme-selector.test.cjs`
Expected: FAIL because the compact thumbnail marker has not been implemented.

---

### Task 2: Implement Compact Thumbnail Layout

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/theme-selector.test.cjs`

**Step 1: Prevent full-width preview from rendering with response**
Change the screenshot preview condition from `image && !loading` to `image && !loading && !response`.

**Step 2: Make response panel positionable**
Add `position: "relative"` to the response area style.

**Step 3: Add compact thumbnail**
Inside the response panel, before `ReactMarkdown`, render a thumbnail when `image` exists:
- Wrapper has `className="visual-context-thumbnail"`
- `position: "absolute"`, `top: "12px"`, `right: "12px"`, `width: "170px"`
- Rounded corners, themed border/background/shadow
- Image uses `width: "100%"`, `display: "block"`
- Label says `Visual Context`

**Step 4: Keep text readable**
Wrap `ReactMarkdown` in a content div with `paddingRight: image ? "190px" : 0` so markdown text does not overlap thumbnail.

**Step 5: Run verification**
Run: `node --test tests/theme-selector.test.cjs`
Expected: PASS.
Run: `npm run build`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

**Step 6: Commit**
Run: `git add src/App.tsx tests/theme-selector.test.cjs && git commit -m "feat: compact screen capture preview"`
