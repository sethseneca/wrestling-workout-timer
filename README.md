# Wrestling Workout Timer

Project workspace for building the Wrestling Workout Timer app.

## Purpose

Help wrestlers, coaches, and training partners run workout timers, interval rounds, and wrestling-specific conditioning sessions without friction.

## Current Status

- Project folder created on 2026-06-29.
- Git initialized and linked to the public GitHub repository.
- Version 1 is a static, mobile-first interval timer built with vanilla HTML/CSS/JS.
- Wrestle, rest, and finish transitions all use the same short whistle, with a saved 25%-200% whistle-volume control.
- Levels above 100% use soft saturation so the whistle gets meaningfully louder instead of having the extra gain flattened by a peak limiter.
- Audio cues use one Web Audio path so they can mix with Music, resume the existing authorized audio context after a normal app switch, and rebuild it only if resume fails.
- A sub-audible Web Audio keep-alive runs only while the timer is active, preventing long silent intervals from losing their later cues.
- If iOS fully reloads the PWA, the timer restores elapsed time and keeps counting while a tap restores sound.
- A watchdog keeps the wall-clock countdown moving if Safari drops the animation-frame loop.
- A no-dependency regression suite covers 10-minute audio continuity, interruption, foreground return, reload recovery, dropped frames, and stuck WebKit audio operations.

## Local Validation

```sh
npm test
node tests/browser-smoke.js
```

## Platform Boundary

iOS suspends PWA Web Audio while the app is actually in the background. The timer keeps wall-clock time and automatically resumes its existing audio context after a normal return. A full PWA reload still shows `Timer running - tap anywhere to restore sound` because the new page has no authorized audio session to recover; sounding cues while fully exited requires a native iOS app or wrapper.

## Next Step

Run one 10-minute Wrestle interval on an iPhone and confirm the opening whistle, 10-second warning, and final whistle all sound.
