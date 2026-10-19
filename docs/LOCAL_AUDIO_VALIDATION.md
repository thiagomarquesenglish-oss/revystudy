# Local audio: validation gate (1.6.2)

This release implements only phase 1 of the agreed offline-first plan. Do not
switch study playback or migrate more storage until the installed iPhone PWA
passes the device checks below. Desktop/unit tests do not establish iOS sound
output.

## Isolated implementation

- Settings contains “Teste de áudio sem internet”. Nothing downloads on opening.
- One explicit action selects up to five distinct MP3s from older/newer cards.
- Complete MP3 bytes are stored in `revystudy-local-audio-proof-v1` and verified
  with SHA-256 after reading them back from persistent storage.
- Per-user metadata is persisted separately. Existing verified samples are
  reused; missing/evicted files are repaired on the next explicit preparation.
- Native audio controls use same-origin `/__local_audio/v1/<user>/<hash>.mp3`.
- A classic service-worker extension serves full GET, HEAD and single-byte-range
  requests. Missing files return 404, never the app shell or a cloud fallback.
- No Web Audio, object URLs, PCM cache or automatic retry loop in this proof.
- Existing study playback, schedules, cards and cloud data are unchanged.
- Removing the sample deletes only its experimental files and metadata.

## Real-device acceptance (pending)

1. Confirm 1.6.2 in Settings and prepare the sample while online.
2. Play each sample, including repeat playback and seeking.
3. Enable airplane mode (also disable Wi-Fi), repeat the same tests.
4. Fully close and reopen the installed PWA offline; return to Settings and play.
5. Repeat after a device lock/unlock. Confirm actual audible output, not just
   an advancing indicator. Copy diagnostic events on failure.

`local-proof-time-advanced` records that the native playback clock advanced; it
does not claim that the user heard sound. Tests cover persistent readback,
integrity failures, repair, account isolation, lifecycle/UI and the exact worker
script's 200/206/404/416 responses.

## Deferred work

Full deck installation (images included), offline account/session UX, incremental
manifests, independent package import/export and PC media publication remain
subsequent phases. Existing old download caches are not migrated into this
experiment. Retain the PC originals and existing backups throughout validation.
