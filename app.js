(function () {
  "use strict";

  var SETTINGS_KEY = "wrestlingWorkoutTimerSettings";
  var TIMER_STATE_KEY = "wrestlingWorkoutTimerState";
  var SAVED_TIMERS_KEY = "wrestlingWorkoutSavedTimers";
  var AUDIO_FILES = {
    ready: [
      { src: "assets/audio/ready.m4a?v=20260630-console6", type: "audio/mp4" }
    ],
    set: [
      { src: "assets/audio/set.m4a?v=20260630-console6", type: "audio/mp4" }
    ],
    whistle: [
      { src: "assets/audio/whistle-start.m4a?v=20260630-console6", type: "audio/mp4" }
    ],
    restHorn: [
      { src: "assets/audio/rest-horn.m4a?v=20260630-console6", type: "audio/mp4" }
    ],
    finalHorn: [
      { src: "assets/audio/final-horn.m4a?v=20260630-console6", type: "audio/mp4" }
    ],
    tenSecondPop: [
      { src: "assets/audio/ten-second-pop.m4a?v=20260630-console6", type: "audio/mp4" }
    ]
  };
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
    audioBuffers: {},
    audioBufferPromises: {},
    audioReadyPromise: null,
    audioUnlocked: false,
    scheduledCueNodes: [],
    wakeLock: null,
    savedTimers: [],
    lastStateSave: 0,
    hiddenAt: 0
  };

  writeSettingsToInputs(state.settings);
  state.savedTimers = loadSavedTimers();

  if (!restoreTimerState()) {
    resetTimer(false);
  }

  renderSavedTimers();

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
  saveTimerButton.addEventListener("click", handleSaveTimer);
  settingsForm.addEventListener("input", handleSettingsInput);
  savedTimerList.addEventListener("click", handleSavedTimerClick);
  soundCheckEl.addEventListener("click", handleSoundCheckClick);
  window.addEventListener("beforeunload", saveTimerState);
  window.addEventListener("focus", handleAppReturn);
  window.addEventListener("pageshow", handleAppReturn);
  window.addEventListener("pagehide", handlePageSuspend);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("freeze", handlePageSuspend);

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
    } else {
      saveTimerState();
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

  async function handlePlayPause() {
    if (state.hasStarted && !state.isDone) {
      await handlePauseResume();
      return;
    }

    await handleStart();
  }

  async function handleStart() {
    await unlockAudio();
    runStatusEl.textContent = "Loading";
    await ensureAudioReady();

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
    await unlockAudio();
    await ensureAudioReady();

    if (!state.hasStarted || state.isDone) {
      return;
    }

    if (state.isRunning) {
      pauseRunning();
    } else {
      startRunning();
    }
  }

  async function handleSkip() {
    await unlockAudio();
    await ensureAudioReady();

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
    await unlockAudio();
    await ensureAudioReady();

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

    cancelAnimationFrame(state.rafId);
    clearScheduledCues();
    state.isRunning = true;
    state.targetTime = performance.now() + state.remainingMs;
    scheduleCurrentIntervalCues(null);
    requestWakeLock();
    tick();
    updateControls();
    saveTimerState();
  }

  function pauseRunning() {
    state.remainingMs = Math.max(0, state.targetTime - performance.now());
    state.isRunning = false;
    cancelAnimationFrame(state.rafId);
    clearScheduledCues();
    releaseWakeLock();
    updateDisplay();
    updateControls();
    saveTimerState();
  }

  function resetTimer(shouldSave) {
    cancelAnimationFrame(state.rafId);
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
    updateDisplay();

    if (state.isRunning) {
      state.targetTime = performance.now() + state.remainingMs;
      scheduleCurrentIntervalCues(previousPhase);
    }

    saveTimerState();
  }

  function tick() {
    if (!state.isRunning) {
      return;
    }

    state.remainingMs = Math.max(0, state.targetTime - performance.now());
    updateDisplay();
    saveTimerStateThrottled();

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

    cancelAnimationFrame(state.rafId);
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
    cancelAnimationFrame(state.rafId);
    clearScheduledCues();
    releaseWakeLock();
    state.isRunning = false;
    state.hasStarted = true;
    state.isDone = true;
    state.remainingMs = 0;
    app.className = "app phase-done";
    phaseLabelEl.textContent = "DONE";
    countdownEl.textContent = "00:00";
    roundCounterEl.textContent = "Round " + state.settings.rounds + " of " + state.settings.rounds;
    runStatusEl.textContent = "Done";
    if (shouldPlayTone) {
      playFinishTone();
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
    countdownEl.textContent = formatTime(Math.ceil(state.remainingMs / 1000));
    roundCounterEl.textContent = "Round " + round + " of " + state.settings.rounds;
    runStatusEl.textContent = state.isRunning ? "Running" : state.hasStarted ? "Paused" : "Ready";
  }

  function updateControls() {
    startButton.disabled = false;
    startButton.classList.toggle("is-running", state.isRunning);
    startButton.setAttribute("aria-label", state.isRunning ? "Pause timer" : state.hasStarted && !state.isDone ? "Resume timer" : "Start timer");
    playButtonLabel.textContent = state.isRunning ? "Pause" : state.hasStarted && !state.isDone ? "Resume" : "Start";
    skipBackButton.disabled = state.isDone || (!state.hasStarted && !state.sequence.length);
    skipButton.disabled = state.isDone;
    runStatusEl.textContent = state.isDone ? "Done" : state.isRunning ? "Running" : state.hasStarted ? "Paused" : "Ready";
  }

  function handleAudioInteraction() {
    unlockAudio();
  }

  function createAudioContext() {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return null;
    }

    if (!state.audioContext || state.audioContext.state === "closed") {
      var AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContextConstructor();
      state.audioContext.onstatechange = handleAudioContextStateChange;
    }

    return state.audioContext;
  }

  async function unlockAudio() {
    state.audioUnlocked = true;
    return ensureAudioReady();
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
      await audioContext.resume();
    } catch (error) {
      return false;
    }

    return audioContext.state === "running";
  }

  async function ensureAudioReady() {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return false;
    }

    if (!createAudioContext()) {
      return false;
    }

    if (state.audioReadyPromise) {
      await state.audioReadyPromise;
    } else {
      state.audioReadyPromise = Promise.all(Object.keys(AUDIO_FILES).map(function (name) {
        return loadAudioBuffer(name);
      })).then(function () {
        return true;
      }).catch(function () {
        state.audioReadyPromise = null;
        return false;
      });

      await state.audioReadyPromise;
    }

    return resumeAudioContext();
  }

  function handleAudioContextStateChange() {
    if (!state.audioContext) {
      return;
    }

    if (state.audioContext.state === "running" && state.isRunning && document.visibilityState !== "hidden") {
      rescheduleCurrentAudioCues();
    }
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

    var source = chooseAudioSource(AUDIO_FILES[name]);

    if (!source) {
      return Promise.resolve(null);
    }

    state.audioBufferPromises[name] = fetch(source)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Audio file failed to load");
        }

        return response.arrayBuffer();
      })
      .then(function (arrayBuffer) {
        return state.audioContext.decodeAudioData(arrayBuffer);
      })
      .then(function (audioBuffer) {
        state.audioBuffers[name] = audioBuffer;
        return audioBuffer;
      })
      .catch(function () {
        delete state.audioBufferPromises[name];
        return null;
      });

    return state.audioBufferPromises[name];
  }

  function chooseAudioSource(candidates) {
    var testAudio = document.createElement("audio");

    for (var index = 0; index < candidates.length; index += 1) {
      if (!candidates[index].type || testAudio.canPlayType(candidates[index].type)) {
        return candidates[index].src;
      }
    }

    return candidates[0] ? candidates[0].src : "";
  }

  function playPrepCue(secondsRemaining, delaySeconds, shouldTrack) {
    var cueName = secondsRemaining === 2 ? "ready" : "set";
    playAudioBuffer(cueName, 1, delaySeconds || 0, shouldTrack);
  }

  function scheduleCurrentIntervalCues(previousPhase) {
    var step = state.sequence[state.currentIndex];

    if (!step || !state.audioContext) {
      return;
    }

    clearScheduledCues();

    if ((step.phase === "ready" || step.phase === "rest") && state.remainingMs >= 1000) {
      [2, 1].forEach(function (secondsRemaining) {
        var delaySeconds = state.remainingMs / 1000 - secondsRemaining;

        if (delaySeconds >= -0.08) {
          playPrepCue(secondsRemaining, Math.max(0, delaySeconds), true);
        }
      });
    }

    if (step.phase === "work" && state.remainingMs >= step.duration * 1000 - 250) {
      playWhistleStart(0, false);
    }

    if (step.phase === "work" && step.duration > 10) {
      var warningDelay = state.remainingMs / 1000 - 10;

      if (warningDelay >= -0.08) {
        playTenSecondWarning(Math.max(0, warningDelay), true);
      }
    }

    if (step.phase === "rest" && previousPhase === "work" && state.remainingMs >= step.duration * 1000 - 250) {
      playRestHorn(0, false);
    }
  }

  function playWhistleStart(delaySeconds, shouldTrack) {
    playAudioBuffer("whistle", 1, delaySeconds || 0, shouldTrack);
  }

  function playTenSecondWarning(delaySeconds, shouldTrack) {
    for (var index = 0; index < 5; index += 1) {
      playAudioBuffer("tenSecondPop", 1, (delaySeconds || 0) + index * 0.4, shouldTrack);
    }
  }

  function playRestHorn(delaySeconds, shouldTrack) {
    playAudioBuffer("restHorn", 1, delaySeconds || 0, shouldTrack);
  }

  function playAudioBuffer(name, volume, delaySeconds, shouldTrack) {
    if (!state.audioContext || !state.audioBuffers[name]) {
      return false;
    }

    if (state.audioContext.state !== "running") {
      ensureAudioReady();
      return false;
    }

    var now = state.audioContext.currentTime + delaySeconds;
    var source = state.audioContext.createBufferSource();
    var gain = state.audioContext.createGain();

    source.buffer = state.audioBuffers[name];
    gain.gain.setValueAtTime(volume, now);
    source.connect(gain);
    gain.connect(state.audioContext.destination);

    try {
      source.start(now);
    } catch (error) {
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

  function playFinishTone() {
    playAudioBuffer("finalHorn", 1, 0);
  }

  async function handleManualCueClick(event) {
    var button = event.target.closest("[data-manual-cue]");

    if (!button) {
      return;
    }

    await unlockAudio();
    await ensureAudioReady();

    if (button.getAttribute("data-manual-cue") === "whistle") {
      playWhistleStart(0);
    }
  }

  async function handleSoundCheckClick(event) {
    var button = event.target.closest("[data-sound-check]");

    if (!button) {
      return;
    }

    await unlockAudio();
    await ensureAudioReady();

    if (button.getAttribute("data-sound-check") === "countdown") {
      playPrepCue(2, 0);
      playPrepCue(1, 1);
    }

    if (button.getAttribute("data-sound-check") === "whistle") {
      playWhistleStart(0);
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

    if (!state.sequence.length) {
      return false;
    }

    var step = state.sequence[state.currentIndex];
    state.remainingMs = clamp(snapshot.remainingMs, 0, step.duration * 1000);

    if (snapshot.isRunning && !snapshot.isDone) {
      applyElapsedSinceSave(Date.now() - snapshot.savedAt);
    }

    if (state.isDone) {
      finishWorkout(false);
      return true;
    }

    updateDisplay();
    updateControls();

    if (snapshot.isRunning && state.hasStarted) {
      startRunning();
    } else {
      saveTimerState();
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
    var remainingMs = state.isRunning ? Math.max(0, state.targetTime - performance.now()) : state.remainingMs;

    localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
      settings: state.settings,
      currentIndex: state.currentIndex,
      remainingMs: Math.round(remainingMs),
      hasStarted: state.hasStarted,
      isRunning: state.isRunning,
      isDone: state.isDone,
      savedAt: Date.now()
    }));

    state.lastStateSave = Date.now();
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
    return formatShortDuration(settings.workSeconds) + " work / " + formatShortDuration(settings.restSeconds) + " rest / " + settings.rounds + " rounds";
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
    if (state.isRunning) {
      state.remainingMs = Math.max(0, state.targetTime - performance.now());
      state.hiddenAt = Date.now();
      clearScheduledCues();
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

    if (!state.isRunning) {
      ensureAudioReady();
      return;
    }

    if (state.hiddenAt) {
      applyElapsedSinceSave(Date.now() - state.hiddenAt);
      state.hiddenAt = 0;
    } else {
      state.remainingMs = Math.max(0, state.targetTime - performance.now());
    }

    if (state.isDone) {
      finishWorkout(false);
      ensureAudioReady().then(function (ready) {
        if (ready) {
          playFinishTone();
        }
      });
      return;
    }

    state.targetTime = performance.now() + state.remainingMs;
    clearScheduledCues();
    requestWakeLock();
    updateDisplay();
    updateControls();
    saveTimerState();
    ensureAudioReady().then(function () {
      rescheduleCurrentAudioCues();
    });
    cancelAnimationFrame(state.rafId);
    tick();
  }

  function rescheduleCurrentAudioCues() {
    if (!state.isRunning || state.isDone || document.visibilityState === "hidden") {
      return;
    }

    clearScheduledCues();
    scheduleCurrentIntervalCues(null);
  }

  function formatTime(totalSeconds) {
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
