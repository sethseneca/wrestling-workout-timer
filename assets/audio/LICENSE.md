# Audio Assets

- `whistle-start.m4a` - trimmed AAC conversion from the project owner-provided YouTube source: https://youtu.be/ckRWzFKWr6M
- `ready.m4a`, `set.m4a` - trimmed AAC conversions built from Freesound sound `529843` by dastudiospr, licensed Creative Commons 0: https://freesound.org/s/529843/
- `three.m4a`, `two.m4a`, `one.m4a` - trimmed AAC conversions built from `54321` by voiceoverpaul/Freesound Community on Pixabay, licensed under the Pixabay Content License.
- `rest-horn.m4a`, `final-horn.m4a` - duplicate whistle cue files built from Freesound sound `218318` by SpliceSound, licensed Creative Commons 0.
- `ten-second-pop.m4a` - trimmed AAC conversion built from BigSoundBank Clapperboard (`1011`), licensed CC0/public domain.

## Native iPhone bundle

The native app copies `ready.m4a`, `set.m4a`, `whistle-start.m4a`, `final-horn.m4a`, `rest-horn.m4a`, and `ten-second-clapper.m4a` into `ios/WrestlingTimer/WrestlingTimer/Assets/`. The native `whistle-start.m4a` copy is converted to mono 44.1 kHz AAC so every manual sound uses the same AVAudioEngine format; its source and ownership remain the project-owner-provided recording listed above.

The native soundboard's `Air Horn` is synthesized locally at runtime from two generated tones and does not use an external recording.
