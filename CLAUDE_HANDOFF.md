# Claude Handoff

## Project

Wrestling Workout Timer - a wrestling workout and interval timer app.

## Current State

- The project lives in its own Git repository in Documents.
- Version 1 static app files exist: `index.html`, `style.css`, and `app.js`.
- Git is linked to GitHub repository `wrestling-workout-timer`.
- The app uses vanilla HTML/CSS/JS with no build step or dependencies.
- The app includes timer resilience and an independent whistle boost that still mixes with other phone audio.
- The 10-second warning is one normal-gain wooden clapper strike from `assets/audio/ten-second-clapper.m4a`; the old pop file remains but is not referenced.

## Important Files

- `README.md` - project purpose and current status.
- `PROJECT_BRIEF.md` - product direction and open decisions.
- `NEXT_STEPS.md` - current recommended next action.
- `AGENTS.md` - instructions for Codex working in this folder.
- `index.html` - static app shell.
- `style.css` - mobile-first visual design.
- `app.js` - timer, localStorage, Web Audio, and Wake Lock behavior.
- `assets/audio/ten-second-clapper.m4a` - active 10-second warning, AAC mono at 44.1 kHz.
- `tests/audio-lifecycle.test.js` - deterministic iOS audio interruption and recovery coverage.
- `tests/browser-smoke.js` - real Chrome interaction check for timer start and Web Audio cue playback.

## Decisions Made

- Start with a lightweight project brain before choosing implementation details.
- Do not set up Cloudways yet.
- Version 1 should remain a static responsive web app deployable to GitHub Pages as-is.
- Timer cues use Web Audio only, with an explicit ambient audio session so other music can keep playing.
- On a normal app return, the existing authorized audio context resumes first; it is replaced and buffers are decoded again only when resume actually fails.
- WebKit operations have a bounded timeout because iOS can leave `AudioContext.resume()` unresolved after suspension.
- Hidden HTML media fallbacks are intentionally excluded because their playback session can interrupt other audio.
- A cold PWA reload restores elapsed time and keeps the countdown running from wall-clock time while a notice requests one gesture to unlock sound.
- A 500 ms watchdog advances the countdown if Safari drops the normal animation-frame callback.
- Whistle levels above 100% use an oversampled soft-saturation curve instead of a peak limiter so the extra gain creates a real loudness increase.
- A sub-audible oscillator keeps the Web Audio graph active only while the timer runs, so long intervals do not lose their later cues during silent gaps.
- The clapper was downloaded from BigSoundBank sound #1588, `Gavel, 1 blow`, by Joseph Sardin: `https://bigsoundbank.com/gavel-1-blow-s1588.html`.
- Direct source WAV: `https://bigsoundbank.com/UPLOAD/bwf-en/1588.wav`.
- License: CC0/public domain. Commercial use, modification, redistribution, and use without attribution are explicitly permitted.
- The downloaded 24-bit mono 48 kHz WAV was converted with macOS `afconvert` to a 0.318-second AAC mono 44.1 kHz M4A. It was not synthesized.

## Open Questions

- Should this be a personal tool, public product, or part of a wrestling training funnel?

## Platform Boundary

iOS suspends Web Audio while a PWA is actually backgrounded. A normal return can resume the existing authorized context automatically, but a full PWA reload still needs one gesture because the new page has no authorized audio session. True background cue playback requires a native iOS wrapper.

## Next Step

Run the five-part iPhone timer and audio check in `NEXT_STEPS.md`.

## Notes for Claude

Advise Seth in plain English. Keep recommendations practical and focused on the next highest-leverage decision.
