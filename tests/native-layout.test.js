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

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("control rail stays pinned to the physical bottom without a rotation animation", () => {
  const body = between(contentView, "var body: some View", "private func timerReadout");
  const orientationRefresh = between(
    contentView,
    "private func refreshInterfaceOrientation",
    "private func audioMenuTransition"
  );

  assert.match(
    body,
    /\.padding\(controlInsets\(for: layoutOrientation\)\)[\s\S]*controlOffset\([\s\S]*safeAreaInsets: geometry\.safeAreaInsets[\s\S]*\.animation\(nil, value: layoutOrientation\)/
  );
  assert.match(contentView, /let edgeGap: CGFloat = 6/);
  assert.match(contentView, /safeAreaInsets\.leading - edgeGap/);
  assert.match(contentView, /safeAreaInsets\.trailing - edgeGap/);
  assert.match(contentView, /safeAreaInsets\.bottom - 8/);
  assert.match(contentView, /height: bottomExtension \/ 2/);
  assert.match(orientationRefresh, /interfaceOrientation = orientation/);
  assert.doesNotMatch(orientationRefresh, /withAnimation/);
});

test("landscape countdown has no vertical offset from the physical screen center", () => {
  const readout = between(contentView, "private func timerReadout", "private var audioButton");
  const countdown = between(
    readout,
    "Text(timer.countdownText)",
    'Text(timer.isFinished ? "COMPLETE" : timer.roundText)'
  );

  assert.doesNotMatch(countdown, /\.offset\(/);
});
