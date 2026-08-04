# Audio Assets

- `whistle-start.m4a` - trimmed AAC conversion from the project owner-provided YouTube source: https://youtu.be/ckRWzFKWr6M
- `ready.m4a`, `set.m4a` - trimmed AAC conversions built from Freesound sound `529843` by dastudiospr, licensed Creative Commons 0: https://freesound.org/s/529843/
- `three.m4a`, `two.m4a`, `one.m4a` - trimmed AAC conversions built from `54321` by voiceoverpaul/Freesound Community on Pixabay, licensed under the Pixabay Content License.
- `rest-horn.m4a`, `final-horn.m4a` - duplicate whistle cue files built from Freesound sound `218318` by SpliceSound, licensed Creative Commons 0.
- `ten-second-pop.m4a` - trimmed AAC conversion built from BigSoundBank Clapperboard (`1011`), licensed CC0/public domain.
- `ios/WrestlingTimer/WrestlingTimer/Assets/air-horn.m4a` - 3.35-second mono AAC conversion of the active portion of Pixabay sound `186076`, `Air Horn`, by SoundReality (Jurij), licensed under the Pixabay Content License: https://pixabay.com/sound-effects/film-special-effects-air-horn-186076/
  - Source MP3 SHA-256: `a59a2172e827d0aa45fbf5beb1c137a963ad404e43137a5d47d9eed79d3d5d60`
  - Bundled M4A SHA-256: `4a0316f6dceeb0cebb55c2983241619b7360bf51ef89bebc329b9446a43db213`

## Native iPhone bundle

The native app copies `ready.m4a`, `set.m4a`, `whistle-start.m4a`, `final-horn.m4a`, `air-horn.m4a`, `rest-horn.m4a`, and `ten-second-clapper.m4a` into `ios/WrestlingTimer/WrestlingTimer/Assets/`. The native `whistle-start.m4a` copy is converted to mono 44.1 kHz AAC so every manual sound uses the same AVAudioEngine format; its source and ownership remain the project-owner-provided recording listed above.

The native soundboard's `Air Horn` uses the licensed Pixabay recording above, trimmed to remove its silent tail and converted to the app's shared mono 44.1 kHz format.
