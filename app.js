(function () {
  "use strict";

  var SETTINGS_KEY = "wrestlingWorkoutTimerSettings";
  var TIMER_STATE_KEY = "wrestlingWorkoutTimerState";
  var AUDIO_FILES = {
    whistle: [
      { src: "assets/audio/rest-horn.m4a?v=20260717-unified-whistle1", type: "audio/mp4" }
    ],
    tenSecondClapper: [
      { src: "assets/audio/ten-second-clapper.m4a?v=20260804-original-clap1", type: "audio/mp4" }
    ]
  };
  var DEFAULTS = {
    workSeconds: 30,
    restSeconds: 15,
    readySeconds: 10,
    rounds: 8,
    whistleVolume: 150,
    wrestleLabel: "WRESTLE",
    tenSecondWarningEnabled: true,
    warningVolume: 300,
    readyColor: "#69707a",
    workColor: "#f23b3d",
    restColor: "#14944d"
  };
  var AUDIO_OPERATION_TIMEOUT_MS = 700;
  var AUDIO_KEEP_ALIVE_FREQUENCY_HZ = 20;
  var AUDIO_KEEP_ALIVE_GAIN = 0.000001;
  var TICK_WATCHDOG_MS = 500;
  var WHISTLE_BOOST_CURVE_SAMPLES = 4096;
  var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  var audioCtx = null;

  var app = document.getElementById("app");
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
  var audioResumeNotice = document.getElementById("audioResumeNotice");
  var settingsToggleButton = document.getElementById("settingsToggleButton");
  var settingsCloseButton = document.getElementById("settingsCloseButton");
  var settingsApplyButton = document.getElementById("settingsApplyButton");
  var settingsPanel = document.getElementById("settingsPanel");
  var settingsScrim = document.getElementById("settingsScrim");
  var whistleVolumeValue = document.getElementById("whistleVolumeValue");
  var warningVolumeValue = document.getElementById("warningVolumeValue");
  var warningVolumeField = document.querySelector(".warning-volume-field");
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');

  var inputs = {
    workMinutes: document.getElementById("workMinutes"),
    workSeconds: document.getElementById("workSeconds"),
    restMinutes: document.getElementById("restMinutes"),
    restSeconds: document.getElementById("restSeconds"),
    readyMinutes: document.getElementById("readyMinutes"),
    readySeconds: document.getElementById("readySeconds"),
    rounds: document.getElementById("rounds"),
    whistleVolume: document.getElementById("whistleVolume"),
    wrestleLabel: document.getElementById("wrestleLabel"),
    tenSecondWarningEnabled: document.getElementById("tenSecondWarningEnabled"),
    warningVolume: document.getElementById("warningVolume"),
    readyColor: document.getElementById("readyColor"),
    workColor: document.getElementById("workColor"),
    restColor: document.getElementById("restColor")
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
    audioKeepAliveContext: null,
    audioKeepAliveGain: null,
    audioKeepAliveSource: null,
    scheduledCueNodes: [],
    tenSecondWarningKey: null,
    wakeLock: null,
    lastStateSave: 0,
    hiddenAt: 0
  };

  writeSettingsToInputs(state.settings);
  applyAppearance();
  preventAppZoom();

  if (!restoreTimerState()) {
    resetTimer(false);
  }

  configureAudioSession();
  primeAudioData();

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
  settingsApplyButton.addEventListener("click", applySettingsAndClose);
  settingsForm.addEventListener("click", handleSettingsStepperClick);
  settingsForm.addEventListener("click", handleSoundCheckClick);
  settingsForm.addEventListener("input", handleSettingsInput);
  window.addEventListener("beforeunload", saveTimerState);
  window.addEventListener("focus", handleAppReturn);
  window.addEventListener("pageshow", handleAppReturn);
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
    settingsApplyButton.focus({ preventScroll: true });
  }

  function closeSettingsPanel() {
    settingsPanel.classList.remove("is-open");
    settingsPanel.setAttribute("aria-hidden", "true");
    settingsPanel.setAttribute("inert", "");
    settingsToggleButton.setAttribute("aria-expanded", "false");
    settingsScrim.hidden = true;
    settingsToggleButton.focus({ preventScroll: true });
  }

  function applySettingsAndClose() {
    state.settings = readSettingsFromInputs();
    saveSettings(state.settings);
    resetTimer(false);
    closeSettingsPanel();
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
      workSeconds: clamp(toNumber(settings.workSeconds, DEFAULTS.workSeconds), 1, 3600),
      restSeconds: clamp(toNumber(settings.restSeconds, DEFAULTS.restSeconds), 0, 3600),
      readySeconds: clamp(toNumber(settings.readySeconds, DEFAULTS.readySeconds), 0, 120),
      rounds: clamp(toNumber(settings.rounds, DEFAULTS.rounds), 1, 99),
      whistleVolume: clamp(toNumber(settings.whistleVolume, DEFAULTS.whistleVolume), 0, 200),
      wrestleLabel: normalizeWrestleLabel(settings.wrestleLabel),
      tenSecondWarningEnabled: settings.tenSecondWarningEnabled !== false,
      warningVolume: clamp(toNumber(settings.warningVolume, DEFAULTS.warningVolume), 0, 300),
      readyColor: normalizeColor(settings.readyColor, DEFAULTS.readyColor),
      workColor: normalizeColor(settings.workColor, DEFAULTS.workColor),
      restColor: normalizeColor(settings.restColor, DEFAULTS.restColor)
    };
  }

  function normalizeWrestleLabel(value) {
    var label = String(value == null ? DEFAULTS.wrestleLabel : value).trim().slice(0, 24);
    return label ? label.toUpperCase() : DEFAULTS.wrestleLabel;
  }

  function normalizeColor(value, fallback) {
    var color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
  }

  function readSettingsFromInputs() {
    return normalizeSettings({
      workSeconds: readDuration("work"),
      restSeconds: readDuration("rest"),
      readySeconds: readDuration("ready"),
      rounds: inputs.rounds.value,
      whistleVolume: inputs.whistleVolume.value,
      wrestleLabel: inputs.wrestleLabel.value,
      tenSecondWarningEnabled: inputs.tenSecondWarningEnabled.checked,
      warningVolume: inputs.warningVolume.value,
      readyColor: inputs.readyColor.value,
      workColor: inputs.workColor.value,
      restColor: inputs.restColor.value
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
    inputs.wrestleLabel.value = settings.wrestleLabel;
    inputs.tenSecondWarningEnabled.checked = settings.tenSecondWarningEnabled;
    inputs.warningVolume.value = settings.warningVolume;
    inputs.readyColor.value = settings.readyColor;
    inputs.workColor.value = settings.workColor;
    inputs.restColor.value = settings.restColor;
    updateWhistleVolumeValue(settings.whistleVolume);
    updateWarningControls();
  }

  function writeDuration(prefix, totalSeconds) {
    inputs[prefix + "Minutes"].value = Math.floor(totalSeconds / 60);
    inputs[prefix + "Seconds"].value = totalSeconds % 60;
  }

  function handleSettingsInput() {
    state.settings = readSettingsFromInputs();
    updateWhistleVolumeValue(state.settings.whistleVolume);
    updateWarningControls();
    applyAppearance();
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

  function updateWarningControls() {
    warningVolumeValue.textContent = Math.round(toNumber(inputs.warningVolume.value, DEFAULTS.warningVolume)) + "%";
    warningVolumeField.classList.toggle("is-disabled", !inputs.tenSecondWarningEnabled.checked);
    inputs.warningVolume.disabled = !inputs.tenSecondWarningEnabled.checked;
  }

  function applyAppearance() {
    app.style.setProperty("--ready", state.settings.readyColor);
    app.style.setProperty("--work", state.settings.workColor);
    app.style.setProperty("--rest", state.settings.restColor);
    if (themeColorMeta) {
      var phaseColor = state.settings.readyColor;
      var step = state.sequence[state.currentIndex];
      if (step && step.phase === "work") {
        phaseColor = state.settings.workColor;
      } else if (step && step.phase === "rest") {
        phaseColor = state.settings.restColor;
      }
      themeColorMeta.setAttribute("content", phaseColor);
    }
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
        label: settings.wrestleLabel,
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
      state.isDone = false;
      state.isRunning = false;
      state.currentIndex = Math.max(0, state.currentIndex - 1);
      state.remainingMs = state.sequence[state.currentIndex].duration * 1000;
      state.tenSecondWarningKey = null;
      updateDisplay();
      updateControls();
      saveTimerState();
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
    startAudioKeepAlive();
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
    stopAudioKeepAlive();
    releaseWakeLock();
    updateDisplay();
    updateControls();
    saveTimerState();
  }

  function resetTimer(shouldSave) {
    clearTickSchedule();
    clearScheduledCues();
    stopAudioKeepAlive();
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
    applyAppearance();
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
    stopAudioKeepAlive();
    releaseWakeLock();
    state.isRunning = false;
    state.hasStarted = true;
    state.isDone = true;
    state.restoredRunningWithoutAudio = false;
    state.remainingMs = 0;
    app.className = "app phase-done";
    app.style.setProperty("--drain-pct", "100%");
    phaseLabelEl.textContent = state.settings.wrestleLabel;
    setCountdownTime(0);
    roundCounterEl.textContent = "WORKOUT COMPLETE";
    applyAppearance();
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
    setCountdownTime(Math.ceil(state.remainingMs / 1000));
    updateDrainProgress(step);
    roundCounterEl.textContent = "ROUND " + round + " OF " + state.settings.rounds;
    applyAppearance();
  }

  function updateDrainProgress(step) {
    var totalMs = step && step.duration ? step.duration * 1000 : 0;
    var elapsed = totalMs > 0 ? clamp(1 - state.remainingMs / totalMs, 0, 1) : 1;
    app.style.setProperty("--drain-pct", (elapsed * 100).toFixed(3) + "%");
  }

  function updateControls() {
    startButton.disabled = false;
    startButton.classList.toggle("is-running", state.isRunning);
    startButton.setAttribute("aria-label", state.isRunning ? "Pause timer" : state.hasStarted && !state.isDone ? "Resume timer" : "Start timer");
    playButtonLabel.textContent = state.isRunning ? "Pause" : state.hasStarted && !state.isDone ? "Resume" : "Start";
    skipBackButton.disabled = !state.sequence.length;
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
      showAudioResumeNotice("Tap anywhere to restore sound");
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

    var audioBuffersReady = await primeAudioBuffers();

    if (audioBuffersReady && state.isRunning) {
      startAudioKeepAlive();
    }

    return audioBuffersReady;
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
    stopAudioKeepAlive();
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

    if (!step || !state.audioUnlocked || !state.settings.tenSecondWarningEnabled || step.phase !== "work" || step.duration <= 10 || document.visibilityState === "hidden") {
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
    playAudioBuffer("tenSecondClapper", state.settings.warningVolume / 100, delaySeconds || 0, shouldTrack);
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
    if (volume <= 1) {
      gain.connect(state.audioContext.destination);
      return;
    }

    if (typeof state.audioContext.createWaveShaper === "function") {
      var saturator = state.audioContext.createWaveShaper();
      var output = state.audioContext.createGain();
      saturator.curve = createWhistleBoostCurve(volume);
      saturator.oversample = "4x";
      output.gain.setValueAtTime(getWhistleBoostOutputGain(volume), now);
      gain.connect(saturator);
      saturator.connect(output);
      output.connect(state.audioContext.destination);
      return;
    }

    if (typeof state.audioContext.createDynamicsCompressor !== "function") {
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

  function createWhistleBoostCurve(volume) {
    var curve = new Float32Array(WHISTLE_BOOST_CURVE_SAMPLES);
    var drive = Math.max((volume - 1) * 4, 0.0001);
    var normalization = Math.tanh(drive);

    for (var index = 0; index < curve.length; index += 1) {
      var input = (index * 2) / (curve.length - 1) - 1;
      curve[index] = Math.tanh(drive * input) / normalization;
    }

    return curve;
  }

  function getWhistleBoostOutputGain(volume) {
    return clamp(0.95 - Math.max(volume - 1, 0) * 0.1, 0.85, 0.95);
  }

  async function recoverAudioForPlayback(shouldForceRecreate) {
    if (state.audioRecoveryPromise) {
      return state.audioRecoveryPromise;
    }

    state.audioRecoveryPromise = (async function () {
      var audioContext = state.audioContext;
      var shouldReplaceContext = Boolean(
        shouldForceRecreate ||
        !audioContext ||
        audioContext.state === "closed"
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

  function startAudioKeepAlive() {
    var audioContext = state.audioContext;

    if (
      !state.isRunning ||
      !state.audioUnlocked ||
      !audioContext ||
      audioContext.state !== "running" ||
      typeof audioContext.createOscillator !== "function"
    ) {
      return false;
    }

    if (state.audioKeepAliveSource && state.audioKeepAliveContext === audioContext) {
      return true;
    }

    stopAudioKeepAlive();

    try {
      var source = audioContext.createOscillator();
      var gain = audioContext.createGain();
      source.frequency.setValueAtTime(AUDIO_KEEP_ALIVE_FREQUENCY_HZ, audioContext.currentTime);
      gain.gain.setValueAtTime(AUDIO_KEEP_ALIVE_GAIN, audioContext.currentTime);
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.start();
      state.audioKeepAliveContext = audioContext;
      state.audioKeepAliveGain = gain;
      state.audioKeepAliveSource = source;
      return true;
    } catch (error) {
      stopAudioKeepAlive();
      return false;
    }
  }

  function stopAudioKeepAlive() {
    var source = state.audioKeepAliveSource;
    var gain = state.audioKeepAliveGain;
    state.audioKeepAliveContext = null;
    state.audioKeepAliveGain = null;
    state.audioKeepAliveSource = null;

    if (source) {
      try {
        source.stop();
      } catch (error) {
        // A stopped or closed source needs no further action.
      }

      if (typeof source.disconnect === "function") {
        source.disconnect();
      }
    }

    if (gain && typeof gain.disconnect === "function") {
      gain.disconnect();
    }
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

    if (button.getAttribute("data-sound-check") === "tenSecondClapper") {
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

    return handleAppReturn();
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
      ? recoverAudioForPlayback()
      : Promise.resolve(Boolean(state.audioContext && state.audioContext.state === "running"));
    audioRecovery = audioRecovery.then(function (ready) {
      if (ready) {
        hideAudioResumeNotice();
      } else if (state.audioUnlocked || state.restoredRunningWithoutAudio) {
        showAudioResumeNotice("Tap anywhere to restore sound");
      }

      return ready;
    });

    if (!state.isRunning) {
      return audioRecovery;
    }

    if (state.hiddenAt) {
      applyElapsedSinceSave(Date.now() - state.hiddenAt);
      state.hiddenAt = 0;
    } else {
      state.remainingMs = getRunningRemainingMs();
    }

    if (state.isDone) {
      finishWorkout(false);
      return audioRecovery.then(function (ready) {
        if (ready) {
          playFinishWhistle();
        }
      });
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
    return audioRecovery;
  }

  function setCountdownTime(totalSeconds) {
    var time = formatTimeString(totalSeconds);
    countdownEl.textContent = time;
    countdownEl.setAttribute("aria-label", time);
  }

  function formatTimeString(totalSeconds) {
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
