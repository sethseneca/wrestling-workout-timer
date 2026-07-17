# Next Steps

## Highest-Leverage Next Step

Verify the audio-session fix on an iPhone before publishing it:

1. Start Music or a podcast, then start the timer and confirm both remain audible.
2. Leave the running timer, return to it, and confirm the next whistle, 10-second cue, and horn sound.
3. If iOS reloads the app, confirm it pauses at the restored time with `Tap play to resume with sound`, then resumes audibly.
4. Repeat the leave/return cycle twice so recovery is proven beyond the first interruption.

## Staff Meeting Notes

- Keep the first version focused on one excellent interval timer.
- Avoid accounts, payments, and Cloudways setup until the product shape is clearer.
- Keep the Web Audio session mixable; do not restore a hidden looping media element because that can take over Music playback.
- A static PWA cannot sound while fully backgrounded on iOS. A native wrapper is the future path only if background cues become a requirement.
