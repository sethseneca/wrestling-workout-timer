# Audio Assets

- `whistle-start.m4a` - trimmed AAC conversion from the project owner-provided YouTube source: https://youtu.be/ckRWzFKWr6M
- `ready.m4a`, `set.m4a` - trimmed AAC conversions built from Freesound sound `529843` by dastudiospr, licensed Creative Commons 0: https://freesound.org/s/529843/
- `three.m4a`, `two.m4a`, `one.m4a` - trimmed AAC conversions built from `54321` by voiceoverpaul/Freesound Community on Pixabay, licensed under the Pixabay Content License.
- `rest-horn.m4a`, `final-horn.m4a` - duplicate whistle cue files built from Freesound sound `218318` by SpliceSound, licensed Creative Commons 0.
- `ten-second-pop.m4a` - trimmed AAC conversion built from BigSoundBank Clapperboard (`1011`), licensed CC0/public domain.
- `ios/WrestlingTimer/WrestlingTimer/Assets/air-horn.m4a` - 11.6-second mono AAC conversion of `Air horn sound effect long.mp3`, supplied by the project owner on 2026-08-04 for this private app. Conversion removes only the source file's leading and trailing dead air and preserves the complete active horn.
  - Supplied source MP3 SHA-256: `1c9c9d39ad8971b0bd3a0204f5124f1d1b5e43625352cbed99108ebeb782a5c1`
  - Bundled M4A SHA-256: `71f52c5db339a4e78f8596f8056042823cbc0e91a54d0a12a8800a4337492c2f`

## Native iPhone bundle

The native app copies `ready.m4a`, `set.m4a`, `whistle-start.m4a`, `final-horn.m4a`, `air-horn.m4a`, `rest-horn.m4a`, and `ten-second-clapper.m4a` into `ios/WrestlingTimer/WrestlingTimer/Assets/`. The native `whistle-start.m4a` copy is converted to mono 44.1 kHz AAC so every manual sound uses the same AVAudioEngine format; its source and ownership remain the project-owner-provided recording listed above.

The native soundboard's `Air Horn` uses the project-owner-supplied recording above, trimmed to remove dead air and converted to the app's shared mono 44.1 kHz format.
