# Claude Handoff

Last updated: 2026-07-22

## Project

Wrestling Workout Timer is a mobile-first wrestling interval timer for wrestlers, coaches, parents, and training partners. It supports configurable Wrestle, Rest, and Get Ready durations; multiple rounds; saved timer presets; manual sound cues; and persistent timer state.

The current priority is a dependable foreground iPhone/PWA experience: the timer must keep counting without randomly pausing, and every cue must remain available even during long 4-10 minute intervals.

## Locations and Live State

- Local repo: `/Users/ppcstreammac/Documents/Wrestling Workout Timer`
- GitHub: `https://github.com/sethseneca/wrestling-workout-timer`
- Live app: `https://sethseneca.github.io/wrestling-workout-timer/`
- Branch: `main`
- Current deployed app commit: `97c9dc8` - `Avoid false audio recovery on window blur`.
- Local `main` and `origin/main` matched at `97c9dc8` on 2026-07-22.
- GitHub Pages successfully deployed and was cache-bypass verified at `97c9dc8`.
- The three-clap warning, centered landscape layout, native iPhone project, and browser blur-recovery fix are all pushed to GitHub.
- The laptop is becoming the primary development machine. Follow `LAPTOP_SETUP.md`; GitHub `main` remains the source of truth.

## Technical Shape

- Static responsive PWA hosted on GitHub Pages.
- Vanilla HTML, CSS, and JavaScript.
- No framework, backend, account system, build step, or runtime dependencies.
- Browser storage is `localStorage`; there is no cloud sync.
- `package.json` exists only to expose the Node test command.
- The app requests a screen Wake Lock while the timer is running when the browser supports it.

## Current Timer Behavior

- Default setup: 30-second Wrestle, 15-second Rest, 10-second Get Ready, 8 rounds, 150% whistle volume.
- Wrestle, Rest, and Get Ready can each be configured from 0:00 to 59:59, except Wrestle is normalized to at least one second.
- Rounds can be set from 1 to 99.
- The phase wording is intentionally `WRESTLE`, not `WORK`.
- Sequence order is optional Get Ready, then Wrestle/Rest rounds. No Rest phase is added after the final Wrestle round.
- Main controls: Start/Pause/Resume, Reset, previous interval, next interval, and manual whistle.
- Settings include saved named timer presets and a Sound Check for the whistle and 10-second warning.

## Sound Behavior - Current Source of Truth

Only two audio files are active in `app.js`:

- `assets/audio/rest-horn.m4a` is the one short whistle sound used for:
  - the start of every Wrestle phase;
  - the transition from Wrestle into Rest;
  - the final workout whistle;
  - the manual Whistle button;
  - the Whistle Sound Check button.
- `assets/audio/ten-second-clapper.m4a` is the separate 10-second warning sound.

The other audio files in `assets/audio/`, including `ten-second-pop.m4a`, are legacy/unused by the current app. Do not accidentally reconnect `whistle-start.m4a` or `final-horn.m4a`; Seth explicitly wanted the short Rest whistle to be the only whistle sound.

For Wrestle phases longer than 10 seconds, one short track containing three loud, rapid wooden clapper strikes plays when 10 seconds remain. The complete three-clap sequence plays once per Wrestle phase at normal gain and is not affected by the whistle-volume slider. The warning Sound Check plays the same complete sequence. The final transition then uses the unified short whistle.

### Clapper source, license, and history

- Active downloaded source: BigSoundBank sound #1590, `Gavel, 3 Blows`, recorded by Joseph Sardin.
- Source page: `https://bigsoundbank.com/gavel-3-blows-s1590.html`
- Direct source WAV: `https://bigsoundbank.com/UPLOAD/bwf-en/1590.wav`
- License: CC0/public domain. BigSoundBank explicitly permits commercial use, modification, redistribution, and use without attribution.
- The active three-hit sound was downloaded rather than synthesized or assembled by scheduling the single hit three times.
- The original 24-bit mono 48 kHz WAV was converted with macOS `afconvert` to `assets/audio/ten-second-clapper.m4a`: AAC, mono, 44.1 kHz, approximately 1.160 seconds.
- The three detected strike onsets are approximately 0.048, 0.361, and 0.686 seconds, producing rapid gaps of about 313 ms and 325 ms.
- Final file SHA-256: `3a11c2f1327f609ebb3399ef992982f572f3f70af1b1788815eb2c50b61ba342`.
- The previous active source was BigSoundBank #1588, `Gavel, 1 blow`, introduced in `6a5926b`. It was a 0.318-second single strike and is now replaced.
- BigSoundBank #1928, `Boxing bell #3`, was also reviewed because it contains three boxing-bell hits under CC0, but it was rejected because its resonant metallic ring did not match the requested dry wooden clap character.

