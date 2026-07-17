# Claude Handoff

## Project

Wrestling Workout Timer - a wrestling workout and interval timer app.

## Current State

- The project lives in its own Git repository in Documents.
- Version 1 static app files exist: `index.html`, `style.css`, and `app.js`.
- Git is linked to GitHub repository `wrestling-workout-timer`.
- The app uses vanilla HTML/CSS/JS with no build step or dependencies.
- The app includes timer resilience and an independent whistle boost that still mixes with other phone audio.

## Important Files

- `README.md` - project purpose and current status.
- `PROJECT_BRIEF.md` - product direction and open decisions.
- `NEXT_STEPS.md` - current recommended next action.
- `AGENTS.md` - instructions for Codex working in this folder.
- `index.html` - static app shell.
- `style.css` - mobile-first visual design.
- `app.js` - timer, localStorage, Web Audio, and Wake Lock behavior.
- `tests/audio-lifecycle.test.js` - deterministic iOS audio interruption and recovery coverage.
- `tests/browser-smoke.js` - real Chrome interaction check for timer start and Web Audio cue playback.

## Decisions Made

- Start with a lightweight project brain before choosing implementation details.
- Do not set up Cloudways yet.
- Version 1 should remain a static responsive web app deployable to GitHub Pages as-is.
- Timer cues use Web Audio only, with an explicit ambient audio session so other music can keep playing.
- On blur, background, or interruption, the old audio context is replaced and buffers are decoded into the fresh context.
- WebKit operations have a bounded timeout because iOS can leave `AudioContext.resume()` unresolved after suspension.
- Hidden HTML media fallbacks are intentionally excluded because their playback session can interrupt other audio.
- A cold PWA reload restores elapsed time and keeps the countdown running from wall-clock time while a notice requests one gesture to unlock sound.
- A 500 ms watchdog advances the countdown if Safari drops the normal animation-frame callback.
- Whistle levels above 100% use an oversampled soft-saturation curve instead of a peak limiter so the extra gain creates a real loudness increase.

## Open Questions

- Should this be a personal tool, public product, or part of a wrestling training funnel?

## Platform Boundary

iOS suspends Web Audio while a PWA is actually backgrounded. The timer restores elapsed time and audio on return; true background cue playback requires a native iOS wrapper.

## Next Step

Run the four-part iPhone timer and audio check in `NEXT_STEPS.md`.

## Notes for Claude

Advise Seth in plain English. Keep recommendations practical and focused on the next highest-leverage decision.
