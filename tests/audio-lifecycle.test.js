const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");
const vm = require("node:vm");

const appPath = path.join(__dirname, "..", "app.js");
const appSource = fs.readFileSync(appPath, "utf8");
const activeHarnesses = new Set();

afterEach(() => {
  activeHarnesses.forEach((harness) => {
    if (harness.api.state.isRunning) {
      harness.api.pauseRunning();
    }
  });
  activeHarnesses.clear();
});

class FakeElement {
  constructor(tagName, id) {
    this.tagName = tagName || "div";
    this.id = id || "";
    this.attributes = {};
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.disabled = false;
    this.inert = false;
    this.style = { setProperty() {} };
    this.textContent = "";
    this.value = "0";
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    };
  }

  addEventListener() {}
  appendChild(child) { this.children.push(child); return child; }
  cloneNode() { return new FakeElement(this.tagName, this.id); }
  closest() { return null; }
  focus() {}
  getBoundingClientRect() { return { top: 0, height: 100 }; }
  querySelector() { return new FakeElement("span"); }
  querySelectorAll() { return []; }
  removeAttribute(name) { delete this.attributes[name]; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

function pendingPromise() {
  return new Promise(() => {});
}

function createHarness(contextBehaviors = [], initialStorage = {}) {
  const audioContexts = [];
  const createdTags = [];
  const elements = new Map();
  const fetchUrls = [];
  const localData = new Map();
  const documentEvents = new Map();
  const windowEvents = new Map();
  const audioSessionEvents = new Map();

  Object.entries(initialStorage).forEach(([key, value]) => {
    localData.set(key, String(value));
  });

  function getElement(id) {
    if (!elements.has(id)) {
      elements.set(id, new FakeElement("div", id));
    }

    return elements.get(id);
  }

  class FakeAudioContext {
    constructor() {
      this.behavior = contextBehaviors[audioContexts.length] || {};
      this.currentTime = 1;
      this.destination = {};
      this.compressorCount = 0;
      this.gainValues = [];
      this.startedSources = [];
      this.waveShapers = [];
      this.state = this.behavior.initialState || "suspended";
      if (this.behavior.waveShaper === false) {
        this.createWaveShaper = undefined;
      }
      audioContexts.push(this);
    }

    close() {
      if (this.behavior.close === "hang") {
        return pendingPromise();
      }

      if (this.behavior.close === "reject") {
        return Promise.reject(new Error("close failed"));
      }

      this.state = "closed";
      return Promise.resolve();
    }

    createBufferSource() {
      const context = this;
      const source = {
        buffer: null,
        connect() {},
        start(when) { context.startedSources.push({ buffer: source.buffer, when }); },
        stop() {}
      };
      return source;
    }

    createGain() {
      const context = this;
      return {
        connect() {},
        gain: { setValueAtTime(value) { context.gainValues.push(value); } }
      };
    }

    createDynamicsCompressor() {
      this.compressorCount += 1;
      const audioParam = { setValueAtTime() {} };
      return {
        attack: audioParam,
        connect() {},
        knee: audioParam,
        ratio: audioParam,
        release: audioParam,
        threshold: audioParam
      };
    }

    createWaveShaper() {
      const waveShaper = {
        connect() {},
        curve: null,
        oversample: "none"
      };
      this.waveShapers.push(waveShaper);
      return waveShaper;
    }

    decodeAudioData() {
      if (this.behavior.decode === "fail") {
        return Promise.reject(new Error("decode failed"));
      }

      return Promise.resolve({ decoded: true });
    }

    resume() {
      if (this.behavior.resume === "hang") {
        return pendingPromise();
      }

      if (this.behavior.resume === "reject") {
        return Promise.reject(new Error("resume failed"));
      }

      this.state = "running";
      return Promise.resolve();
    }
  }

  const document = {
    body: new FakeElement("body"),
    fonts: { ready: Promise.resolve() },
    visibilityState: "visible",
    addEventListener(name, handler) { documentEvents.set(name, handler); },
    createElement(tagName) {
      createdTags.push(tagName);
      return new FakeElement(tagName);
    },
    getElementById: getElement,
    querySelector(selector) { return getElement(selector); }
  };

  const audioSession = {
    state: "inactive",
    type: "auto",
    addEventListener(name, handler) { audioSessionEvents.set(name, handler); }
  };

  const localStorage = {
    getItem(key) { return localData.has(key) ? localData.get(key) : null; },
    removeItem(key) { localData.delete(key); },
    setItem(key, value) { localData.set(key, String(value)); }
  };

  const window = {
    AudioContext: FakeAudioContext,
    addEventListener(name, handler) { windowEvents.set(name, handler); },
    clearTimeout,
    fetch: async (url) => {
      fetchUrls.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
    setTimeout,
    __timerTest: {}
  };

  const context = {
    ArrayBuffer,
    Boolean,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    clearTimeout,
    document,
    fetch: window.fetch,
    getComputedStyle: () => ({ getPropertyValue: () => "0" }),
    localStorage,
    navigator: { audioSession },
    parseFloat,
    parseInt,
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout,
    window
  };

  const hook = `
    window.__timerTest.api = {
      state: state,
      unlockAudio: unlockAudio,
      handleStart: handleStart,
      handlePlayPause: handlePlayPause,
      handleSettingsInput: handleSettingsInput,
      buildSequence: buildSequence,
      pauseRunning: pauseRunning,
      playFinishWhistle: playFinishWhistle,
      playWhistleCue: playWhistleCue,
      handleAppReturn: handleAppReturn,
      handleAudioContextStateChange: handleAudioContextStateChange,
      handleVisibilityChange: handleVisibilityChange,
      recoverAudioForPlayback: recoverAudioForPlayback,
      setAudioTimeout: function (milliseconds) { AUDIO_OPERATION_TIMEOUT_MS = milliseconds; }
    };
  })();`;
  const instrumentedSource = appSource.replace(/\}\)\(\);\s*$/, hook);

  vm.runInNewContext(instrumentedSource, context, { filename: appPath });

  const harness = {
    api: window.__timerTest.api,
    audioContexts,
    audioSession,
    audioSessionEvents,
    createdTags,
    document,
    documentEvents,
    elements,
    fetchUrls,
    localData,
    windowEvents
  };

  activeHarnesses.add(harness);
  return harness;
}

