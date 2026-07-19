const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function requestJson(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}: ${body}`));
          return;
        }

        resolve(JSON.parse(body));
      });
    });
    request.once("error", reject);
    request.end();
  });
}

async function waitForJson(url, attempts = 60) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJson(url);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }

  throw lastError;
}

function createStaticServer() {
  const contentTypes = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".m4a": "audio/mp4",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json"
  };

  return http.createServer((request, response) => {
    const requestPath = new URL(request.url, "http://127.0.0.1").pathname;
    const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
    const filePath = path.resolve(projectRoot, relativePath);

    if (!filePath.startsWith(`${projectRoot}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }

    fs.readFile(filePath, (error, contents) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
      response.end(contents);
    });
  });
}

class DevToolsClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(JSON.parse(event.data)));
  }

  handleMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
      return;
    }

    const listeners = this.events.get(message.method) || [];
    listeners.forEach((listener) => listener(message.params));
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  waitFor(method) {
    return new Promise((resolve) => {
      const listeners = this.events.get(method) || [];
      const listener = (params) => {
        this.events.set(method, listeners.filter((candidate) => candidate !== listener));
        resolve(params);
      };
      listeners.push(listener);
      this.events.set(method, listeners);
    });
  }
}

async function assertLandscapeLayout(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
    screenOrientation: { type: "landscapePrimary", angle: 90 }
  });
  await delay(150);

  const evaluation = await client.send("Runtime.evaluate", {
    expression: `
      (function () {
        function rect(element) {
          const bounds = element.getBoundingClientRect();
          return {
            bottom: bounds.bottom,
            height: bounds.height,
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            width: bounds.width
          };
        }

        function textRect(element) {
          const range = document.createRange();
          range.selectNodeContents(element);
          return rect(range);
        }

        const elements = {
          countdown: document.getElementById("countdown"),
          phase: document.getElementById("phaseLabel"),
          round: document.getElementById("roundCounter"),
          reset: document.getElementById("resetButton"),
          previous: document.getElementById("skipBackButton"),
          play: document.getElementById("startButton"),
          next: document.getElementById("skipButton"),
          whistle: document.querySelector('[data-manual-cue="whistle"]'),
          settings: document.getElementById("settingsToggleButton")
        };
        const required = Object.fromEntries(
          Object.entries(elements).map(([name, element]) => [name, rect(element)])
        );
        const controls = ["reset", "previous", "play", "next", "whistle"];
        const overlaps = [];

        for (let first = 0; first < controls.length; first += 1) {
          for (let second = first + 1; second < controls.length; second += 1) {
            const a = required[controls[first]];
            const b = required[controls[second]];
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
              overlaps.push([controls[first], controls[second]]);
            }
          }
        }

        return {
          viewport: { width: innerWidth, height: innerHeight },
          documentSize: {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight
          },
          required,
          countdownText: textRect(elements.countdown),
          phaseText: textRect(elements.phase),
          roundText: textRect(elements.round),
          timerDisplay: rect(document.querySelector(".timer-display")),
          console: rect(document.querySelector(".control-console")),
          overlaps
        };
      })()
    `,
    returnByValue: true
  });
  const layout = evaluation.result.value;

  assert.deepEqual(layout.viewport, { width, height });
  assert.ok(layout.documentSize.width <= width, `${width}x${height} should not scroll horizontally`);
  assert.ok(layout.documentSize.height <= height, `${width}x${height} should not scroll vertically`);

  for (const [name, bounds] of Object.entries(layout.required)) {
    assert.ok(bounds.width > 0 && bounds.height > 0, `${name} should be visible at ${width}x${height}`);
    assert.ok(bounds.left >= -0.5 && bounds.top >= -0.5, `${name} should start inside ${width}x${height}`);
    assert.ok(bounds.right <= width + 0.5 && bounds.bottom <= height + 0.5, `${name} should fit inside ${width}x${height}`);
  }

  for (const name of ["reset", "previous", "play", "next", "whistle", "settings"]) {
    assert.ok(layout.required[name].width >= 44, `${name} should be at least 44px wide at ${width}x${height}`);
    assert.ok(layout.required[name].height >= 44, `${name} should be at least 44px tall at ${width}x${height}`);
  }

  for (const [name, bounds] of Object.entries({
    countdown: layout.countdownText,
    phase: layout.phaseText,
    round: layout.roundText
  })) {
    assert.ok(bounds.left >= -0.5 && bounds.right <= width + 0.5, `${name} text should fit horizontally at ${width}x${height}`);
    assert.ok(bounds.top >= -0.5 && bounds.bottom <= height + 0.5, `${name} text should fit vertically at ${width}x${height}`);
  }

  assert.ok(layout.timerDisplay.right <= layout.console.left, `Timer and controls should not overlap at ${width}x${height}`);
  assert.deepEqual(layout.overlaps, [], `Main controls should not overlap at ${width}x${height}`);
  return layout;
}

