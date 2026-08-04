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

test("manual start whistle never suppresses a timer whistle", () => {
  assert.doesNotMatch(contentView, /NEXT WHISTLE SKIPPED|Manual start already played|Button\("Undo"\)/);
  assert.doesNotMatch(workoutTimer, /nextStartCueHandled|suppressNextWhistleAtOrAfter/);
  assert.match(workoutTimer, /func playManualStartWhistle\(\) \{\s*audio\.playNow\(\.startWhistle/);
});

test("soundboard has one full-width final horn backed by the air horn asset", () => {
  assert.equal((contentView.match(/title: "FINAL HORN"/g) || []).length, 1);
  assert.doesNotMatch(contentView, /title: "AIR HORN"/);
  assert.match(
    workoutTimer,
    /func playManualFinalHorn\(\) \{\s*audio\.playNow\(\.airHorn/
  );
  assert.doesNotMatch(audioScheduler, /case finalHorn|buffers\[\.finalHorn\]/);
});
