# Laptop Setup

The laptop is the primary development machine for this project. GitHub `main` is the source of truth.

## 1. Install the essentials

- Codex
- Git and the GitHub CLI
- Node.js 20 or newer
- Google Chrome
- Xcode from the Mac App Store when working on the native iPhone app

Homebrew is optional. If it is already installed, the command-line tools can be installed with:

```sh
brew install git gh node
```

Sign in to GitHub once:

```sh
gh auth login
```

## 2. Get the project

If the project is not already on the laptop:

```sh
mkdir -p "$HOME/Documents"
cd "$HOME/Documents"
git clone https://github.com/sethseneca/wrestling-workout-timer.git "Wrestling Workout Timer"
cd "Wrestling Workout Timer"
```

If the folder already exists:

```sh
cd "$HOME/Documents/Wrestling Workout Timer"
git status -sb
git pull --ff-only
```

Do not pull over uncommitted laptop changes. Review, commit, or stash them first.

## 3. Verify the web app

This project has no npm dependencies, so `npm install` is not required.

```sh
npm test
node tests/browser-smoke.js
```

The second command requires Google Chrome at `/Applications/Google Chrome.app`.

## 4. Prepare native iPhone development

Install and open Xcode once so it can finish setup. In Xcode, add Seth's Apple Account, download the current iOS platform support, and select a development team for the `Wrestling Timer` target.

Compile without signing:

```sh
xcodebuild \
  -project ios/WrestlingTimer/WrestlingTimer.xcodeproj \
  -scheme "Wrestling Timer" \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build
```

A signed install and physical iPhone test are still required before claiming native background audio works.

## 5. Daily machine-switch rule

Start work with:

```sh
git status -sb
git pull --ff-only
```

End work by validating, committing the requested files, and pushing `main`. Do not edit the project on the Mac Mini and laptop at the same time.

If the Mac Mini is used again, pull from GitHub before making any change. Browser data such as saved timer presets lives in each browser's `localStorage` and does not sync through GitHub.

## Project locations

- GitHub: <https://github.com/sethseneca/wrestling-workout-timer>
- Live web app: <https://sethseneca.github.io/wrestling-workout-timer/>
- Native project: `ios/WrestlingTimer/WrestlingTimer.xcodeproj`
- Project rules: `AGENTS.md`
- Current technical handoff: `CLAUDE_HANDOFF.md`
