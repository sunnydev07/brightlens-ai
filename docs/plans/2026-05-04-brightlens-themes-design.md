# BrightLens Theme Selector Design

## Goal
Add two developer-community-inspired themes to BrightLens while preserving the current transparent Electron glass UI. The Settings modal will include a theme option bar with three choices: Default, Dracula Glass, and GitHub Dark Glass.

## Theme Choices
- **Default**: Existing BrightLens purple glass style.
- **Dracula Glass**: Inspired by the popular Dracula developer theme, using deep translucent purple surfaces, pink/purple accents, and neon-like status colors.
- **GitHub Dark Glass**: Inspired by GitHub Dark / VS Code GitHub themes, using slate surfaces, blue accents, and high-readability markdown/code colors.

## Architecture
Introduce a small theme token map in `src/App.tsx`. The selected theme is stored in React state and persisted to `localStorage` under `brightlens_theme`. Inline styles will read from the active token set instead of hard-coded colors where theme differences matter.

## UI Changes
The Settings modal gains a **Theme** section with a segmented option bar. Users can switch between Default, Dracula, and GitHub Dark. The selection applies immediately and remains after restart.

## Markdown Styling
ReactMarkdown component styles will use theme tokens for body text, headings, links, inline code, code blocks, lists, and response panel surfaces so markdown output matches each theme.

## Testing
Run TypeScript build and lint. Because this is mostly UI styling, verify persistence and no type errors through build checks.
