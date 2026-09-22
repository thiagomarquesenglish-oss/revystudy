# Time-based scheduling (1.4.0)

Normal study uses `ts-fsrs` 5.4.2, the TypeScript FSRS implementation. This is not a port of the entire Anki scheduler or its collection format.

- Desired retention: 90%; default FSRS parameters; fuzz enabled.
- Learning steps: 1 minute, 10 minutes. Relearning: 10 minutes.
- Review intervals use local study days beginning at 04:00. Learning steps use timestamps.
- Independent records for comprehension, listening, production and writing, when supported by the card's content.
- Other skills of the same phrase are buried until the next study day. The answered skill can still return when its learning step becomes due.
- No positional retries, daily batch limit, or early reviews in normal study. Skill alternation never overrides due dates.
- Free practice ignores scheduling and does not modify FSRS records.

## Persistence and migration

IndexedDB version 3 adds `skill_schedules`. On first access, existing review history is replayed per skill to initialize memory state, but the old card's due date is preserved. New skills without history start as New. Missing schedules are created transactionally without replacing a concurrent answer.

Each answer commits its skill schedule, review log and aggregate card progress in one transaction. A revision check rejects stale concurrent answers. The aggregate card due date is the earliest eligible skill date; it is not the authoritative per-skill state.

Schedules are local to the device, consistent with the existing local progress design. Full backups include them and old backups remain accepted. Content publication/download does not synchronize these schedules. No automatic parameter optimization or Anki import/export compatibility is claimed. The separate legacy dictation route has its own scheduler; writing exercises in normal study use FSRS.

References: https://github.com/open-spaced-repetition/ts-fsrs and https://docs.ankiweb.net/deck-options.html#fsrs
