const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const contentView = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "ios",
    "WrestlingTimer",
    "WrestlingTimer",
    "ContentView.swift"
  ),
  "utf8"
);

const setupSource = contentView.slice(contentView.indexOf("private struct SetupView"));

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("workout setup edits a draft and exposes explicit discard and apply actions", () => {
  assert.match(contentView, /SetupView\(initialSettings: timer\.settings\)/);
  assert.match(setupSource, /@State private var draft: TimerSettings/);
  assert.match(setupSource, /accessibilityLabel\("Discard workout changes"\)/);
  assert.match(
    setupSource,
    /Button \{\s*timer\.settings = draft\s*timer\.reset\(\)\s*dismiss\(\)/
  );
});

test("phase durations use the requested preset blocks with None only for Get Ready", () => {
  const ready = between(setupSource, 'title: "Get Ready"', 'title: "Wrestle"');
  const wrestle = between(setupSource, 'title: "Wrestle"', 'title: "Rest"');
  const rest = between(setupSource, 'title: "Rest"', "RoundSelector(");

  for (const seconds of [0, 5, 10, 15, 30]) {
    assert.match(ready, new RegExp(`DurationPreset\\(seconds: ${seconds},`));
  }
  for (const seconds of [15, 30, 60, 120, 360]) {
    assert.match(wrestle, new RegExp(`DurationPreset\\(seconds: ${seconds},`));
  }
  for (const seconds of [5, 10, 20, 30, 45]) {
    assert.match(rest, new RegExp(`DurationPreset\\(seconds: ${seconds},`));
  }

  assert.doesNotMatch(ready, /DurationPreset\(seconds: 60,/);
  assert.match(ready, /label: "NONE"/);
  assert.doesNotMatch(wrestle, /label: "NONE"/);
  assert.doesNotMatch(rest, /label: "NONE"/);
  assert.match(rest, /customRange: 1\.\.\.3_600/);
});

test("workout setup has no wheel duration picker or typed custom time field", () => {
  assert.doesNotMatch(setupSource, /\.pickerStyle\(\.wheel\)/);
  assert.doesNotMatch(setupSource, /Picker\("(Minutes|Seconds)"/);
  assert.match(setupSource, /TimeAdjustment\(delta: -60, label: "−1m"\)/);
  assert.match(setupSource, /TimeAdjustment\(delta: -5, label: "−5s"\)/);
  assert.match(setupSource, /TimeAdjustment\(delta: 5, label: "\+5s"\)/);
  assert.match(setupSource, /TimeAdjustment\(delta: 60, label: "\+1m"\)/);
});

test("selected time blocks are visibly and accessibly distinct", () => {
  assert.match(setupSource, /Image\(systemName: "checkmark\.circle\.fill"\)/);
  assert.match(setupSource, /\.stroke\(selected \? tint[\s\S]*lineWidth: selected \? 2 : 1\)/);
  assert.match(setupSource, /accessibilityAddTraits\(selected \? \.isSelected : \[\]\)/);
  assert.match(setupSource, /accessibilityAddTraits\(customSelected \? \.isSelected : \[\]\)/);
});
