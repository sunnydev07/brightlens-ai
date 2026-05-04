# BrightLens Compact Screen Preview Design

## Goal
When the user uses **Use Screen**, the captured screenshot should not dominate the content area. The AI text response should remain the main focus.

## Current Problem
The screenshot preview renders full-width above the response. This consumes much of the available vertical space and leaves a smaller area for text output.

## New Behavior
After screen capture, show the screenshot as a small visual-context thumbnail instead of a large preview.

## Layout
- The response panel remains the primary content area.
- If an image exists and a response is visible, render a small thumbnail floating in the top-right of the response panel.
- The thumbnail should be approximately 150-180px wide, with a small `Visual Context` label.
- Add right padding to the response panel so markdown text does not overlap the thumbnail.
- Do not show the old full-width screenshot preview when a response exists.

## Styling
Use existing theme tokens for border, glass background, text, shadow, and label color. Keep transparency and rounded corners consistent with BrightLens.

## Testing
Update the source-level regression test to assert the compact visual context thumbnail markers exist and the old full-width preview behavior is constrained.
