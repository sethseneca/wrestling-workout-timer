const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const nativeRoot = path.join(__dirname, "..", "ios", "WrestlingTimer");
const appRoot = path.join(nativeRoot, "WrestlingTimer");

const contentView = fs.readFileSync(path.join(appRoot, "ContentView.swift"), "utf8");
const workoutTimer = fs.readFileSync(path.join(appRoot, "WorkoutTimer.swift"), "utf8");
const activityController = fs.readFileSync(
  path.join(appRoot, "WorkoutLiveActivityController.swift"),
  "utf8"
);
const liveActivity = fs.readFileSync(
  path.join(nativeRoot, "WrestlingTimerLiveActivity", "WrestlingTimerLiveActivity.swift"),
  "utf8"
);

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("full-screen timer uses one crisp condensed SF hierarchy", () => {
  const readout = between(
    contentView,
    "private func timerReadout",
    "private var audioButton"
  );

  assert.doesNotMatch(contentView, /DINCondensed|fightFont/);
  assert.equal((readout.match(/design: \.default/g) || []).length, 3);
  assert.equal((readout.match(/\.fontWidth\(\.condensed\)/g) || []).length, 3);
  assert.match(readout, /Text\(timer\.countdownText\)[\s\S]*\.monospacedDigit\(\)/);
  assert.match(readout, /let roundSize: CGFloat = showingAudioMenu \? 24 : 34/);
  assert.match(readout, /\.foregroundStyle\(\.white\.opacity\(0\.85\)\)/);
  assert.doesNotMatch(readout, /\.shadow\(/);
});

test("live activity uses the same condensed system display language", () => {
  assert.doesNotMatch(liveActivity, /design: \.rounded/);
  assert.match(liveActivity, /font: \.system\(size: 38, weight: \.black, design: \.default\)/);
  assert.match(liveActivity, /font: \.system\(size: 34, weight: \.black, design: \.default\)/);
  assert.match(liveActivity, /\.fontWidth\(\.condensed\)/);
  assert.match(liveActivity, /\.fontWidth\(\.compressed\)/);
});

test("shorter wording stays consistent across timer and configuration surfaces", () => {
  assert.match(workoutTimer, /case ready = "READY"/);
  assert.ok(workoutTimer.includes('"ROUND \\(round) / \\(settings.rounds)"'));
  assert.match(activityController, /state\.phase != WorkoutPhase\.ready\.rawValue/);
  assert.ok(liveActivity.includes('Text("ROUND \\(state.round) / \\(state.totalRounds)")'));
  assert.match(liveActivity, /case "READY": return Color\(white: 0\.68\)/);
  assert.ok(contentView.includes('timer.isFinished ? "COMPLETE" : timer.roundText'));

  for (const text of [
    "AUDIO",
    "AUTO CUES",
    "SOUNDBOARD",
    "10-SECOND WARNING",
    "SET YOUR INTERVALS",
    "Choose a duration for each phase.",
    "APPLY WORKOUT"
  ]) {
    assert.ok(contentView.includes(`"${text}"`), `Missing updated wording: ${text}`);
  }
});
