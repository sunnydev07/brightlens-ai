# BrightLens Thinking Loader Design

## Goal
Replace the large dashed loading card with a compact, polished loading state that feels like an AI reply in the content area.

## UI Behavior
When the user submits a typed query or screen query, the content area should immediately show:

1. A small user-query card containing the submitted text.
2. A compact assistant bubble with shimmering `Thinking` text while the answer is streaming or before the first token arrives.

The existing large bordered spinner card will be removed for normal ask/query loading. Speech loading can still use the compact loading treatment with `Listening` text.

## Placement
The loading state appears inside the response/content area, like a small chat exchange, instead of a centered full-width dashed panel.

## Styling
The loading bubble uses the active theme tokens for glass surface, border, accent, muted text, and glow. The shimmer animation is implemented in the existing inline `<style>` block.

## Data Flow
Add a `submittedQuestion` state. When a query starts, store the prompt text before clearing the input. Clear it when the user clears all or starts a new answer as appropriate.

## Testing
Add/update a source-level regression test to assert the `submittedQuestion` state, `Thinking` text, and shimmer animation exist. Run the source test, build, and lint.