## Whistle Volume and Other Music

- Whistle volume is independently adjustable from 25% to 200% in 5% steps.
- The saved default is 150%.
- The value is persisted with timer settings and saved timer presets.
- 100% and below use direct gain.
- Levels above 100% use a 4x-oversampled soft-saturation curve plus a controlled output gain. This was added because a peak limiter made 150% and 200% sound almost the same as 100%.
- A limiter remains only as a compatibility fallback if `WaveShaperNode` is unavailable.
- The app requests an `ambient` audio session so cues can mix with Music or a podcast instead of taking over phone audio.
- The app cannot directly change the volume of Music playing in another iPhone app. The intended control model is: set Music in its own app, set whistle boost in this timer, and use phone volume as the overall hardware ceiling.
- Hidden HTML `<audio>` fallbacks are intentionally excluded because they can create a competing playback session and interrupt external Music.

## Audio Reliability Architecture

The current audio path is Web Audio only.

1. Raw bytes for the active audio files are prefetched and cached separately from decoded buffers.
2. A user interaction unlocks Web Audio and creates/resumes the `AudioContext` only when needed.
3. Buffers are decoded against the current context.
4. If a cue cannot play, the app tries to recover the context and retries the cue.
5. A normal app return first tries to resume the existing authorized context. It creates a new context and decodes buffers again only if resume actually fails.
6. WebKit audio operations use a 700 ms bounded timeout so a permanently unresolved `resume()` or `close()` cannot freeze recovery.
7. Focus, pageshow, pagehide, visibility, freeze, audio-session interruption, and context state changes participate in recovery. A harmless window blur no longer marks healthy audio as broken.

### Long-session keep-alive

The latest fix addresses cues disappearing after several silent minutes:

- A 20 Hz oscillator at gain `0.000001` keeps the Web Audio graph active while the timer is running.
- It is effectively inaudible and sub-audible.
- It starts with the running timer, remains active through long silent intervals, and restarts after context recovery.
- It stops on Pause, Reset, Finish, and before replacing an audio context.
- It never runs just because the page is open; it is tied to the running lifecycle.

The root cause was that a 10-minute Wrestle interval could play its opening whistle and then leave Web Audio with no active node for almost 10 minutes. On iOS/WebKit, the later warning and final whistle could then be lost even though the visual timer was still running.

## Timer and Persistence Reliability

Three `localStorage` keys are used:

- `wrestlingWorkoutTimerSettings` - current durations, rounds, and whistle volume.
- `wrestlingWorkoutTimerState` - active phase/index, remaining milliseconds, started/running/done flags, settings, and save timestamp.
- `wrestlingWorkoutSavedTimers` - named reusable presets, including whistle volume.

### Settings and presets

- Settings save immediately when changed.
- A saved timer name is limited to 40 characters.
- Saving the same name again, case-insensitively, updates the existing preset.
- Presets are sorted by most recently used/updated.
- Loading a preset restores its durations, rounds, and whistle volume; presets can also be deleted.
- Clearing browser/site data removes all settings, active state, and saved presets because there is no account or cloud storage.

### Running timer persistence

- The countdown uses a wall-clock target (`Date.now()`), not accumulated animation frames, as its main source of truth.
- State is throttled to local storage about every 500 ms while running and is also saved during unload/suspend events.
- A 500 ms watchdog calls the timer loop in addition to `requestAnimationFrame`. This prevents the timer from appearing paused if Safari drops or stalls animation-frame callbacks.
- When the page returns from being hidden, elapsed wall-clock time is applied across interval boundaries before rendering resumes.
- A reload restores the correct phase and remaining time and keeps the countdown moving.
- Storage failures are caught so a localStorage problem cannot stop the live countdown loop.

### Resume-button bug that was fixed

Seth previously saw the timer randomly stop and switch to Resume. The current implementation keeps `isRunning` true across browser interruptions, reconciles elapsed time on return, and restarts the display loop automatically.

If iOS fully reloads the PWA, the new page has no authorized audio session. In that special case:

- the timer still restores and continues counting;
- the play control still says Pause, not Resume;
- the app shows `Timer running - tap anywhere to restore sound`;
- tapping Play while in this recovery state restores audio without pausing the timer;
- any normal page interaction can also unlock sound.

## Recent Bug and Change History

### `fab0b98` - Fix timer audio recovery

- Reworked the brittle one-context audio path.
- Separated raw audio caching from context-specific decoded buffers.
- Added context recreation and cue retry behavior.
- Added the no-dependency unit and browser test harnesses.
- The final architecture later evolved to Web Audio only; do not restore the temporary HTML-audio fallback idea from early iterations.