test("uses one boosted whistle with a mixable Web Audio session", async () => {
  const harness = createHarness();

  assert.equal(harness.audioSession.type, "ambient");
  assert.equal(await harness.api.unlockAudio(), true);
  assert.equal(harness.audioContexts.length, 1);
  assert.equal(Object.keys(harness.api.state.audioBuffers).length, 2);
  assert.equal(harness.createdTags.includes("audio"), false);
  assert.ok(harness.fetchUrls.some((url) => url.includes("assets/audio/rest-horn.m4a")));
  assert.equal(harness.fetchUrls.some((url) => url.includes("whistle-start.m4a")), false);
  assert.equal(harness.fetchUrls.some((url) => url.includes("final-horn.m4a")), false);

  const sequence = harness.api.buildSequence(harness.api.state.settings);
  assert.equal(sequence.find((step) => step.phase === "work").label, "WRESTLE");

  harness.api.playWhistleCue(0);
  harness.api.playFinishWhistle();
  const audioContext = harness.audioContexts[0];
  assert.equal(audioContext.startedSources.length, 2);
  assert.equal(audioContext.startedSources[0].buffer, harness.api.state.audioBuffers.whistle);
  assert.equal(audioContext.startedSources[1].buffer, harness.api.state.audioBuffers.whistle);
  assert.deepEqual(
    audioContext.gainValues.map((value) => Number(value.toFixed(3))),
    [1.5, 0.9, 1.5, 0.9]
  );
  assert.equal(audioContext.compressorCount, 0);
  assert.equal(audioContext.waveShapers.length, 2);
  assert.equal(audioContext.waveShapers[0].oversample, "4x");
  assert.equal(audioContext.waveShapers[0].curve.length, 4096);
  assert.ok(audioContext.waveShapers[0].curve[0] <= -0.99);
  assert.ok(audioContext.waveShapers[0].curve.at(-1) >= 0.99);
});

test("persists the independent whistle volume and applies it to the cue", async () => {
  const harness = createHarness();
  assert.equal(await harness.api.unlockAudio(), true);

  harness.elements.get("whistleVolume").value = "75";
  harness.api.handleSettingsInput();

  assert.equal(harness.api.state.settings.whistleVolume, 75);
  assert.equal(harness.elements.get("whistleVolumeValue").textContent, "75%");
  assert.equal(JSON.parse(harness.localData.get("wrestlingWorkoutTimerSettings")).whistleVolume, 75);

  harness.api.playWhistleCue(0);
  assert.equal(harness.audioContexts[0].gainValues.at(-1), 0.75);
  assert.equal(harness.audioContexts[0].compressorCount, 0);
  assert.equal(harness.audioContexts[0].waveShapers.length, 0);
});

test("falls back to the peak limiter when soft saturation is unavailable", async () => {
  const harness = createHarness([{ waveShaper: false }]);
  assert.equal(await harness.api.unlockAudio(), true);

  harness.api.playWhistleCue(0);
  assert.equal(harness.audioContexts[0].compressorCount, 1);
});

