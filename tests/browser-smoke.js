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
  ], { stdio: "ignore" });

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
        window.__audioStarts = 0;
        const NativeAudioContext = window.AudioContext;
        window.AudioContext = new Proxy(NativeAudioContext, {
          construct(target, args) {
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
            return context;
          }
        });
      `
    });

    const loaded = client.waitFor("Page.loadEventFired");
    await client.send("Page.navigate", { url: appUrl });
    await loaded;

    const evaluation = await client.send("Runtime.evaluate", {
      expression: `
        (async function () {
          document.getElementById("startButton").click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          document.querySelector('[data-manual-cue="whistle"]').click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          return {
            audioElements: document.querySelectorAll("audio").length,
            audioStarts: window.__audioStarts,
            audioNoticeHidden: document.getElementById("audioResumeNotice").hidden,
            playLabel: document.getElementById("playButtonLabel").textContent,
            phase: document.getElementById("phaseLabel").textContent
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const result = evaluation.result.value;
    assert.equal(result.playLabel, "Pause");
    assert.equal(result.phase, "GET READY");
    assert.equal(result.audioElements, 0);
    assert.equal(result.audioNoticeHidden, true);
    assert.ok(result.audioStarts >= 1, "The manual whistle should start a Web Audio source");

    const reloaded = client.waitFor("Page.loadEventFired");
    await client.send("Runtime.evaluate", {
      expression: `
        localStorage.setItem("wrestlingWorkoutTimerState", JSON.stringify({
          settings: { workSeconds: 30, restSeconds: 15, readySeconds: 10, rounds: 2 },
          currentIndex: 0,
          remainingMs: 9000,
          hasStarted: true,
          isRunning: true,
          isDone: false,
          savedAt: Date.now()
        }));
        location.reload();
      `
    });
    await reloaded;

    const coldRestoreEvaluation = await client.send("Runtime.evaluate", {
      expression: `
        (async function () {
          const before = {
            audioNoticeHidden: document.getElementById("audioResumeNotice").hidden,
            playLabel: document.getElementById("playButtonLabel").textContent
          };
          document.getElementById("startButton").click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          document.querySelector('[data-manual-cue="whistle"]').click();
          await new Promise((resolve) => setTimeout(resolve, 250));
          return {
            before,
            after: {
              audioNoticeHidden: document.getElementById("audioResumeNotice").hidden,
              audioStarts: window.__audioStarts,
              playLabel: document.getElementById("playButtonLabel").textContent
            }
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    const coldRestore = coldRestoreEvaluation.result.value;
    assert.equal(coldRestore.before.playLabel, "Resume");
    assert.equal(coldRestore.before.audioNoticeHidden, false);
    assert.equal(coldRestore.after.playLabel, "Pause");
    assert.equal(coldRestore.after.audioNoticeHidden, true);
    assert.ok(coldRestore.after.audioStarts >= 1, "The cold-restored timer should recover Web Audio after the resume tap");
    assert.deepEqual(runtimeErrors, []);

    console.log(JSON.stringify({ freshStart: result, coldRestore }));
    socket.close();
  } finally {
    chrome.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      delay(1500)
    ]);
    await new Promise((resolve) => staticServer.close(resolve));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        fs.rmSync(chromeProfile, { force: true, recursive: true });
        break;
      } catch (error) {
        if (attempt === 4) {
          throw error;
        }
        await delay(100);
      }
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