### `efe42af` - Unify whistle cues and add volume control

- Changed the phase label from Work to `WRESTLE`.
- Made `rest-horn.m4a` the one whistle for Wrestle, Rest, Finish, manual cue, and Sound Check.
- Added the persisted 25%-200% whistle-volume control.
- Preserved the then-current five-pop 10-second warning; it was replaced by one clapper strike in the later 2026-07-18 local work.

### `c81a759` - Prevent timer from pausing unexpectedly

- Moved countdown truth to wall-clock deadlines.
- Added persistent active timer snapshots and elapsed-time restoration.
- Added the 500 ms watchdog for dropped animation frames.
- Kept the timer running through cold reload audio recovery instead of forcing Resume.

### `41004a5` - Make whistle boost audibly louder

- Replaced the flattening peak-limiter behavior above 100% with soft saturation.
- Added objective browser audio measurements proving 150% and 200% are meaningfully louder than 100% while retaining a safe output ceiling.

### `e7c19e3` - Resume sounds automatically after app return

- Normal app returns now reuse/resume the already authorized audio context automatically.
- Context replacement happens only after resume failure.
- The user should not have to press Resume merely because the app lost focus.

### `76751e9` - Keep sounds active during long workouts

- Added the running-only sub-audible Web Audio keep-alive.
- Added deterministic 10-minute coverage for the late warning and final whistle.
- Added real-browser assertions that the keep-alive remains active while running and stops on pause.
- Updated the production cache key to `app.js?v=20260717-long-audio-keepalive1`.
- Deployed and verified on GitHub Pages.

### `099af26` - Add landscape layout

- Adds a landscape-only, safe-area-aware two-column phone layout.
- Uses fluid `clamp()`/`vmin` timer sizing and a vertical control rail.
- Verifies 667x375, 844x390, and 932x430 with no overflow, scrolling, or overlapping controls.
- Includes a portrait assertion proving the original row console remains active outside landscape.
- Deployed and cache-bypass verified on GitHub Pages as part of the `6a5926b` release.

### `6a5926b` - Replace 10-second warning with clapper

- Replaces the five scheduled pops with one normal-gain CC0 wooden strike.
- Keeps the existing Web Audio prefetch, decode, retry, recovery, and long-session path unchanged.
- Updates Sound Check, deterministic warning coverage, browser coverage, and the `app.js` cache key.
- Deployed and cache-bypass verified on GitHub Pages.

### `3b26d80` - Make 10-second warning a three-clap fight clapper

- Replaces the single-hit #1588 file with the real three-hit #1590 recording while keeping the same `ten-second-clapper.m4a` path and one-buffer playback route.
- The warning still triggers once at 10 seconds remaining, but that one track contains all three rapid wooden strikes.
- Keeps normal gain and the existing prefetch, decode, retry, recovery, keep-alive, and long-session path unchanged.
- Updates Sound Check and automated coverage to verify the complete asset starts once and contains exactly three rapid transients.

### `456f426` - Center landscape timer display

- Uses balanced landscape columns so the enlarged timer remains visually centered without overlapping the control rail.
- Passed browser layout checks at 667x375, 844x390, and 932x430.

### `aebc76e` - Add private native iPhone timer

- Adds the SwiftUI/AVAudioEngine iPhone project under `ios/WrestlingTimer/`.
- The project compiles without signing, but signed installation and physical background-audio testing remain pending.

### `97c9dc8` - Avoid false audio recovery on window blur

- Stops harmless focus loss from marking a healthy Web Audio context as broken.
- Keeps recovery tied to actual suspension, visibility, audio-session, and context-state evidence.
- Deployed and live-file verified on GitHub Pages.

## Validation Already Completed

The latest release passed:

- `npm test` - 11/11 tests.
- `node tests/browser-smoke.js` - passed in real Chrome/Web Audio.
- `git diff --check` before commit.
- Secret-pattern scan before push.
- GitHub push and Pages deployment through `97c9dc8`.
- Fresh cache-bypassed comparison proving the public `app.js` exactly matched local `app.js`.
- Native Xcode compile without signing passed for `aebc76e`; signed device installation remains unverified.

The landscape and original single-hit clapper work passed `npm test` (11/11) and `node tests/browser-smoke.js` before deployment at `6a5926b`.

The 2026-07-18 local three-hit clapper update also passed `npm test` (11/11) and `node tests/browser-smoke.js`. The real-browser test decoded the active M4A, detected exactly three strike transients at approximately 0.048, 0.361, and 0.686 seconds, verified one complete Sound Check start, and retained all existing long-session, recovery, persistence, and landscape assertions.

Automated coverage includes:

