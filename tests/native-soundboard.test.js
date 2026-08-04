const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const nativeSource = path.join(__dirname, "..", "ios", "WrestlingTimer", "WrestlingTimer");

const contentView = fs.readFileSync(path.join(nativeSource, "ContentView.swift"), "utf8");
const workoutTimer = fs.readFileSync(path.join(nativeSource, "WorkoutTimer.swift"), "utf8");
const audioScheduler = fs.readFileSync(path.join(nativeSource, "AudioCueScheduler.swift"), "utf8");

test("soundboard header has no stop or done controls", () => {
  assert.doesNotMatch(contentView, /STOP SOUND/);
  assert.doesNotMatch(contentView, /Text\("DONE"\)/);
  assert.match(contentView, /SoundboardPanel\(\)/);
});

test("soundboard slider updates every manual gain while audio is playing", () => {
  assert.match(
    workoutTimer,
    /func setSoundboardVolume[\s\S]*audio\.setManualVolume\(Float\(clampedVolume\)\)/
  );
  assert.match(
    audioScheduler,
    /func setManualVolume[\s\S]*manualGains\.forEach \{ \$0\.globalGain = gain \}/
  );
});
