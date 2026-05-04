# BrightLens Thinking Loader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the large query loading card with a compact chat-style user query card and shimmering Thinking assistant bubble.

**Architecture:** Track the submitted query in `src/App.tsx` with `submittedQuestion`. Render a small content-area loading exchange when loading starts and no response exists. Reuse active theme tokens and add a shimmer keyframe in the existing inline style block.

**Tech Stack:** React 19, TypeScript, Electron, Vite, ReactMarkdown, inline React styles, Node test runner.

---

### Task 1: Add Regression Test for Thinking Loader

**Files:**
- Modify: `tests/theme-selector.test.cjs`

**Step 1: Write the failing test**
Add assertions that `src/App.tsx` contains `submittedQuestion`, `Thinking`, and `thinkingShimmer`.

**Step 2: Run test to verify it fails**
Run: `node --test tests/theme-selector.test.cjs`
Expected: FAIL because the loader has not been implemented yet.

**Step 3: Commit test only after implementation in Task 2**
Do not commit the failing test alone.

---

### Task 2: Implement Submitted Query and Compact Loader

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/theme-selector.test.cjs`

**Step 1: Add state**
Add `const [submittedQuestion, setSubmittedQuestion] = useState("");` near the existing input/response state.

**Step 2: Set submitted query on typed asks**
In `handleAskText`, after `const q = ...` and before clearing input, call `setSubmittedQuestion(q);`.

**Step 3: Set submitted query on screen capture asks**
In the Electron screen capture handler, after computing `q`, call `setSubmittedQuestion(q || "Explain what's on screen in simple steps");`.

**Step 4: Clear submitted query**
Update clear-all action to clear `submittedQuestion`. Clear it when a new response begins only by replacing it with the new submitted query.

**Step 5: Replace large loading card**
Replace the current `(loading || speechLoading) && !response` large dashed panel with a compact content-area exchange:
- User card if `submittedQuestion` exists.
- Assistant bubble containing shimmering text: `Thinking` for normal loading and `Listening` for speech loading.

**Step 6: Add shimmer animation**
Add `@keyframes thinkingShimmer` and a `.thinking-shimmer` CSS class to the existing inline style block.

**Step 7: Run verification**
Run: `node --test tests/theme-selector.test.cjs`
Expected: PASS.
Run: `npm run build`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

**Step 8: Commit**
Run: `git add src/App.tsx tests/theme-selector.test.cjs && git commit -m "feat: add compact thinking loader"`