- unified short-whistle routing;
- independent persisted whistle volume;
- louder 100%/150%/200% output behavior;
- one 10-minute Wrestle phase reaching one complete three-hit clapper warning and the final whistle;
- running-only keep-alive start/stop lifecycle;
- pause/resume and context replacement;
- normal focus return without replacing a healthy context;
- recoverable interruption and failed/hung resume behavior;
- cold reload while the timer continues;
- dropped animation frames/watchdog behavior;
- audio-session interruption signaling.

## What Is Not Yet Proven

The code, unit tests, desktop Web Audio browser test, and live deployment are verified. A physical 10-minute iPhone run has not yet been reported back as passed.

Do not claim the device-specific sound problem is completely closed until that test is done. If it still fails, first capture:

- Safari tab versus installed Home Screen PWA;
- whether the screen stayed awake;
- whether the timer stayed visibly foregrounded;
- whether Music/podcast audio was playing;
- which cue failed: opening whistle, any of the three 10-second clapper hits, Rest whistle, or final whistle;
- whether the countdown continued and whether an audio recovery notice appeared.

## Platform Boundary

The app is designed for reliable foreground operation and normal app-return recovery.

iOS can suspend PWA Web Audio while the app is truly backgrounded. The visual timer can reconcile elapsed wall time on return, but a static web app cannot guarantee audible cues while fully backgrounded or after the browser kills/reloads the page. A native iOS wrapper is the future path only if background cue playback becomes a hard requirement.

Do not weaken foreground reliability in an attempt to promise unsupported background behavior.

## Important Files

- `AGENTS.md` - project workflow and deployment permission rules.
- `PROJECT_BRIEF.md` - product purpose and open direction decisions.
- `README.md` - concise current status and platform boundary.
- `NEXT_STEPS.md` - current physical iPhone validation checklist.
- `LAPTOP_SETUP.md` - laptop bootstrap, validation, native setup, and machine-switch rules.
- `CLAUDE_HANDOFF.md` - this detailed continuation context.
- `index.html` - UI, settings, PWA metadata, and cache-busted app script.
- `style.css` - mobile-first mat-room UI.
- `app.js` - timer sequence, wall-clock persistence, Web Audio, recovery, volume processing, keep-alive, saved timers, and Wake Lock.
- `manifest.webmanifest` - installable PWA metadata and icons.
- `assets/audio/rest-horn.m4a` - active unified whistle.
- `assets/audio/ten-second-clapper.m4a` - active CC0 three-hit 10-second warning.
- `assets/audio/ten-second-pop.m4a` - retained legacy warning, no longer referenced.
- `tests/audio-lifecycle.test.js` - deterministic timer/audio lifecycle coverage.
- `tests/browser-smoke.js` - real Chrome/Web Audio interaction and loudness coverage.
- `package.json` - `npm test` script only.

## Guardrails for Future Work

- Keep version one static and dependency-free unless Seth explicitly changes direction.
- Make the smallest effective change; preserve the current sound, external-music mixing, timer persistence, and recovery behavior.
- Keep `rest-horn.m4a` as the only whistle unless Seth explicitly asks for another sound.
- Do not bring back hidden looping media or HTML-audio fallbacks that could interrupt Music.
- Do not describe the whistle slider as independent control of another app's Music; it controls this timer's whistle only.
- Any audio change must test long silent intervals, not just immediate button playback.
- Any timer change must test dropped frames, reload restoration, and app-return behavior.
- Bump the `app.js` cache query in `index.html` when production JavaScript behavior changes.
- Before publishing: review exact scope, run `npm test` and the browser smoke test, scan for secrets, dry-run the push, then verify GitHub Pages directly.
- Do not add Cloudways, accounts, payments, or a backend without explicit direction.

## Open Product Question

Should this remain a personal tool, become a public product, or support a larger wrestling-training funnel? This does not block current reliability work.

## Single Best Next Step

Run this five-part check on the actual iPhone:

1. Play Music or a podcast, use Sound Check at 100%, 150%, and 200%, and confirm every step above 100% is clearly louder without stopping the other audio.
2. Run one full 10-minute Wrestle interval and confirm the opening whistle, all three rapid clapper hits, and final whistle all sound.
3. Leave the running timer and return; confirm sound resumes automatically and the control never changes to Resume.
4. If iOS reloads the app, confirm the countdown keeps moving with the recovery notice, then tap once and confirm sound returns without pausing the timer.
5. Repeat the leave/return cycle twice.

## Notes for Claude

Advise Seth in direct, plain English. Lead with the concrete result or blocker. Treat the current implementation as a reliability-focused foreground PWA, not as proof of fully background-capable iOS audio.
