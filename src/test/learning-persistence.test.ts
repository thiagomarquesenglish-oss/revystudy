import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import { localDB, offlineQueue } from "@/lib/offline-db";
beforeEach(async () => {
  await localDB.clearForFullRestore();
});
it("atomically persists every imported card together with its retry record", async () => {
  const rows = [
    { id: "one", deck_id: "d", front: "English" },
    { id: "two", deck_id: "d", front: "Portuguese" },
  ];
  await localDB.commitLearningBatch(rows);
  expect(await localDB.getCards()).toEqual(rows);
  expect((await offlineQueue.getAll()).map((m) => m.payload)).toEqual(rows);
});
it("rolls back the whole batch when a row cannot be saved", async () => {
  await expect(
    localDB.commitLearningBatch([
      { id: "one", deck_id: "d" },
      { deck_id: "d" },
    ]),
  ).rejects.toThrow();
  expect(await localDB.getCards()).toEqual([]);
  expect(await offlineQueue.getAll()).toEqual([]);
});
it("records review and schedule locally without creating cloud mutations", async () => {
  const card = { id: "one", deck_id: "d", front: "unchanged", review_count: 1 };
  const review = {
    id: "event",
    card_id: "one",
    rating: "good",
    exercise_mode: "audio-dictation",
  };
  await localDB.commitLearningReview(card, review);
  expect(await localDB.getCard("one")).toEqual(card);
  expect(await localDB.getReviewHistory()).toEqual([review]);
  expect(await offlineQueue.getAll()).toEqual([]);
});
it('commits FSRS atomically and rejects stale reviews from another tab', async () => {
  await localDB.saveSkillSchedules([{id:'schedule', updated_at:'v1'}]);
  await localDB.commitLearningReview({id:'one'}, {id:'first'}, {id:'schedule', updated_at:'v2'}, 'v1');
  await expect(localDB.commitLearningReview({id:'one', wrong:true}, {id:'second'}, {id:'schedule', updated_at:'v3'}, 'v1')).rejects.toThrow();
  expect(await localDB.getCard('one')).toEqual({id:'one'});
  expect(await localDB.getReviewHistory()).toEqual([{id:'first'}]);
  expect(await localDB.getSkillSchedules()).toEqual([{id:'schedule', updated_at:'v2'}]);
  expect(await localDB.initializeSkillSchedules([{id:'schedule',updated_at:'old'}])).toEqual([{id:'schedule',updated_at:'v2'}]);
});
