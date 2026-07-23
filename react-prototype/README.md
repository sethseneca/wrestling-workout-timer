# React Timer Prototype

This folder contains an isolated React implementation of the Wrestling Workout Timer interface. It does not replace or modify the existing vanilla PWA or native iPhone project.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The timer renders only when the viewport is wider than it is tall; portrait viewports show a rotate-device gate instead of a vertical timer.

## Component

`src/WrestlingWorkoutTimer.jsx` exports the reusable component. Its optional props are:

- `initialPhase`: `READY`, `WRESTLE`, or `REST`.
- `initialRound`: starting round number.
- `totalRounds`: total number of rounds.
- `championshipFinalRound`: uses the gold Championship treatment for the final Wrestle round.
- `onReset`, `onPrevious`, `onNext`, `onPlayStateChange`, `onVolumeToggle`: integration callbacks.

The prototype includes functional Reset, Previous, Play/Pause, Next, and Mute controls. Its phase durations are intentionally small defaults for visual review; production duration settings and audio can be connected through the callback props.
