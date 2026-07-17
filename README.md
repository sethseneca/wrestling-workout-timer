# Wrestling Workout Timer

Project workspace for building the Wrestling Workout Timer app.

## Purpose

Help wrestlers, coaches, and training partners run workout timers, interval rounds, and wrestling-specific conditioning sessions without friction.

## Current Status

- Project folder created on 2026-06-29.
- Git initialized and linked to the public GitHub repository.
- Version 1 is a static, mobile-first interval timer built with vanilla HTML/CSS/JS.
- Wrestle, rest, and finish transitions all use the same short whistle, with a saved 25%-200% whistle-volume control.
- Audio cues use one Web Audio path so they can mix with Music and recover after iOS app switching.
- If iOS fully reloads the PWA, the timer restores elapsed time but pauses until the user taps Resume and sound is unlocked.
- A no-dependency regression suite covers interruption, foreground return, and stuck WebKit audio operations.

## Local Validation

```sh
npm test
node tests/browser-smoke.js
```

## Platform Boundary

iOS suspends PWA Web Audio while the app is actually in the background. The timer keeps wall-clock time and restores cues when it returns. A cold reload shows `Tap play to resume with sound` instead of continuing silently, but sounding cues while fully exited requires a native iOS app or wrapper.

## Next Step

Verify the short whistle at multiple volume settings on an iPhone while Music is playing, then background and reopen the timer before publishing the change.