test("replaces an interrupted context when the app returns", async () => {
  const harness = createHarness([{ close: "hang" }, {}]);
  harness.api.setAudioTimeout(20);
  assert.equal(await harness.api.unlockAudio(), true);
  await harness.api.handleStart();
  assert.equal(harness.api.state.isRunning, true);

  const originalContext = harness.audioContexts[0];
  originalContext.state = "interrupted";
  harness.api.handleAudioContextStateChange({ target: originalContext });
  assert.equal(harness.api.state.audioNeedsRecovery, true);

  harness.document.visibilityState = "hidden";
  harness.api.handleVisibilityChange();
  harness.document.visibilityState = "visible";
  harness.api.handleVisibilityChange();

  assert.equal(await harness.api.recoverAudioForPlayback(true), true);
  assert.equal(harness.audioContexts.length, 2);
  assert.equal(harness.api.state.audioContext, harness.audioContexts[1]);
  assert.equal(harness.api.state.audioContext.state, "running");
  assert.equal(harness.api.state.audioNeedsRecovery, false);

  harness.api.playWhistleCue(0);
  assert.equal(harness.audioContexts[1].startedSources.length, 1);
});

test("a focus round-trip replaces a context even when it still reports running", async () => {
  const harness = createHarness([{}, {}]);
  assert.equal(await harness.api.unlockAudio(), true);
  assert.equal(harness.api.state.audioContext.state, "running");

  harness.windowEvents.get("blur")();
  assert.equal(harness.api.state.audioNeedsRecovery, true);
  harness.windowEvents.get("focus")();

  assert.equal(await harness.api.recoverAudioForPlayback(true), true);
  assert.equal(harness.audioContexts.length, 2);
  assert.equal(harness.api.state.audioContext, harness.audioContexts[1]);
});

test("a stuck resume times out and the next user gesture recovers", async () => {
  const harness = createHarness([{ resume: "hang" }, {}]);
  harness.api.setAudioTimeout(20);

  await harness.api.handleStart();
  assert.equal(harness.api.state.isRunning, false);
  assert.equal(harness.api.state.audioNeedsRecovery, true);
  assert.equal(harness.elements.get("audioResumeNotice").hidden, false);

  await harness.api.handleStart();
  assert.equal(harness.api.state.isRunning, true);
  assert.equal(harness.audioContexts.length, 2);
  assert.equal(harness.api.state.audioContext.state, "running");
});

test("a cold reload keeps a running timer moving while sound waits for a gesture", async () => {
  const savedState = JSON.stringify({
    settings: { workSeconds: 30, restSeconds: 15, readySeconds: 10, rounds: 2 },
    currentIndex: 0,
    remainingMs: 9000,
    hasStarted: true,
    isRunning: true,
    isDone: false,
    savedAt: Date.now()
  });
  const harness = createHarness([], { wrestlingWorkoutTimerState: savedState });

  assert.equal(harness.api.state.hasStarted, true);
  assert.equal(harness.api.state.isRunning, true);
  assert.equal(harness.audioContexts.length, 0);
  assert.equal(harness.elements.get("audioResumeNotice").hidden, false);
  assert.match(harness.elements.get("audioResumeNotice").textContent, /Timer running/);
  assert.equal(harness.elements.get("playButtonLabel").textContent, "Pause");

  const restoredRemainingMs = harness.api.state.remainingMs;
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.ok(harness.api.state.remainingMs < restoredRemainingMs - 400);

  await harness.api.handlePlayPause();
  assert.equal(harness.api.state.isRunning, true);
  assert.equal(harness.api.state.audioContext.state, "running");
  assert.equal(harness.elements.get("audioResumeNotice").hidden, true);
  assert.equal(harness.api.state.restoredRunningWithoutAudio, false);
});

test("a watchdog advances the timer when animation frames are dropped", async () => {
  const harness = createHarness();
  await harness.api.handleStart();
  const startingRemainingMs = harness.api.state.remainingMs;

  await new Promise((resolve) => setTimeout(resolve, 550));

  assert.equal(harness.api.state.isRunning, true);
  assert.equal(harness.elements.get("playButtonLabel").textContent, "Pause");
  assert.ok(harness.api.state.remainingMs < startingRemainingMs - 400);
});

test("an audio-session interruption arms recovery", async () => {
  const harness = createHarness([{}, {}]);
  assert.equal(await harness.api.unlockAudio(), true);

  harness.audioSession.state = "interrupted";
  harness.audioSessionEvents.get("statechange")();
  assert.equal(harness.api.state.audioNeedsRecovery, true);

  assert.equal(await harness.api.unlockAudio(), true);
  assert.equal(harness.audioContexts.length, 2);
  assert.equal(harness.api.state.audioNeedsRecovery, false);
});
