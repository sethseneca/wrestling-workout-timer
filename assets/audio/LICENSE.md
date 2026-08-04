# Audio Assets

- `whistle-start.m4a` - trimmed AAC conversion from the project owner-provided YouTube source: https://youtu.be/ckRWzFKWr6M
- `ready.m4a`, `set.m4a` - trimmed AAC conversions built from Freesound sound `529843` by dastudiospr, licensed Creative Commons 0: https://freesound.org/s/529843/
- `three.m4a`, `two.m4a`, `one.m4a` - trimmed AAC conversions built from `54321` by voiceoverpaul/Freesound Community on Pixabay, licensed under the Pixabay Content License.
- `rest-horn.m4a`, `final-horn.m4a` - duplicate whistle cue files built from Freesound sound `218318` by SpliceSound, licensed Creative Commons 0.
- `ten-second-pop.m4a` - trimmed AAC conversion built from BigSoundBank Clapperboard (`1011`), licensed CC0/public domain.
- `ten-second-clapper.m4a` and `ios/WrestlingTimer/WrestlingTimer/Assets/ten-second-clapper.m4a` - mono AAC master built from BigSoundBank sound `1590`, `Gavel, 3 Blows`, recorded by Joseph Sardin and licensed CC0/public domain. The original three-hit master is restored without added reflections, EQ, or compression. The native Three Claps pad applies a clean 2x playback gain so the same recording plays louder without manufacturing extra hits.
  - Shared original M4A SHA-256: `3a11c2f1327f609ebb3399ef992982f572f3f70af1b1788815eb2c50b61ba342`
- `ios/WrestlingTimer/WrestlingTimer/Assets/air-horn.m4a` - 2.0-second mono AAC excerpt of `Air horn sound effect long.mp3`, supplied by the project owner on 2026-08-04 for this private app. Conversion removes the source file's leading dead air and applies a smooth 0.5-second fade to the sustained horn.
  - Supplied source MP3 SHA-256: `1c9c9d39ad8971b0bd3a0204f5124f1d1b5e43625352cbed99108ebeb782a5c1`
  - Bundled M4A SHA-256: `2347b213b0b254ee762b4116f0100d6b7e250e5bb2ee57222ff130cc9aa4caa9`
- `ios/WrestlingTimer/WrestlingTimer/Assets/round-one.m4a` - 2.32-second mono AAC excerpt of `Round 1 Fight, Round 2 Fight, Final Round Fight - Sound Effect.mp3`, supplied by the project owner on 2026-08-04 for this private app. The bundled cue uses only the first spoken segment, trims the surrounding silence, adds short edge fades, and normalizes the peak without clipping.
  - Supplied source MP3 SHA-256: `92f4a5f3cf1e36c430ebf02e0a91dcdbdc3e37cc8ee37f9cf211b25a9cfd29a0`
  - Bundled M4A SHA-256: `1c03ea84c52bababd5b500c7296b841241387286fe76f868b9de6bd2e18fccd6`

## Native iPhone bundle

The native app bundles `round-one.m4a`, `air-horn.m4a`, `rest-horn.m4a`, and `ten-second-clapper.m4a`. The legacy `ready.m4a`, `set.m4a`, `whistle-start.m4a`, and `final-horn.m4a` files remain in the repository for history but are no longer included in the iPhone app.

The native soundboard's `Final Horn` and every automatic Rest-start cue use the same project-owner-supplied air-horn recording above, shortened to 2.0 seconds with a 0.5-second fade and converted to the app's shared mono 44.1 kHz format.
