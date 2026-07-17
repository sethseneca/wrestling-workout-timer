const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appPath = path.join(__dirname, "..", "app.js");
const appSource = fs.readFileSync(appPath, "utf8");

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
      this.startedSources = [];
      this.state = this.behavior.initialState || "suspended";
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
      return {
        buffer: null,
        connect() {},
        start(when) { context.startedSources.push(when); },
        stop() {}
      };
    }

    createGain() {
      return {
        connect() {},
        gain: { setValueAtTime() {} }
      };
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
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
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
      playWhistleStart: playWhistleStart,
      handleAppReturn: handleAppReturn,
      handleAudioContextStateChange: handleAudioContextStateChange,
      handleVisibilityChange: handleVisibilityChange,
      recoverAudioForPlayback: recoverAudioForPlayback,
      setAudioTimeout: function (milliseconds) { AUDIO_OPERATION_TIMEOUT_MS = milliseconds; }
    };
  })();`;
  const instrumentedSource = appSource.replace(/\}\)\(\);\s*$/, hook);

  vm.runInNewContext(instrumentedSource, context, { filename: appPath });

  return {
    api: window.__timerTest.api,
    audioContexts,
    audioSession,
    audioSessionEvents,
    createdTags,
    document,
    documentEvents,
    elements,
    windowEvents
  };
}

test("uses a mixable Web Audio session without an HTML audio fallback", async () => {
  const harness = createHarness();

  assert.equal(harness.audioSession.type, "ambient");
  assert.equal(await harness.api.unlockAudio(), true);
  assert.equal(harness.audioContexts.length, 1);
  assert.equal(Object.keys(harness.api.state.audioBuffers).length, 4);
  assert.equal(harness.createdTags.includes("audio"), false);

  harness.api.playWhistleStart(0);
  assert.equal(harness.audioContexts[0].startedSources.length, 1);
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

  harness.api.playWhistleStart(0);
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

test("a cold reload pauses a running timer until sound is unlocked again", async () => {
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
  assert.equal(harness.api.state.isRunning, false);
  assert.equal(harness.audioContexts.length, 0);
  assert.equal(harness.elements.get("audioResumeNotice").hidden, false);
  assert.equal(harness.elements.get("playButtonLabel").textContent, "Resume");

  await harness.api.handlePlayPause();
  assert.equal(harness.api.state.isRunning, true);
  assert.equal(harness.api.state.audioContext.state, "running");
  assert.equal(harness.elements.get("audioResumeNotice").hidden, true);
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
