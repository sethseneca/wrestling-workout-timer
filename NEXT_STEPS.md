# Next Steps

## Highest-Leverage Next Step

Verify the whistle boost and audio-session behavior on an iPhone:

1. Start Music or a podcast, use Sound Check at 100%, 150%, and 200%, and confirm each step above 100% makes the whistle clearly louder without stopping the music.
2. Leave the running timer, return to it, and confirm sound resumes automatically without pressing or tapping anything.
3. If iOS reloads the app, confirm the restored countdown keeps moving with `Timer running - tap anywhere to restore sound`, then one tap restores sound without pausing the timer.
4. Repeat the leave/return cycle twice so recovery is proven beyond the first interruption.

## Staff Meeting Notes

- Keep the first version focused on one excellent interval timer.
- Avoid accounts, payments, and Cloudways setup until the product shape is clearer.
- Keep the Web Audio session mixable; do not restore a hidden looping media element because that can take over Music playback.
- A static PWA cannot sound while fully backgrounded on iOS. A native wrapper is the future path only if background cues become a requirement.
