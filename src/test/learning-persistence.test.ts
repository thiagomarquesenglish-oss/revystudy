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
it("records review and schedule together and queues only progress fields", async () => {
  const card = { id: "one", deck_id: "d", front: "unchanged", review_count: 1 };
  const review = {
    id: "event",
    card_id: "one",
    rating: "good",
    exercise_mode: "audio-dictation",
  };
  const progress = { id: "one", review_count: 1 };
  await localDB.commitLearningReview(card, review, progress);
  expect(await localDB.getCard("one")).toEqual(card);
  expect(await localDB.getReviewHistory()).toEqual([review]);
  const queue = await offlineQueue.getAll();
  expect(queue[0].payload).toEqual(progress);
  expect(queue[1].payload).toEqual(review);
});
