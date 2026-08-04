# Independent Timer Cues and Soundboard PRD

## Problem Statement

Coaches and training partners need automatic workout cues and spontaneous manual sounds during the same session. Today the native app schedules timer sounds and exposes only individual whistle/clapper actions through the timer object, so there is no dedicated sound panel and no way to silence future timer cues without changing saved volume levels. The timer and manual sounds need independent controls while sharing one reliable audio system.

## Target User & Use Case

- Primary user: a coach, wrestler, parent, or training partner operating the app mat-side.
- Primary use case: run a timed workout with normal automatic cues while opening a soundboard and triggering voice, clap, whistle, or horn sounds whenever the room needs them.
- Secondary use case: disable automatic timer cues for a manually officiated session while keeping the timer and soundboard fully usable.

## Goals & Success Metrics

- Timer Sounds can be enabled or disabled in one action without pausing, resetting, or changing saved cue volumes.
- A manual sound is reachable within two taps from the timer screen and begins within 150 milliseconds during physical-device testing.
- During a 10-minute workout with at least 20 manual sound triggers, the timer continues accurately and every enabled automatic cue fires exactly once.
- When Timer Sounds is disabled, no future automatic cue plays, but every manual soundboard pad still works.
- Closing or reopening the soundboard does not change timer state, sound settings, or scheduled cue behavior.

## Requirements

### Must-Have

- Keep the timer and soundboard as independent control surfaces backed by one shared audio controller.
- Add a persistent `Timer Sounds` toggle that defaults to enabled, affects automatic cues only, and preserves the existing volume values.
- Allow the toggle to change during a running workout; it must affect upcoming cues without restarting the timer.
- Add a soundboard panel that can remain open while the timer stays visible, running, and controllable.
- Use large, labeled pads with clear pressed states and haptic feedback.
- Launch with pads for `Ready, Set` voice with no whistle, `Three Claps`, at least two distinct whistles, at least two distinct horns, and `Stop Manual Sounds`.
- Let manual pads play whether automatic timer sounds are enabled or disabled.
- Ensure manual sound playback never starts, pauses, resets, or advances the timer.
- Ensure stopping manual sounds does not cancel automatic timer cues.
- Treat the manual `Start Whistle` as the cue for the next timer start: show that the start cue has been handled, suppress exactly one upcoming automatic start whistle, and keep every later automatic cue scheduled normally.
- Clear the handled-start state after the timer consumes it or when the workout is reset, and let the user cancel it before starting.
- Support manual sounds while automatic timer cues are scheduled, including rapid repeated presses.
- Keep separate saved controls for automatic cue volume and manual soundboard volume.
- Let the user tap the paused timer readout to edit the current time with separate minute and second scroll wheels.
- Preserve existing background-music mixing and native audio-session behavior.
- Bundle only owned or clearly licensed audio assets and record each source/license in the repository.

### Nice-to-Have

- Color-code sound categories such as voice, claps, whistles, and horns.
- Let users choose which bundled sound each automatic cue uses.
- Allow pad reordering, favorites, and per-pad volume.
- Add a compact soundboard layout optimized for one-handed portrait use.

## Out of Scope

- Importing, recording, trimming, or sharing custom sounds.
- Physical Stream Deck, Bluetooth remote, or Apple Watch control.
- Accounts, cloud synchronization, downloadable sound packs, or a backend.
- Guaranteeing cues after the operating system terminates the app.
- Rebuilding the workout-template system or adding a full audio editor.

## Open Questions & Risks

- Decide whether editing the paused readout changes only the current interval or also updates that phase's saved workout setting.
- Finalize and license the initial whistle and horn recordings; the current repository does not yet contain multiple genuinely distinct horns.
- Verify that canceling or restoring scheduled automatic cues mid-workout does not create duplicates or missed transitions.
- Verify that a manual Start Whistle followed by starting the timer produces one whistle total, while later interval and finish cues remain unchanged.
- Prevent clipping when manual and automatic sounds overlap at boosted volume.
- Fit a useful pad grid beside the landscape timer without reducing the timer's mat-room readability.
