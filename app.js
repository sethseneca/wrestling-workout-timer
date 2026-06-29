(function () {
  "use strict";

  var STORAGE_KEY = "wrestlingWorkoutTimerSettings";
  var DEFAULTS = {
    workSeconds: 30,
    restSeconds: 15,
    readySeconds: 10,
    rounds: 8
  };

  var app = document.getElementById("app");
  var countdownEl = document.getElementById("countdown");
  var phaseLabelEl = document.getElementById("phaseLabel");
  var roundCounterEl = document.getElementById("roundCounter");
  var runStatusEl = document.getElementById("runStatus");
  var startButton = document.getElementById("startButton");
  var pauseButton = document.getElementById("pauseButton");
  var skipButton = document.getElementById("skipButton");
  var resetButton = document.getElementById("resetButton");
  var settingsForm = document.getElementById("settingsForm");

  var inputs = {
    workMinutes: document.getElementById("workMinutes"),
    workSeconds: document.getElementById("workSeconds"),
    restMinutes: document.getElementById("restMinutes"),
    restSeconds: document.getElementById("restSeconds"),
    readyMinutes: document.getElementById("readyMinutes"),
    readySeconds: document.getElementById("readySeconds"),
    rounds: document.getElementById("rounds")
  };

  var state = {
    settings: loadSettings(),
    sequence: [],
    currentIndex: 0,
    remainingMs: 0,
    targetTime: 0,
    rafId: 0,
    isRunning: false,
    hasStarted: false,
    isDone: false,
    audioContext: null,
    wakeLock: null,
    countdownBeeps: {}
  };

  writeSettingsToInputs(state.settings);
  resetTimer(false);

  document.addEventListener("pointerdown", unlockAudio, { once: true });
  startButton.addEventListener("click", handleStart);
  pauseButton.addEventListener("click", handlePauseResume);
  resetButton.addEventListener("click", function () {
    resetTimer(true);
  });
  skipButton.addEventListener("click", handleSkip);
  settingsForm.addEventListener("input", handleSettingsInput);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  function loadSettings() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return normalizeSettings(Object.assign({}, DEFAULTS, stored || {}));
    } catch (error) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function normalizeSettings(settings) {
    return {
      workSeconds: clamp(toNumber(settings.workSeconds, DEFAULTS.workSeconds), 1, 3599),
      restSeconds: clamp(toNumber(settings.restSeconds, DEFAULTS.restSeconds), 0, 3599),
      readySeconds: clamp(toNumber(settings.readySeconds, DEFAULTS.readySeconds), 0, 3599),
      rounds: clamp(toNumber(settings.rounds, DEFAULTS.rounds), 1, 99)
    };
  }

  function readSettingsFromInputs() {
    return normalizeSettings({
      workSeconds: readDuration("work"),
      restSeconds: readDuration("rest"),
      readySeconds: readDuration("ready"),
      rounds: inputs.rounds.value
    });
  }

  function readDuration(prefix) {
    var minutes = toNumber(inputs[prefix + "Minutes"].value, 0);
    var seconds = toNumber(inputs[prefix + "Seconds"].value, 0);
    return minutes * 60 + seconds;
  }

  function writeSettingsToInputs(settings) {
    writeDuration("work", settings.workSeconds);
    writeDuration("rest", settings.restSeconds);
    writeDuration("ready", settings.readySeconds);
    inputs.rounds.value = settings.rounds;
  }

  function writeDuration(prefix, totalSeconds) {
    inputs[prefix + "Minutes"].value = Math.floor(totalSeconds / 60);
    inputs[prefix + "Seconds"].value = totalSeconds % 60;
  }

  function handleSettingsInput() {
    state.settings = readSettingsFromInputs();
    saveSettings(state.settings);

    if (!state.isRunning && !state.hasStarted) {
      resetTimer(false);
    }
  }

  function buildSequence(settings) {
    var sequence = [];

    if (settings.readySeconds > 0) {
      sequence.push({
        phase: "ready",
        label: "GET READY",
        duration: settings.readySeconds,
        round: 1
      });
    }

    for (var round = 1; round <= settings.rounds; round += 1) {
      sequence.push({
        phase: "work",
        label: "WORK",
        duration: settings.workSeconds,
        round: round
      });

      if (round < settings.rounds && settings.restSeconds > 0) {
        sequence.push({
          phase: "rest",
          label: "REST",
          duration: settings.restSeconds,
          round: round
        });
      }
    }

    return sequence;
  }

  function handleStart() {
    unlockAudio();

    if (state.isDone) {
      resetTimer(false);
    }

    if (!state.hasStarted) {
      state.settings = readSettingsFromInputs();
      saveSettings(state.settings);
      state.sequence = buildSequence(state.settings);
      state.currentIndex = 0;
      setCurrentStep(0, null);
      state.hasStarted = true;
      state.isDone = false;
    }

    startRunning();
  }

  function handlePauseResume() {
    unlockAudio();

    if (!state.hasStarted || state.isDone) {
      return;
    }

    if (state.isRunning) {
      pauseRunning();
    } else {
      startRunning();
    }
  }

  function handleSkip() {
    unlockAudio();

    if (state.isDone) {
      return;
    }

    if (!state.hasStarted) {
      state.settings = readSettingsFromInputs();
      saveSettings(state.settings);
      state.sequence = buildSequence(state.settings);
      state.currentIndex = 0;
      state.hasStarted = true;
    }

    advanceInterval(true);
  }

  function startRunning() {
    if (state.isRunning || state.isDone) {
      return;
    }

    cancelAnimationFrame(state.rafId);
    state.isRunning = true;
    state.targetTime = performance.now() + state.remainingMs;
    requestWakeLock();
    tick();
    updateControls();
  }

  function pauseRunning() {
    state.remainingMs = Math.max(0, state.targetTime - performance.now());
    state.isRunning = false;
    cancelAnimationFrame(state.rafId);
    releaseWakeLock();
    updateDisplay();
    updateControls();
  }

  function resetTimer(shouldSave) {
    cancelAnimationFrame(state.rafId);
    releaseWakeLock();

    state.settings = readSettingsFromInputs();

    if (shouldSave) {
      saveSettings(state.settings);
    }

    state.sequence = buildSequence(state.settings);
    state.currentIndex = 0;
    state.hasStarted = false;
    state.isRunning = false;
    state.isDone = false;
    setCurrentStep(0, null);
    updateControls();
  }

  function setCurrentStep(index, previousPhase) {
    var step = state.sequence[index];

    if (!step) {
      finishWorkout();
      return;
    }

    state.currentIndex = index;
    state.remainingMs = step.duration * 1000;
    state.countdownBeeps = {};
    updateDisplay();

    if (isWorkRestTransition(previousPhase, step.phase)) {
      playTransitionTone();
    }

    if (state.isRunning) {
      state.targetTime = performance.now() + state.remainingMs;
    }
  }

  function tick() {
    if (!state.isRunning) {
      return;
    }

    state.remainingMs = Math.max(0, state.targetTime - performance.now());
    maybePlayCountdownBeep();
    updateDisplay();

    if (state.remainingMs <= 0) {
      advanceInterval(false);
      return;
    }

    state.rafId = requestAnimationFrame(tick);
  }

  function advanceInterval(wasSkipped) {
    var previousStep = state.sequence[state.currentIndex];
    var previousPhase = previousStep ? previousStep.phase : null;

    cancelAnimationFrame(state.rafId);

    if (wasSkipped) {
      state.remainingMs = 0;
    }

    if (state.currentIndex >= state.sequence.length - 1) {
      finishWorkout();
      return;
    }

    setCurrentStep(state.currentIndex + 1, previousPhase);

    if (state.isRunning) {
      tick();
    } else {
      updateControls();
    }
  }

  function finishWorkout() {
    cancelAnimationFrame(state.rafId);
    releaseWakeLock();
    state.isRunning = false;
    state.hasStarted = true;
    state.isDone = true;
    state.remainingMs = 0;
    state.countdownBeeps = {};
    app.className = "app phase-done";
    phaseLabelEl.textContent = "DONE";
    countdownEl.textContent = "00:00";
    roundCounterEl.textContent = "Round " + state.settings.rounds + " of " + state.settings.rounds;
    runStatusEl.textContent = "Done";
    playFinishTone();
    updateControls();
  }

  function updateDisplay() {
    var step = state.sequence[state.currentIndex];
    var phase = step ? step.phase : "done";
    var label = step ? step.label : "DONE";
    var round = step ? step.round : state.settings.rounds;

    app.className = "app phase-" + phase;
    phaseLabelEl.textContent = label;
    countdownEl.textContent = formatTime(Math.ceil(state.remainingMs / 1000));
    roundCounterEl.textContent = "Round " + round + " of " + state.settings.rounds;
    runStatusEl.textContent = state.isRunning ? "Running" : state.hasStarted ? "Paused" : "Ready";
  }

  function updateControls() {
    startButton.disabled = state.isRunning;
    pauseButton.disabled = !state.hasStarted || state.isDone;
    pauseButton.textContent = state.isRunning ? "Pause" : "Resume";
    skipButton.disabled = state.isDone;
    runStatusEl.textContent = state.isDone ? "Done" : state.isRunning ? "Running" : state.hasStarted ? "Paused" : "Ready";
  }

  function maybePlayCountdownBeep() {
    var secondsRemaining = Math.ceil(state.remainingMs / 1000);

    if (secondsRemaining >= 1 && secondsRemaining <= 3 && !state.countdownBeeps[secondsRemaining]) {
      state.countdownBeeps[secondsRemaining] = true;
      playCountdownTone(secondsRemaining);
    }
  }

  function unlockAudio() {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return;
    }

    if (!state.audioContext) {
      var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContextConstructor();
    }

    if (state.audioContext.state === "suspended") {
      state.audioContext.resume();
    }
  }

  function playTone(frequency, duration, volume, type) {
    unlockAudio();

    if (!state.audioContext || state.audioContext.state === "suspended") {
      return;
    }

    var now = state.audioContext.currentTime;
    var oscillator = state.audioContext.createOscillator();
    var gain = state.audioContext.createGain();

    oscillator.type = type || "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(state.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function playCountdownTone(secondsRemaining) {
    playTone(secondsRemaining === 1 ? 920 : 760, 0.12, 0.35, "square");
  }

  function playTransitionTone() {
    playTone(620, 0.16, 0.38, "square");
  }

  function playFinishTone() {
    playTone(440, 0.28, 0.35, "sine");
    window.setTimeout(function () {
      playTone(660, 0.34, 0.35, "sine");
    }, 180);
  }

  function isWorkRestTransition(previousPhase, nextPhase) {
    return (previousPhase === "work" && nextPhase === "rest") || (previousPhase === "rest" && nextPhase === "work");
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || state.wakeLock) {
      return;
    }

    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", function () {
        state.wakeLock = null;
      });
    } catch (error) {
      state.wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!state.wakeLock) {
      return;
    }

    try {
      await state.wakeLock.release();
    } catch (error) {
      state.wakeLock = null;
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && state.isRunning) {
      requestWakeLock();
    }
  }

  function formatTime(totalSeconds) {
    var seconds = Math.max(0, totalSeconds);
    var minutes = Math.floor(seconds / 60);
    var remainder = seconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function toNumber(value, fallback) {
    var parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
