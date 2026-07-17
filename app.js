(function () {
  "use strict";

  var SETTINGS_KEY = "wrestlingWorkoutTimerSettings";
  var TIMER_STATE_KEY = "wrestlingWorkoutTimerState";
  var SAVED_TIMERS_KEY = "wrestlingWorkoutSavedTimers";
  var AUDIO_FILES = {
    whistle: [
      { src: "assets/audio/rest-horn.m4a?v=20260717-unified-whistle1", type: "audio/mp4" }
    ],
    tenSecondPop: [
      { src: "assets/audio/ten-second-pop.m4a?v=20260630-console9", type: "audio/mp4" }
    ]
  };
  var DEFAULTS = {
    workSeconds: 30,
    restSeconds: 15,
    readySeconds: 10,
    rounds: 8,
    whistleVolume: 150
  };
  var AUDIO_OPERATION_TIMEOUT_MS = 700;
  var TICK_WATCHDOG_MS = 500;
  var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  var audioCtx = null;

  var app = document.getElementById("app");
  var kickerEl = document.querySelector(".kicker");
  var countdownEl = document.getElementById("countdown");
  var phaseLabelEl = document.getElementById("phaseLabel");
  var roundCounterEl = document.getElementById("roundCounter");
  var startButton = document.getElementById("startButton");
  var playButtonLabel = document.getElementById("playButtonLabel");
  var skipBackButton = document.getElementById("skipBackButton");
  var skipButton = document.getElementById("skipButton");
  var resetButton = document.getElementById("resetButton");
  var manualCuesEl = document.getElementById("manualCues");
  var settingsForm = document.getElementById("settingsForm");
  var timerNameInput = document.getElementById("timerName");
  var saveTimerButton = document.getElementById("saveTimerButton");
  var savedTimerList = document.getElementById("savedTimerList");
  var soundCheckEl = document.getElementById("soundCheck");
  var audioResumeNotice = document.getElementById("audioResumeNotice");
  var settingsToggleButton = document.getElementById("settingsToggleButton");
  var settingsCloseButton = document.getElementById("settingsCloseButton");
  var settingsPanel = document.getElementById("settingsPanel");
  var settingsScrim = document.getElementById("settingsScrim");
  var whistleVolumeValue = document.getElementById("whistleVolumeValue");

  var inputs = {
    workMinutes: document.getElementById("workMinutes"),
    workSeconds: document.getElementById("workSeconds"),
    restMinutes: document.getElementById("restMinutes"),
    restSeconds: document.getElementById("restSeconds"),
    readyMinutes: document.getElementById("readyMinutes"),
    readySeconds: document.getElementById("readySeconds"),
    rounds: document.getElementById("rounds"),
    whistleVolume: document.getElementById("whistleVolume")
  };

  var state = {
    settings: loadSettings(),
    sequence: [],
    currentIndex: 0,
    remainingMs: 0,
    targetTime: 0,
    targetWallTime: 0,
    rafId: 0,
    tickTimeoutId: 0,
    isRunning: false,
    hasStarted: false,
    isDone: false,
    restoredRunningWithoutAudio: false,
    audioContext: null,
    audioBuffers: {},
    audioBufferPromises: {},
    audioData: {},
    audioDataPromises: {},
    audioReadyPromise: null,
    audioUnlocked: false,
    audioNeedsRecovery: false,
    audioRecoveryPromise: null,
    audioSessionListening: false,
    scheduledCueNodes: [],
    tenSecondWarningKey: null,
    wakeLock: null,
    savedTimers: [],
    lastStateSave: 0,
    hiddenAt: 0
  };

  var maskTargets = [
    kickerEl,
    settingsToggleButton,
    phaseLabelEl,
    countdownEl,
    roundCounterEl
  ];

  setupElementMasks();

  writeSettingsToInputs(state.settings);
  state.savedTimers = loadSavedTimers();
  preventAppZoom();

  if (!restoreTimerState()) {
    resetTimer(false);
  }

  renderSavedTimers();
  configureAudioSession();
  primeAudioData();

  function setupElementMasks() {
    kickerEl.dataset.maskText = kickerEl.textContent;
    phaseLabelEl.dataset.maskText = phaseLabelEl.textContent;
    countdownEl.dataset.maskText = countdownEl.textContent;
    roundCounterEl.dataset.maskText = roundCounterEl.textContent;

    [kickerEl, phaseLabelEl, countdownEl, roundCounterEl].forEach(function (element) {
      element.classList.add("mask-text");
    });

    settingsToggleButton.classList.add("mask-icon");
    settingsToggleButton.querySelectorAll("svg").forEach(function (svg) {
      var clone = svg.cloneNode(true);
      clone.classList.add("mask-svg");
      clone.setAttribute("aria-hidden", "true");
      settingsToggleButton.appendChild(clone);
    });

    updateElementMasks();
  }

  function syncMaskText(element, text) {
    element.dataset.maskText = text;
  }

  function updateElementMasks() {
    var elapsed = parseFloat(getComputedStyle(app).getPropertyValue("--drain-pct")) || 0;
    var appRect = app.getBoundingClientRect();
    var lineY = appRect.top + appRect.height * clamp(elapsed / 100, 0, 1);

    maskTargets.forEach(function (element) {
      if (!element) {
        return;
      }

      var rect = element.getBoundingClientRect();
      var maskTop = rect.height > 0 ? clamp((lineY - rect.top) / rect.height, 0, 1) * 100 : 100;
      element.style.setProperty("--mask-top", maskTop.toFixed(3) + "%");
    });
  }

  document.addEventListener("pointerdown", handleAudioInteraction, { passive: true });
  document.addEventListener("touchstart", handleAudioInteraction, { passive: true });
  document.addEventListener("click", handleAudioInteraction);
  document.addEventListener("keydown", handleAudioInteraction);
  startButton.addEventListener("click", handlePlayPause);
  resetButton.addEventListener("click", function () {
    resetTimer(true);
  });
  skipBackButton.addEventListener("click", handleSkipBack);
  skipButton.addEventListener("click", handleSkip);
  manualCuesEl.addEventListener("click", handleManualCueClick);
  settingsToggleButton.addEventListener("click", openSettingsPanel);
  settingsCloseButton.addEventListener("click", closeSettingsPanel);
  settingsScrim.addEventListener("click", closeSettingsPanel);
  saveTimerButton.addEventListener("click", handleSaveTimer);
  settingsForm.addEventListener("click", handleSettingsStepperClick);
  settingsForm.addEventListener("input", handleSettingsInput);
  savedTimerList.addEventListener("click", handleSavedTimerClick);
  soundCheckEl.addEventListener("click", handleSoundCheckClick);
  window.addEventListener("beforeunload", saveTimerState);
  window.addEventListener("blur", markAudioForRecovery);
  window.addEventListener("focus", handleAppReturn);
  window.addEventListener("pageshow", handleAppReturn);
  window.addEventListener("resize", updateElementMasks);
  window.addEventListener("orientationchange", updateElementMasks);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(updateElementMasks);
  }
  window.addEventListener("pagehide", handlePageSuspend);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("freeze", handlePageSuspend);
  document.addEventListener("keydown", handleGlobalKeydown);

  function preventAppZoom() {
    var lastTouchEnd = 0;

    document.addEventListener("touchend", function (event) {
      var now = Date.now();

      if (now - lastTouchEnd <= 320) {
        event.preventDefault();
      }

      lastTouchEnd = now;
    }, { passive: false });

    document.addEventListener("dblclick", function (event) {
      event.preventDefault();
    }, { passive: false });

    ["gesturestart", "gesturechange", "gestureend"].forEach(function (eventName) {
      document.addEventListener(eventName, function (event) {
        event.preventDefault();
      }, { passive: false });
    });
  }

  function openSettingsPanel() {
    settingsPanel.classList.add("is-open");
    settingsPanel.setAttribute("aria-hidden", "false");
    settingsPanel.removeAttribute("inert");
    settingsToggleButton.setAttribute("aria-expanded", "true");
    settingsScrim.hidden = false;
    settingsCloseButton.focus({ preventScroll: true });
  }

  function closeSettingsPanel() {
    settingsPanel.classList.remove("is-open");
    settingsPanel.setAttribute("aria-hidden", "true");
    settingsPanel.setAttribute("inert", "");
    settingsToggleButton.setAttribute("aria-expanded", "false");
    settingsScrim.hidden = true;
    settingsToggleButton.focus({ preventScroll: true });
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape" && settingsPanel.classList.contains("is-open")) {
      closeSettingsPanel();
    }
  }

  function loadSettings() {
    try {
      var stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      return normalizeSettings(Object.assign({}, DEFAULTS, stored || {}));
    } catch (error) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function normalizeSettings(settings) {
    return {
      workSeconds: clamp(toNumber(settings.workSeconds, DEFAULTS.workSeconds), 1, 3599),
      restSeconds: clamp(toNumber(settings.restSeconds, DEFAULTS.restSeconds), 0, 3599),
      readySeconds: clamp(toNumber(settings.readySeconds, DEFAULTS.readySeconds), 0, 3599),
      rounds: clamp(toNumber(settings.rounds, DEFAULTS.rounds), 1, 99),
      whistleVolume: clamp(toNumber(settings.whistleVolume, DEFAULTS.whistleVolume), 25, 200)
    };
  }

  function readSettingsFromInputs() {
    return normalizeSettings({
      workSeconds: readDuration("work"),
      restSeconds: readDuration("rest"),
      readySeconds: readDuration("ready"),
      rounds: inputs.rounds.value,
      whistleVolume: inputs.whistleVolume.value
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
    inputs.whistleVolume.value = settings.whistleVolume;
    updateWhistleVolumeValue(settings.whistleVolume);
  }

  function writeDuration(prefix, totalSeconds) {
    inputs[prefix + "Minutes"].value = Math.floor(totalSeconds / 60);
    inputs[prefix + "Seconds"].value = totalSeconds % 60;
  }

  function handleSettingsInput() {
    state.settings = readSettingsFromInputs();
    updateWhistleVolumeValue(state.settings.whistleVolume);
    saveSettings(state.settings);

    if (!state.isRunning && !state.hasStarted) {
      resetTimer(false);
    } else {
      saveTimerState();
    }
  }

  function updateWhistleVolumeValue(volume) {
    whistleVolumeValue.textContent = Math.round(volume) + "%";
  }

  function handleSettingsStepperClick(event) {
    var button = event.target.closest("[data-stepper-target]");
    if (!button) {
      return;
    }

    var target = inputs[button.dataset.stepperTarget];
    if (!target) {
      return;
    }

    var delta = toNumber(button.dataset.stepperDelta, 0);
    var min = toNumber(target.min, 0);
    var max = toNumber(target.max, 99);
    var current = toNumber(target.value, min);
    target.value = clamp(current + delta, min, max);
    target.dispatchEvent(new Event("input", { bubbles: true }));
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
        label: "WRESTLE",
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

  async function handlePlayPause() {
    if (state.isRunning && state.restoredRunningWithoutAudio) {
      if (await prepareAudioForTimer()) {
        state.restoredRunningWithoutAudio = false;
      }
      return;
    }

    if (state.hasStarted && !state.isDone) {
      await handlePauseResume();
      return;
    }

    await handleStart();
  }

  async function handleStart() {
    if (!await prepareAudioForTimer()) {
      return;
    }

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

  async function handlePauseResume() {
    if (!state.hasStarted || state.isDone) {
      return;
    }

    if (state.isRunning) {
      pauseRunning();
      return;
    }

    if (!await prepareAudioForTimer()) {
      return;
    }

    startRunning();
  }

  async function handleSkip() {
    if (!await prepareAudioForTimer()) {
      return;
    }

    if (state.isDone) {
      return;
    }

    if (!state.hasStarted) {
      state.settings = readSettingsFromInputs();
      saveSettings(state.settings);
      state.sequence = buildSequence(state.settings);
      state.currentIndex = 0;
      state.remainingMs = state.sequence[0] ? state.sequence[0].duration * 1000 : 0;
      state.hasStarted = true;
    }

    advanceInterval(true);
  }

  async function handleSkipBack() {
    if (!await prepareAudioForTimer()) {
      return;
    }

    if (state.isDone) {
      resetTimer(false);
      return;
    }

    if (!state.hasStarted) {
      state.settings = readSettingsFromInputs();
      saveSettings(state.settings);
      state.sequence = buildSequence(state.settings);
      state.currentIndex = 0;
      state.remainingMs = state.sequence[0] ? state.sequence[0].duration * 1000 : 0;
      state.hasStarted = true;
    }

    retreatInterval();
  }

  function startRunning() {
    if (state.isRunning || state.isDone) {
      return;
    }

    clearTickSchedule();
    clearScheduledCues();
    hideAudioResumeNotice();
    state.restoredRunningWithoutAudio = false;
    state.isRunning = true;
    state.targetTime = performance.now() + state.remainingMs;
    state.targetWallTime = Date.now() + state.remainingMs;
    playCurrentStepStartCue(null);
    requestWakeLock();
    tick();
    updateControls();
    saveTimerState();
  }

  function pauseRunning() {
    state.remainingMs = getRunningRemainingMs();
    state.isRunning = false;
    state.restoredRunningWithoutAudio = false;
    clearTickSchedule();
    clearScheduledCues();
    releaseWakeLock();
    updateDisplay();
    updateControls();
    saveTimerState();
  }

  function resetTimer(shouldSave) {
    clearTickSchedule();
    clearScheduledCues();
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
    state.restoredRunningWithoutAudio = false;
    state.tenSecondWarningKey = null;
    hideAudioResumeNotice();
    setCurrentStep(0, null);
    updateControls();
    saveTimerState();
  }

  function setCurrentStep(index, previousPhase) {
    var step = state.sequence[index];

    if (!step) {
      finishWorkout(true);
      return;
    }

    state.currentIndex = index;
    state.remainingMs = step.duration * 1000;
    state.tenSecondWarningKey = null;
    updateDisplay();

    if (state.isRunning) {
      state.targetTime = performance.now() + state.remainingMs;
      state.targetWallTime = Date.now() + state.remainingMs;
      playCurrentStepStartCue(previousPhase);
    }

    saveTimerState();
  }

  function tick() {
    clearTickSchedule();

    if (!state.isRunning) {
      return;
    }

    if (document.visibilityState === "hidden") {
      return;
    }

    scheduleNextTick();

    state.remainingMs = getRunningRemainingMs();
    updateDisplay();
    saveTimerStateThrottled();

    try {
      maybePlayTenSecondWarning();
    } catch (error) {
      markAudioForRecovery();
    }

    if (state.remainingMs <= 0) {
      advanceInterval(false);
      return;
    }
  }

  function scheduleNextTick() {
    state.rafId = requestAnimationFrame(tick);
    state.tickTimeoutId = window.setTimeout(tick, TICK_WATCHDOG_MS);
  }

  function clearTickSchedule() {
    cancelAnimationFrame(state.rafId);
    window.clearTimeout(state.tickTimeoutId);
    state.rafId = 0;
    state.tickTimeoutId = 0;
  }

  function advanceInterval(wasSkipped) {
    var previousStep = state.sequence[state.currentIndex];
    var previousPhase = previousStep ? previousStep.phase : null;

    clearTickSchedule();
    clearScheduledCues();

    if (wasSkipped) {
      state.remainingMs = 0;
    }

    if (state.currentIndex >= state.sequence.length - 1) {
      finishWorkout(true);
      return;
    }

    setCurrentStep(state.currentIndex + 1, previousPhase);

    if (state.isRunning) {
      tick();
    } else {
      updateControls();
    }
  }

  function retreatInterval() {
    var nextStep = state.sequence[state.currentIndex];
    var nextPhase = nextStep ? nextStep.phase : null;

    clearTickSchedule();
    clearScheduledCues();

    if (state.currentIndex <= 0) {
      setCurrentStep(0, null);
    } else {
      setCurrentStep(state.currentIndex - 1, nextPhase);
    }

    if (state.isRunning) {
      tick();
    } else {
      updateControls();
    }
  }

  function finishWorkout(shouldPlayTone) {
    clearTickSchedule();
    clearScheduledCues();
    releaseWakeLock();
    state.isRunning = false;
    state.hasStarted = true;
    state.isDone = true;
    state.restoredRunningWithoutAudio = false;
    state.remainingMs = 0;
    app.className = "app phase-done";
    app.style.setProperty("--drain-pct", "100%");
    phaseLabelEl.textContent = "DONE";
    syncMaskText(phaseLabelEl, "DONE");
    setCountdownTime(0);
    roundCounterEl.textContent = "Round " + state.settings.rounds + " of " + state.settings.rounds;
    syncMaskText(roundCounterEl, roundCounterEl.textContent);
    updateElementMasks();
    if (shouldPlayTone) {
      playFinishWhistle();
    }
    updateControls();
    saveTimerState();
  }

  function updateDisplay() {
    var step = state.sequence[state.currentIndex];
    var phase = step ? step.phase : "done";
    var label = step ? step.label : "DONE";
    var round = step ? step.round : state.settings.rounds;

    app.className = "app phase-" + phase;
    phaseLabelEl.textContent = label;
    syncMaskText(phaseLabelEl, label);
    setCountdownTime(Math.ceil(state.remainingMs / 1000));
    updateDrainProgress(step);
    roundCounterEl.textContent = "Round " + round + " of " + state.settings.rounds;
    syncMaskText(roundCounterEl, roundCounterEl.textContent);
    updateElementMasks();
  }

  function updateDrainProgress(step) {
    var totalMs = step && step.duration ? step.duration * 1000 : 0;
    var elapsed = totalMs > 0 ? clamp(1 - state.remainingMs / totalMs, 0, 1) : 1;
    app.style.setProperty("--drain-pct", (elapsed * 100).toFixed(3) + "%");
    updateElementMasks();
  }

  function updateControls() {
    startButton.disabled = false;
    startButton.classList.toggle("is-running", state.isRunning);
    startButton.setAttribute("aria-label", state.isRunning ? "Pause timer" : state.hasStarted && !state.isDone ? "Resume timer" : "Start timer");
    playButtonLabel.textContent = state.isRunning ? "Pause" : state.hasStarted && !state.isDone ? "Resume" : "Start";
    skipBackButton.disabled = state.isDone || (!state.hasStarted && !state.sequence.length);
    skipButton.disabled = state.isDone;
  }

  function getRunningRemainingMs() {
    if (!state.isRunning) {
      return state.remainingMs;
    }

    if (state.targetWallTime) {
      return Math.max(0, state.targetWallTime - Date.now());
    }

    return Math.max(0, state.targetTime - performance.now());
  }

  function configureAudioSession() {
    if (!("audioSession" in navigator) || !navigator.audioSession) {
      return;
    }

    try {
      // Ambient audio mixes the timer cues with Music, podcasts, and other apps.
      navigator.audioSession.type = "ambient";
    } catch (error) {
      // Older WebKit builds expose no configurable audio session.
    }

    if (!state.audioSessionListening && typeof navigator.audioSession.addEventListener === "function") {
      navigator.audioSession.addEventListener("statechange", handleAudioSessionStateChange);
      state.audioSessionListening = true;
    }
  }

  function handleAudioSessionStateChange() {
    if (!navigator.audioSession || navigator.audioSession.state !== "interrupted") {
      return;
    }

    markAudioForRecovery();
  }

  function handleAudioContextStateChange(event) {
    var audioContext = event && event.target ? event.target : state.audioContext;

    if (audioContext !== state.audioContext) {
      return;
    }

    if (audioContext.state === "interrupted" || audioContext.state === "closed") {
      markAudioForRecovery();
    }
  }

  function markAudioForRecovery() {
    if (state.audioUnlocked) {
      state.audioNeedsRecovery = true;
    }
  }

  function handleAudioInteraction(event) {
    var usedPlayButton = Boolean(
      event &&
      event.target &&
      (event.target === startButton ||
        (typeof event.target.closest === "function" && event.target.closest("#startButton")))
    );

    unlockAudio().then(function (ready) {
      if (!ready) {
        return;
      }

      hideAudioResumeNotice();

      if (state.restoredRunningWithoutAudio && !usedPlayButton) {
        state.restoredRunningWithoutAudio = false;
      }
    });
  }

  async function prepareAudioForTimer() {
    var isReady = await unlockAudio();

    if (!isReady) {
      showAudioResumeNotice("Tap play again to restore sound");
      return false;
    }

    hideAudioResumeNotice();
    return true;
  }

  function showAudioResumeNotice(message) {
    audioResumeNotice.textContent = message || "Tap play to resume with sound";
    audioResumeNotice.hidden = false;
  }

  function hideAudioResumeNotice() {
    audioResumeNotice.hidden = true;
  }

  function createAudioContext() {
    if (!AudioContextConstructor) {
      return null;
    }

    if (!audioCtx || audioCtx.state === "closed") {
      try {
        audioCtx = new AudioContextConstructor({ latencyHint: "interactive" });
      } catch (error) {
        try {
          audioCtx = new AudioContextConstructor();
        } catch (constructorError) {
          return null;
        }
      }

      audioCtx.onstatechange = handleAudioContextStateChange;
      resetDecodedAudioBuffers();
    }

    state.audioContext = audioCtx;
    return state.audioContext;
  }

  async function unlockAudio() {
    state.audioUnlocked = true;
    configureAudioSession();
    return recoverAudioForPlayback(state.audioNeedsRecovery);
  }

  async function resumeAudioContext() {
    var audioContext = createAudioContext();

    if (!audioContext) {
      return false;
    }

    if (audioContext.state === "running") {
      return true;
    }

    try {
      var didSettle = await settleAudioOperation(audioContext.resume());
      return didSettle && audioContext === state.audioContext && audioContext.state === "running";
    } catch (error) {
      return false;
    }
  }

  async function ensureAudioReady() {
    if (!createAudioContext()) {
      return false;
    }

    if (!await resumeAudioContext()) {
      return false;
    }

    return primeAudioBuffers();
  }

  function settleAudioOperation(operation) {
    if (!operation || typeof operation.then !== "function") {
      return Promise.resolve(true);
    }

    return new Promise(function (resolve) {
      var didFinish = false;
      var timeoutId = window.setTimeout(function () {
        if (!didFinish) {
          didFinish = true;
          resolve(false);
        }
      }, AUDIO_OPERATION_TIMEOUT_MS);

      operation.then(function () {
        if (!didFinish) {
          didFinish = true;
          window.clearTimeout(timeoutId);
          resolve(true);
        }
      }).catch(function () {
        if (!didFinish) {
          didFinish = true;
          window.clearTimeout(timeoutId);
          resolve(false);
        }
      });
    });
  }

  function primeAudioBuffers() {
    if (!createAudioContext() || !window.fetch) {
      return Promise.resolve(false);
    }

    if (!state.audioReadyPromise) {
      state.audioReadyPromise = Promise.all(Object.keys(AUDIO_FILES).map(function (name) {
        return loadAudioBuffer(name);
      })).then(function (audioBuffers) {
        var isReady = audioBuffers.every(function (audioBuffer) {
          return Boolean(audioBuffer);
        });

        if (!isReady) {
          state.audioReadyPromise = null;
        }

        return isReady;
      }).catch(function () {
        state.audioReadyPromise = null;
        return false;
      });
    }

    return state.audioReadyPromise;
  }

  function primeAudioData() {
    if (!window.fetch) {
      return Promise.resolve(false);
    }

    return Promise.all(Object.keys(AUDIO_FILES).map(function (name) {
      return loadAudioData(name);
    })).then(function (audioData) {
      return audioData.every(function (arrayBuffer) {
        return Boolean(arrayBuffer);
      });
    }).catch(function () {
      return false;
    });
  }

  function loadAudioBuffer(name) {
    if (state.audioBuffers[name]) {
      return Promise.resolve(state.audioBuffers[name]);
    }

    if (state.audioBufferPromises[name]) {
      return state.audioBufferPromises[name];
    }

    if (!state.audioContext || !window.fetch) {
      return Promise.resolve(null);
    }

    var audioContext = state.audioContext;

    state.audioBufferPromises[name] = loadAudioData(name)
      .then(function (arrayBuffer) {
        if (!arrayBuffer || audioContext.state === "closed") {
          return null;
        }

        return audioContext.decodeAudioData(arrayBuffer.slice(0));
      })
      .then(function (audioBuffer) {
        if (audioContext !== state.audioContext) {
          delete state.audioBufferPromises[name];
          return loadAudioBuffer(name);
        }

        state.audioBuffers[name] = audioBuffer;
        return audioBuffer;
      })
      .catch(function () {
        delete state.audioBufferPromises[name];
        return null;
      });

    return state.audioBufferPromises[name];
  }

  function loadAudioData(name) {
    if (state.audioData[name]) {
      return Promise.resolve(state.audioData[name]);
    }

    if (state.audioDataPromises[name]) {
      return state.audioDataPromises[name];
    }

    if (!window.fetch) {
      return Promise.resolve(null);
    }

    var source = chooseAudioSource(AUDIO_FILES[name]);

    if (!source) {
      return Promise.resolve(null);
    }

    state.audioDataPromises[name] = fetch(source)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Audio file failed to load");
        }

        return response.arrayBuffer();
      })
      .then(function (arrayBuffer) {
        state.audioData[name] = arrayBuffer;
        return arrayBuffer;
      })
      .catch(function () {
        delete state.audioDataPromises[name];
        return null;
      });

    return state.audioDataPromises[name];
  }

  function resetDecodedAudioBuffers() {
    state.audioBuffers = {};
    state.audioBufferPromises = {};
    state.audioReadyPromise = null;
  }

  async function recreateAudioContext() {
    if (!AudioContextConstructor) {
      return null;
    }

    clearScheduledCues();
    var previousAudioContext = audioCtx;
    audioCtx = null;
    state.audioContext = null;
    resetDecodedAudioBuffers();

    try {
      if (previousAudioContext && previousAudioContext.state !== "closed") {
        await settleAudioOperation(previousAudioContext.close());
      }
    } catch (error) {
      // A broken context is already unusable, so continue with a fresh one.
    }

    return createAudioContext();
  }

  function chooseAudioSource(candidates) {
    return candidates[0] ? candidates[0].src : "";
  }

  function playCurrentStepStartCue(previousPhase) {
    var step = state.sequence[state.currentIndex];

    if (!step || !state.audioUnlocked || document.visibilityState === "hidden") {
      return;
    }

    var elapsedInStep = step.duration - state.remainingMs / 1000;
    var isAtStepStart = elapsedInStep <= 0.25;

    if (step.phase === "work" && isAtStepStart) {
      playWhistleCue(0);
    }

    if (step.phase === "rest" && previousPhase === "work" && isAtStepStart) {
      playWhistleCue(0);
    }
  }

  function maybePlayTenSecondWarning() {
    var step = state.sequence[state.currentIndex];

    if (!step || !state.audioUnlocked || step.phase !== "work" || step.duration <= 10 || document.visibilityState === "hidden") {
      return;
    }

    if (state.remainingMs > 10000 || state.remainingMs <= 0) {
      return;
    }

    if (state.tenSecondWarningKey === state.currentIndex) {
      return;
    }

    state.tenSecondWarningKey = state.currentIndex;
    playTenSecondWarning(0);
  }

  function playWhistleCue(delaySeconds, shouldTrack) {
    playAudioBuffer("whistle", state.settings.whistleVolume / 100, delaySeconds || 0, shouldTrack);
  }

  function playTenSecondWarning(delaySeconds, shouldTrack) {
    for (var index = 0; index < 5; index += 1) {
      playAudioBuffer("tenSecondPop", 1, (delaySeconds || 0) + index * 0.4, shouldTrack);
    }
  }

  function playAudioBuffer(name, volume, delaySeconds, shouldTrack, attempt) {
    attempt = attempt || 0;

    if (!state.audioContext || !state.audioBuffers[name]) {
      if (attempt < 2) {
        recoverAudioForPlayback().then(function (ready) {
          if (ready) {
            playAudioBuffer(name, volume, delaySeconds, shouldTrack, attempt + 1);
          }
        });
      }

      return false;
    }

    if (state.audioContext.state !== "running") {
      if (attempt < 2) {
        recoverAudioForPlayback().then(function (ready) {
          if (ready) {
            playAudioBuffer(name, volume, delaySeconds, shouldTrack, attempt + 1);
          }
        });
      }

      return false;
    }

    var now = state.audioContext.currentTime + delaySeconds;
    var source = state.audioContext.createBufferSource();
    var gain = state.audioContext.createGain();

    source.buffer = state.audioBuffers[name];
    gain.gain.setValueAtTime(volume, now);
    source.connect(gain);
    connectCueOutput(gain, volume, now);

    try {
      source.start(now);
    } catch (error) {
      if (attempt < 2) {
        recoverAudioForPlayback(true).then(function (ready) {
          if (ready) {
            playAudioBuffer(name, volume, delaySeconds, shouldTrack, attempt + 1);
          }
        });
      }

      return false;
    }

    if (shouldTrack) {
      state.scheduledCueNodes.push(source);
      source.onended = function () {
        state.scheduledCueNodes = state.scheduledCueNodes.filter(function (cueNode) {
          return cueNode !== source;
        });
      };
    }

    return true;
  }

  function connectCueOutput(gain, volume, now) {
    if (volume <= 1 || typeof state.audioContext.createDynamicsCompressor !== "function") {
      gain.connect(state.audioContext.destination);
      return;
    }

    var limiter = state.audioContext.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-1, now);
    limiter.knee.setValueAtTime(0, now);
    limiter.ratio.setValueAtTime(20, now);
    limiter.attack.setValueAtTime(0.001, now);
    limiter.release.setValueAtTime(0.1, now);
    gain.connect(limiter);
    limiter.connect(state.audioContext.destination);
  }

  async function recoverAudioForPlayback(shouldForceRecreate) {
    if (state.audioRecoveryPromise) {
      return state.audioRecoveryPromise;
    }

    state.audioRecoveryPromise = (async function () {
      var audioContext = state.audioContext;
      var shouldReplaceContext = Boolean(
        shouldForceRecreate ||
        state.audioNeedsRecovery ||
        !audioContext ||
        audioContext.state === "closed" ||
        audioContext.state === "interrupted"
      );

      if (shouldReplaceContext) {
        await recreateAudioContext();
      }

      var isReady = await ensureAudioReady();

      if (!isReady && !shouldReplaceContext) {
        await recreateAudioContext();
        isReady = await ensureAudioReady();
      }

      state.audioNeedsRecovery = !isReady;
      return isReady;
    })();

    try {
      return await state.audioRecoveryPromise;
    } finally {
      state.audioRecoveryPromise = null;
    }
  }

  function clearScheduledCues() {
    state.scheduledCueNodes.forEach(function (source) {
      try {
        source.stop();
      } catch (error) {
        return;
      }
    });

    state.scheduledCueNodes = [];
  }

  function playFinishWhistle() {
    playWhistleCue(0);
  }

  async function handleManualCueClick(event) {
    var button = event.target.closest("[data-manual-cue]");

    if (!button) {
      return;
    }

    if (!await prepareAudioForTimer()) {
      return;
    }

    if (button.getAttribute("data-manual-cue") === "whistle") {
      playWhistleCue(0);
    }
  }

  async function handleSoundCheckClick(event) {
    var button = event.target.closest("[data-sound-check]");

    if (!button) {
      return;
    }

    if (!await prepareAudioForTimer()) {
      return;
    }

    if (button.getAttribute("data-sound-check") === "whistle") {
      playWhistleCue(0);
    }

    if (button.getAttribute("data-sound-check") === "tenSecondPop") {
      playTenSecondWarning(0);
    }
  }

  function restoreTimerState() {
    var snapshot = loadTimerState();

    if (!snapshot) {
      return false;
    }

    state.settings = snapshot.settings;
    writeSettingsToInputs(state.settings);
    state.sequence = buildSequence(state.settings);
    state.currentIndex = clamp(snapshot.currentIndex, 0, Math.max(state.sequence.length - 1, 0));
    state.hasStarted = snapshot.hasStarted;
    state.isDone = snapshot.isDone;
    state.isRunning = false;
    state.restoredRunningWithoutAudio = false;

    if (!state.sequence.length) {
      return false;
    }

    var step = state.sequence[state.currentIndex];
    state.remainingMs = clamp(snapshot.remainingMs, 0, step.duration * 1000);

    var shouldResumeRunning = snapshot.isRunning && !snapshot.isDone && snapshot.hasStarted;

    if (shouldResumeRunning) {
      applyElapsedSinceSave(Date.now() - snapshot.savedAt);
    }

    if (state.isDone) {
      finishWorkout(false);
      return true;
    }

    if (shouldResumeRunning) {
      state.isRunning = true;
      state.restoredRunningWithoutAudio = true;
      state.targetTime = performance.now() + state.remainingMs;
      state.targetWallTime = Date.now() + state.remainingMs;
      showAudioResumeNotice("Timer running - tap anywhere to restore sound");
      requestWakeLock();
    }

    updateDisplay();
    updateControls();
    saveTimerState();

    if (shouldResumeRunning) {
      tick();
    }

    return true;
  }

  function loadTimerState() {
    try {
      var snapshot = JSON.parse(localStorage.getItem(TIMER_STATE_KEY));

      if (!snapshot || !snapshot.settings) {
        return null;
      }

      return {
        settings: normalizeSettings(snapshot.settings),
        currentIndex: toNumber(snapshot.currentIndex, 0),
        remainingMs: toNumber(snapshot.remainingMs, 0),
        hasStarted: Boolean(snapshot.hasStarted),
        isRunning: Boolean(snapshot.isRunning),
        isDone: Boolean(snapshot.isDone),
        savedAt: toNumber(snapshot.savedAt, Date.now())
      };
    } catch (error) {
      return null;
    }
  }

  function saveTimerState() {
    var remainingMs = getRunningRemainingMs();
    state.lastStateSave = Date.now();

    try {
      localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
        settings: state.settings,
        currentIndex: state.currentIndex,
        remainingMs: Math.round(remainingMs),
        hasStarted: state.hasStarted,
        isRunning: state.isRunning,
        isDone: state.isDone,
        savedAt: state.lastStateSave
      }));
    } catch (error) {
      // A storage failure must never stop the live countdown loop.
    }
  }

  function saveTimerStateThrottled() {
    if (Date.now() - state.lastStateSave >= 500) {
      saveTimerState();
    }
  }

  function applyElapsedSinceSave(elapsedMs) {
    var remainingElapsed = Math.max(0, elapsedMs);

    while (remainingElapsed >= state.remainingMs && !state.isDone) {
      remainingElapsed -= state.remainingMs;

      if (state.currentIndex >= state.sequence.length - 1) {
        state.remainingMs = 0;
        state.isDone = true;
        state.hasStarted = true;
        return;
      }

      state.currentIndex += 1;
      state.remainingMs = state.sequence[state.currentIndex].duration * 1000;
      state.tenSecondWarningKey = null;
    }

    state.remainingMs = Math.max(0, state.remainingMs - remainingElapsed);
  }

  function loadSavedTimers() {
    try {
      var timers = JSON.parse(localStorage.getItem(SAVED_TIMERS_KEY));

      if (!Array.isArray(timers)) {
        return [];
      }

      return timers
        .map(function (timer) {
          if (!timer || !timer.name || !timer.settings) {
            return null;
          }

          return {
            id: timer.id || createTimerId(),
            name: String(timer.name).trim().slice(0, 40),
            settings: normalizeSettings(timer.settings),
            updatedAt: toNumber(timer.updatedAt, Date.now()),
            lastUsedAt: toNumber(timer.lastUsedAt, timer.updatedAt || Date.now())
          };
        })
        .filter(Boolean)
        .sort(compareSavedTimers);
    } catch (error) {
      return [];
    }
  }

  function saveSavedTimers() {
    localStorage.setItem(SAVED_TIMERS_KEY, JSON.stringify(state.savedTimers));
  }

  function handleSaveTimer() {
    var name = timerNameInput.value.trim();

    if (!name) {
      timerNameInput.focus();
      timerNameInput.placeholder = "Name this timer";
      return;
    }

    var now = Date.now();
    var settings = readSettingsFromInputs();
    var existing = state.savedTimers.find(function (timer) {
      return timer.name.toLowerCase() === name.toLowerCase();
    });

    if (existing) {
      existing.name = name;
      existing.settings = settings;
      existing.updatedAt = now;
      existing.lastUsedAt = now;
    } else {
      state.savedTimers.push({
        id: createTimerId(),
        name: name,
        settings: settings,
        updatedAt: now,
        lastUsedAt: now
      });
    }

    state.savedTimers.sort(compareSavedTimers);
    saveSavedTimers();
    renderSavedTimers();
    timerNameInput.value = "";
  }

  function handleSavedTimerClick(event) {
    var loadButton = event.target.closest("[data-load-timer]");
    var deleteButton = event.target.closest("[data-delete-timer]");

    if (loadButton) {
      loadSavedTimer(loadButton.getAttribute("data-load-timer"));
    }

    if (deleteButton) {
      deleteSavedTimer(deleteButton.getAttribute("data-delete-timer"));
    }
  }

  function loadSavedTimer(id) {
    var timer = findSavedTimer(id);

    if (!timer) {
      return;
    }

    timer.lastUsedAt = Date.now();
    state.settings = timer.settings;
    writeSettingsToInputs(state.settings);
    saveSettings(state.settings);
    state.savedTimers.sort(compareSavedTimers);
    saveSavedTimers();
    renderSavedTimers();
    resetTimer(false);
  }

  function deleteSavedTimer(id) {
    state.savedTimers = state.savedTimers.filter(function (timer) {
      return timer.id !== id;
    });
    saveSavedTimers();
    renderSavedTimers();
  }

  function findSavedTimer(id) {
    return state.savedTimers.find(function (timer) {
      return timer.id === id;
    });
  }

  function renderSavedTimers() {
    savedTimerList.textContent = "";

    if (!state.savedTimers.length) {
      var empty = document.createElement("p");
      empty.className = "empty-saved-timers";
      empty.textContent = "No saved timers yet.";
      savedTimerList.appendChild(empty);
      return;
    }

    state.savedTimers.forEach(function (timer) {
      var item = document.createElement("div");
      item.className = "saved-timer-item";

      var loadButton = document.createElement("button");
      loadButton.className = "saved-timer-load";
      loadButton.type = "button";
      loadButton.setAttribute("data-load-timer", timer.id);

      var name = document.createElement("span");
      name.className = "saved-timer-name";
      name.textContent = timer.name;

      var meta = document.createElement("span");
      meta.className = "saved-timer-meta";
      meta.textContent = getTimerSummary(timer.settings);

      var deleteButton = document.createElement("button");
      deleteButton.className = "saved-timer-delete";
      deleteButton.type = "button";
      deleteButton.setAttribute("data-delete-timer", timer.id);
      deleteButton.textContent = "Delete";

      loadButton.appendChild(name);
      loadButton.appendChild(meta);
      item.appendChild(loadButton);
      item.appendChild(deleteButton);
      savedTimerList.appendChild(item);
    });
  }

  function getTimerSummary(settings) {
    return formatShortDuration(settings.workSeconds) + " wrestle / " + formatShortDuration(settings.restSeconds) + " rest / " + settings.rounds + " rounds";
  }

  function compareSavedTimers(a, b) {
    return (b.lastUsedAt || b.updatedAt) - (a.lastUsedAt || a.updatedAt);
  }

  function createTimerId() {
    return "timer-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
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

  function handlePageSuspend() {
    markAudioForRecovery();

    if (state.isRunning) {
      state.remainingMs = getRunningRemainingMs();
      state.hiddenAt = Date.now();
      clearTickSchedule();
    }

    saveTimerState();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      handlePageSuspend();
      return;
    }

    handleAppReturn();
  }

  function handleAppReturn() {
    if (document.visibilityState === "hidden") {
      return;
    }

    var shouldRecoverAudio = Boolean(
      state.audioUnlocked &&
      (state.audioNeedsRecovery || !state.audioContext || state.audioContext.state !== "running")
    );
    var audioRecovery = shouldRecoverAudio
      ? recoverAudioForPlayback(true)
      : Promise.resolve(Boolean(state.audioContext && state.audioContext.state === "running"));

    if (!state.isRunning) {
      return;
    }

    if (state.hiddenAt) {
      applyElapsedSinceSave(Date.now() - state.hiddenAt);
      state.hiddenAt = 0;
    } else {
      state.remainingMs = getRunningRemainingMs();
    }

    if (state.isDone) {
      finishWorkout(false);
      audioRecovery.then(function (ready) {
        if (ready) {
          playFinishWhistle();
        }
      });
      return;
    }

    state.targetTime = performance.now() + state.remainingMs;
    state.targetWallTime = Date.now() + state.remainingMs;
    clearScheduledCues();
    requestWakeLock();
    updateDisplay();
    updateControls();
    saveTimerState();
    clearTickSchedule();
    tick();
  }

  function setCountdownTime(totalSeconds) {
    var time = formatTimeString(totalSeconds);
    countdownEl.textContent = time;
    syncMaskText(countdownEl, time);
    countdownEl.setAttribute("aria-label", time);
  }

  function formatTimeString(totalSeconds) {
    var seconds = Math.max(0, totalSeconds);
    var minutes = Math.floor(seconds / 60);
    var remainder = seconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function formatShortDuration(totalSeconds) {
    var seconds = Math.max(0, totalSeconds);
    var minutes = Math.floor(seconds / 60);
    var remainder = seconds % 60;
    return minutes + ":" + String(remainder).padStart(2, "0");
  }

  function toNumber(value, fallback) {
    var parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