async function main() {
  assert.equal(fs.existsSync(chromePath), true, "Chrome is required for the browser smoke test");

  const staticServer = createStaticServer();
  await new Promise((resolve) => staticServer.listen(0, "127.0.0.1", resolve));
  const appPort = staticServer.address().port;
  const debugPort = await getFreePort();
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), "wrestling-timer-chrome-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank"
  ], { stdio: "ignore", detached: true });

  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    const appUrl = `http://127.0.0.1:${appPort}/`;
    const page = await requestJson(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(appUrl)}`, "PUT");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });

    const client = new DevToolsClient(socket);
    const runtimeErrors = [];
    client.events.set("Runtime.exceptionThrown", [(params) => runtimeErrors.push(params.exceptionDetails.text)]);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        if (new URLSearchParams(location.search).has("cold-restore")) {
          localStorage.setItem("wrestlingWorkoutTimerState", JSON.stringify({
            settings: { workSeconds: 30, restSeconds: 15, readySeconds: 10, rounds: 2, whistleVolume: 125 },
            currentIndex: 0,
            remainingMs: 9000,
            hasStarted: true,
            isRunning: true,
            isDone: false,
            savedAt: Date.now()
          }));
        }
        window.__audioStarts = 0;
        window.__audioContextCount = 0;
        window.__audioGains = [];
        window.__compressorCount = 0;
        window.__oscillatorFrequencies = [];
        window.__oscillatorStarts = 0;
        window.__oscillatorStops = 0;
        window.__waveShaperCount = 0;
        window.__dropAnimationFrames = false;
        const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = function (callback) {
          if (window.__dropAnimationFrames) {
            return 999999;
          }
          return nativeRequestAnimationFrame(callback);
        };
        const NativeAudioContext = window.AudioContext;
        window.AudioContext = new Proxy(NativeAudioContext, {
          construct(target, args) {
            window.__audioContextCount += 1;
            const context = Reflect.construct(target, args);
            const createBufferSource = context.createBufferSource.bind(context);
            context.createBufferSource = function () {
              const source = createBufferSource();
              const start = source.start.bind(source);
              source.start = function (...startArgs) {
                window.__audioStarts += 1;
                return start(...startArgs);
              };
              return source;
            };
            const createGain = context.createGain.bind(context);
            context.createGain = function () {
              const gainNode = createGain();
              const setValueAtTime = gainNode.gain.setValueAtTime.bind(gainNode.gain);
              gainNode.gain.setValueAtTime = function (value, ...gainArgs) {
                window.__audioGains.push(value);
                return setValueAtTime(value, ...gainArgs);
              };
              return gainNode;
            };
            const createOscillator = context.createOscillator.bind(context);
            context.createOscillator = function () {
              const oscillator = createOscillator();
              const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
              oscillator.frequency.setValueAtTime = function (value, ...frequencyArgs) {
                window.__oscillatorFrequencies.push(value);
                return setFrequency(value, ...frequencyArgs);
              };
              const start = oscillator.start.bind(oscillator);
              oscillator.start = function (...startArgs) {
                window.__oscillatorStarts += 1;
                return start(...startArgs);
              };
              const stop = oscillator.stop.bind(oscillator);
              oscillator.stop = function (...stopArgs) {
                window.__oscillatorStops += 1;
                return stop(...stopArgs);
              };
              return oscillator;
            };
            const createDynamicsCompressor = context.createDynamicsCompressor.bind(context);
            context.createDynamicsCompressor = function () {
              window.__compressorCount += 1;
              return createDynamicsCompressor();
            };
            const createWaveShaper = context.createWaveShaper.bind(context);
            context.createWaveShaper = function () {
              window.__waveShaperCount += 1;
              return createWaveShaper();
            };
            return context;
          }
        });
      `
    });

    const loaded = client.waitFor("Page.loadEventFired");
    await client.send("Page.navigate", { url: appUrl });
    await loaded;

    const landscapeLayouts = [];
    for (const [width, height] of [[667, 375], [844, 390], [932, 430]]) {
      landscapeLayouts.push(await assertLandscapeLayout(client, width, height));
    }
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
      screenOrientation: { type: "portraitPrimary", angle: 0 }
    });
    await delay(150);
    const portraitEvaluation = await client.send("Runtime.evaluate", {
      expression: `
        ({
          flexDirection: getComputedStyle(document.querySelector(".control-console")).flexDirection,
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth
        })
      `,
      returnByValue: true
    });
    assert.deepEqual(
      portraitEvaluation.result.value,
      { flexDirection: "row", height: 844, width: 390 },
      "The landscape layout must not change the portrait console"
    );
    await client.send("Emulation.clearDeviceMetricsOverride");
    await delay(150);

    const evaluation = await client.send("Runtime.evaluate", {
      expression: `
        (async function () {
          const decodeContext = new AudioContext();
          const whistleResponse = await fetch("assets/audio/rest-horn.m4a");
          const whistleBuffer = await decodeContext.decodeAudioData(await whistleResponse.arrayBuffer());
          const clapperResponse = await fetch("assets/audio/ten-second-clapper.m4a");
          const clapperBuffer = await decodeContext.decodeAudioData(await clapperResponse.arrayBuffer());
          await decodeContext.close();

          function detectClapperHitTimes(audioBuffer) {
            const samples = audioBuffer.getChannelData(0);
            let peak = 0;
            for (const sample of samples) {
              peak = Math.max(peak, Math.abs(sample));
            }

            const threshold = peak * 0.35;
            const minimumGapSamples = Math.round(audioBuffer.sampleRate * 0.18);
            const hitTimes = [];
            let lastHitSample = -minimumGapSamples;

            for (let index = 0; index < samples.length; index += 1) {
              if (Math.abs(samples[index]) >= threshold && index - lastHitSample >= minimumGapSamples) {
                hitTimes.push(Number((index / audioBuffer.sampleRate).toFixed(4)));
                lastHitSample = index;
              }
            }

            return hitTimes;
          }

          const clapperHitTimes = detectClapperHitTimes(clapperBuffer);

          async function measureWhistleLoudness(volume) {
            const offlineContext = new OfflineAudioContext(1, whistleBuffer.length, whistleBuffer.sampleRate);
            const source = offlineContext.createBufferSource();
            const gain = offlineContext.createGain();
            source.buffer = whistleBuffer;
            gain.gain.setValueAtTime(volume, 0);
            source.connect(gain);

            if (volume > 1) {
              const saturator = offlineContext.createWaveShaper();
              const curve = new Float32Array(4096);
              const drive = (volume - 1) * 4;
              const normalization = Math.tanh(drive);
              for (let index = 0; index < curve.length; index += 1) {
                const input = (index * 2) / (curve.length - 1) - 1;
                curve[index] = Math.tanh(drive * input) / normalization;
              }
              saturator.curve = curve;
              saturator.oversample = "4x";
              const output = offlineContext.createGain();
              output.gain.setValueAtTime(Math.max(0.85, 0.95 - (volume - 1) * 0.1), 0);
              gain.connect(saturator);
              saturator.connect(output);
              output.connect(offlineContext.destination);
            } else {
              gain.connect(offlineContext.destination);
            }

            source.start(0);
            const rendered = await offlineContext.startRendering();
            const samples = rendered.getChannelData(0);
            let peak = 0;
            let sumSquares = 0;
            for (const sample of samples) {
              peak = Math.max(peak, Math.abs(sample));
              sumSquares += sample * sample;
            }

            return {
              peak,
              rms: Math.sqrt(sumSquares / samples.length)
            };
          }

          const whistleLoudness = {
            at100: await measureWhistleLoudness(1),
            at150: await measureWhistleLoudness(1.5),
            at200: await measureWhistleLoudness(2)
          };
          const whistleVolume = document.getElementById("whistleVolume");
          whistleVolume.value = "175";
          whistleVolume.dispatchEvent(new Event("input", { bubbles: true }));
          const workMinutes = document.getElementById("workMinutes");
          workMinutes.value = "10";
          workMinutes.dispatchEvent(new Event("input", { bubbles: true }));
          const workSeconds = document.getElementById("workSeconds");
          workSeconds.value = "0";
          workSeconds.dispatchEvent(new Event("input", { bubbles: true }));
          const readySeconds = document.getElementById("readySeconds");
          readySeconds.value = "0";
          readySeconds.dispatchEvent(new Event("input", { bubbles: true }));
          const rounds = document.getElementById("rounds");
          rounds.value = "1";
          rounds.dispatchEvent(new Event("input", { bubbles: true }));
          document.getElementById("startButton").click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          const audioContextCountBeforeReturn = window.__audioContextCount;
          window.dispatchEvent(new Event("blur"));
          window.dispatchEvent(new Event("focus"));
          await new Promise((resolve) => setTimeout(resolve, 250));
          const audioContextCountAfterReturn = window.__audioContextCount;
          const watchdogBefore = document.getElementById("countdown").textContent;
          window.__dropAnimationFrames = true;
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const watchdogAfter = document.getElementById("countdown").textContent;
          document.querySelector('[data-manual-cue="whistle"]').click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          const countdownDuringLongSession = document.getElementById("countdown").textContent;
          const playLabelWhileRunning = document.getElementById("playButtonLabel").textContent;
          const oscillatorStartsWhileRunning = window.__oscillatorStarts;
          const oscillatorStopsWhileRunning = window.__oscillatorStops;
          document.getElementById("settingsToggleButton").click();
          const audioStartsBeforeClapper = window.__audioStarts;
          document.querySelector('[data-sound-check="tenSecondClapper"]').click();
          await new Promise((resolve) => setTimeout(resolve, 1300));
          const clapperSequenceStarts = window.__audioStarts - audioStartsBeforeClapper;
          document.getElementById("settingsCloseButton").click();
          document.getElementById("startButton").click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          return {
            audioElements: document.querySelectorAll("audio").length,
            audioContextCountAfterReturn,
            audioContextCountBeforeReturn,
            audioStarts: window.__audioStarts,
            clapperDuration: clapperBuffer.duration,
            clapperHitTimes,
            clapperSequenceStarts,
            compressorCount: window.__compressorCount,
            countdownDuringLongSession,
            gainValues: window.__audioGains,
            oscillatorFrequencies: window.__oscillatorFrequencies,
            oscillatorStartsWhileRunning,
            oscillatorStopsAfterPause: window.__oscillatorStops,
            oscillatorStopsWhileRunning,
            waveShaperCount: window.__waveShaperCount,
            audioNoticeHidden: document.getElementById("audioResumeNotice").hidden,
            playLabel: playLabelWhileRunning,
            playLabelAfterPause: document.getElementById("playButtonLabel").textContent,
            phase: document.getElementById("phaseLabel").textContent,
            whistleLoudness,
            watchdogAfter,
            watchdogBefore,
            whistleVolume: document.getElementById("whistleVolumeValue").textContent
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const result = evaluation.result.value;
    assert.equal(result.playLabel, "Pause");
    assert.equal(result.playLabelAfterPause, "Resume");
    assert.equal(result.phase, "WRESTLE");
    assert.match(result.countdownDuringLongSession, /^09:5[6-9]$/);
    assert.equal(result.whistleVolume, "175%");
    assert.equal(result.audioElements, 0);
    assert.equal(result.audioNoticeHidden, true);
    assert.equal(
      result.audioContextCountAfterReturn,
      result.audioContextCountBeforeReturn,
      "A normal app return should reuse the authorized audio context"
    );
    assert.ok(result.audioStarts >= 1, "The manual whistle should start a Web Audio source");
    assert.equal(result.clapperSequenceStarts, 1, "The warning Sound Check should start the complete three-clap track once");
    assert.equal(result.clapperHitTimes.length, 3, "The fight-clapper asset should contain exactly three sharp hits");
    assert.ok(result.clapperDuration < 1.5, "The complete three-clap warning should remain short");
    for (let index = 1; index < result.clapperHitTimes.length; index += 1) {
      const gap = result.clapperHitTimes[index] - result.clapperHitTimes[index - 1];
      assert.ok(gap >= 0.2 && gap <= 0.4, "The three hits should land in rapid clap-clap-clap succession");
    }
    assert.ok(result.gainValues.includes(1), "The clapper should play at normal gain");
    assert.ok(result.oscillatorStartsWhileRunning >= 1, "A long running session should keep its audio graph active");
    assert.equal(result.oscillatorStopsWhileRunning, 0, "The keep-alive should remain active throughout the running session");
    assert.ok(result.oscillatorStopsAfterPause >= 1, "Pausing should stop the audio keep-alive");
    assert.ok(result.oscillatorFrequencies.includes(20), "The keep-alive should use a sub-audible frequency");
    assert.ok(result.gainValues.includes(0.000001), "The keep-alive should remain effectively inaudible");
    assert.ok(result.gainValues.includes(1.75), "The whistle should use its independent 175% gain");
    assert.ok(result.gainValues.includes(0.875), "The whistle boost should keep a safe output ceiling");
    assert.equal(result.compressorCount, 0, "The soft-saturation path should replace the flattening limiter");
    assert.ok(result.waveShaperCount >= 1, "Boosted whistles should pass through soft saturation");
    assert.ok(
      result.whistleLoudness.at150.rms >= result.whistleLoudness.at100.rms * 1.45,
      "150% should create a meaningful measured loudness increase"
    );
    assert.ok(
      result.whistleLoudness.at200.rms >= result.whistleLoudness.at100.rms * 1.58,
      "200% should create a strong measured loudness increase"
    );
    assert.ok(
      result.whistleLoudness.at200.rms >= result.whistleLoudness.at150.rms * 1.05,
      "200% should remain louder than 150%"
    );
    assert.ok(result.whistleLoudness.at200.peak <= 1, "The maximum boost should stay below full scale");
    assert.notEqual(result.watchdogAfter, result.watchdogBefore, "The watchdog should advance the timer when animation frames stop");

    const blankLoaded = client.waitFor("Page.loadEventFired");
    await client.send("Page.navigate", { url: "about:blank" });
    await blankLoaded;

    const reloaded = client.waitFor("Page.loadEventFired");
    await client.send("Page.navigate", { url: `${appUrl}?cold-restore=1` });
    await reloaded;

    const coldRestoreEvaluation = await client.send("Runtime.evaluate", {
      expression: `
        (async function () {
          const before = {
            audioNoticeHidden: document.getElementById("audioResumeNotice").hidden,
            countdown: document.getElementById("countdown").textContent,
            playLabel: document.getElementById("playButtonLabel").textContent
          };
          await new Promise((resolve) => setTimeout(resolve, 1100));
          const runningCountdown = document.getElementById("countdown").textContent;
          document.getElementById("startButton").click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          document.querySelector('[data-manual-cue="whistle"]').click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          return {
            before,
            runningCountdown,
            after: {
              audioNoticeHidden: document.getElementById("audioResumeNotice").hidden,
              audioStarts: window.__audioStarts,
              gainValues: window.__audioGains,
              oscillatorStarts: window.__oscillatorStarts,
              playLabel: document.getElementById("playButtonLabel").textContent,
              whistleVolume: document.getElementById("whistleVolumeValue").textContent
            }
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    const coldRestore = coldRestoreEvaluation.result.value;
    assert.equal(coldRestore.before.playLabel, "Pause");
    assert.equal(coldRestore.before.audioNoticeHidden, false);
    assert.notEqual(coldRestore.runningCountdown, coldRestore.before.countdown, "A restored running timer should keep counting before audio is unlocked");
    assert.equal(coldRestore.after.playLabel, "Pause");
    assert.equal(coldRestore.after.audioNoticeHidden, true);
    assert.equal(coldRestore.after.whistleVolume, "125%");
    assert.ok(coldRestore.after.audioStarts >= 1, "The cold-restored timer should recover Web Audio after the resume tap");
    assert.ok(coldRestore.after.oscillatorStarts >= 1, "The restored running timer should restart its audio keep-alive");
    assert.ok(coldRestore.after.gainValues.includes(1.25), "The restored whistle gain should be applied after audio recovery");
    assert.deepEqual(runtimeErrors, []);

    console.log(JSON.stringify({ freshStart: result, coldRestore, landscapeLayouts }));
    socket.close();
  } finally {
    try {
      process.kill(-chrome.pid, "SIGTERM");
    } catch (error) {
      chrome.kill("SIGTERM");
    }
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      delay(1500)
    ]);
    await delay(500);
    await new Promise((resolve) => staticServer.close(resolve));

    let profileRemoved = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        fs.rmSync(chromeProfile, { force: true, recursive: true });
        await delay(200);
        if (!fs.existsSync(chromeProfile)) {
          profileRemoved = true;
          break;
        }
      } catch (error) {
        if (attempt === 7) {
          throw error;
        }
        await delay(200);
      }
    }
    assert.equal(profileRemoved, true, "The browser test should remove its temporary Chrome profile");
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
