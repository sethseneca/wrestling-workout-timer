const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const nativeSource = path.join(__dirname, "..", "ios", "WrestlingTimer", "WrestlingTimer");

const contentView = fs.readFileSync(path.join(nativeSource, "ContentView.swift"), "utf8");
const workoutTimer = fs.readFileSync(path.join(nativeSource, "WorkoutTimer.swift"), "utf8");
const audioScheduler = fs.readFileSync(path.join(nativeSource, "AudioCueScheduler.swift"), "utf8");
const xcodeProject = fs.readFileSync(
  path.join(nativeSource, "..", "WrestlingTimer.xcodeproj", "project.pbxproj"),
  "utf8"
);
const audioLicense = fs.readFileSync(
  path.join(nativeSource, "..", "..", "..", "assets", "audio", "LICENSE.md"),
  "utf8"
);
const airHornAsset = fs.readFileSync(path.join(nativeSource, "Assets", "air-horn.m4a"));
const nativeClapperAsset = fs.readFileSync(
  path.join(nativeSource, "Assets", "ten-second-clapper.m4a")
);
const browserClapperAsset = fs.readFileSync(
  path.join(nativeSource, "..", "..", "..", "assets", "audio", "ten-second-clapper.m4a")
);

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

test("soundboard keeps only the short whistle control", () => {
  assert.doesNotMatch(contentView, /NEXT WHISTLE SKIPPED|Manual start already played|Button\("Undo"\)/);
  assert.doesNotMatch(contentView, /title: "START WHISTLE"/);
  assert.equal((contentView.match(/title: "SHORT WHISTLE"/g) || []).length, 1);
  assert.doesNotMatch(workoutTimer, /nextStartCueHandled|suppressNextWhistleAtOrAfter|playManualStartWhistle/);
  assert.doesNotMatch(audioScheduler, /case startWhistle|buffers\[\.startWhistle\]/);
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

test("ready set is replaced by the bundled Round One cue", () => {
  assert.equal((contentView.match(/title: "ROUND ONE"/g) || []).length, 1);
  assert.doesNotMatch(contentView, /title: "READY, SET"/);
  assert.match(workoutTimer, /func playManualRoundOne\(\) \{\s*audio\.playNow\(\.roundOne/);
  assert.match(audioScheduler, /case roundOne/);
  assert.match(audioScheduler, /buffers\[\.roundOne\] = loadBuffer\(named: "round-one"\)/);
  assert.match(xcodeProject, /Assets\/round-one\.m4a in Resources/);
  assert.doesNotMatch(
    xcodeProject,
    /Assets\/(ready|set|whistle-start|final-horn)\.m4a in Resources/
  );
});

test("timer uses the final horn at every Rest start", () => {
  assert.match(
    workoutTimer,
    /case \.wrestle: return \.whistle\s*case \.rest: return \.airHorn/
  );
  assert.match(
    workoutTimer,
    /let immediateStartCue:[\s\S]*cueForPhaseStart\(startingSegment\.phase\)[\s\S]*audio\.playTimerCueNow\(\s*immediateStartCue/
  );
  assert.match(
    workoutTimer,
    /if let cue = cueForPhaseStart\(segment\.phase\) \{\s*cues\.append\(ScheduledCue\(kind: cue, offset: segment\.start\)\)/
  );
  assert.match(
    audioScheduler,
    /case \.whistle, \.airHorn:[\s\S]*buffers\[cue\][\s\S]*scheduledWhistleNode\.scheduleBuffer/
  );
  assert.match(
    audioScheduler,
    /func playTimerCueNow[\s\S]*immediateTimerGain\.globalGain[\s\S]*immediateTimerNode\.scheduleBuffer/
  );
  assert.match(workoutTimer, /ScheduledCue\(kind: \.whistle, offset: total\)/);
});

test("every final horn route uses the exact two-second shared asset", () => {
  const assetHash = crypto.createHash("sha256").update(airHornAsset).digest("hex");
  assert.equal(assetHash, "2347b213b0b254ee762b4116f0100d6b7e250e5bb2ee57222ff130cc9aa4caa9");
  assert.match(audioLicense, /2\.0-second mono AAC excerpt/);
  assert.match(audioLicense, /2\.0 seconds with a 0\.5-second fade/);
});

test("native and browser use the same weighted three-clap master", () => {
  const assetHash = crypto.createHash("sha256").update(nativeClapperAsset).digest("hex");
  assert.equal(assetHash, "c674ebd57349b4a38c6933cbecd39d48fec678b09d14b689a6a36afaec7faca4");
  assert.deepEqual(nativeClapperAsset, browserClapperAsset);
  assert.match(audioLicense, /parallel compression, low-mid body, attack definition/);
});
