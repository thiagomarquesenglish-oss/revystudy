import { describe, it, expect } from "vitest";
import {
  curriculumProgress,
  measureUnit,
  mixedCurriculumQueue,
  modeSkills,
  type LearningEvent,
} from "@/lib/learning-progress";
import { buildSituationHtml, readSituation } from "@/lib/situation";
import { manualPedagogy } from "@/lib/curriculum";
import {
  inspectAiBatch,
  batchCardHtml,
  exportLearningContext,
} from "@/lib/ai-protocol";
import type { Flashcard } from "@/lib/types";

const start = Date.parse("2026-08-01T10:00:00Z"),
  day = 86400000;
function card(id: string, stage = 1): Flashcard {
  return {
    id,
    ...buildSituationHtml({
      english: `Example ${id}`,
      portuguese: `Exemplo ${id}`,
      context: "",
      mediaHtml: "",
      pedagogy: { ...manualPedagogy(stage)!, contentId: id },
    }),
    deckId: "d",
    audioId: null,
    status: "new",
    interval: 0,
    easeFactor: 2.5,
    stepsIndex: 0,
    repetition: 0,
    reviewCount: 0,
    lapseCount: 0,
    dueDate: new Date(start).toISOString(),
    createdAt: new Date(start).toISOString(),
    updatedAt: new Date(start).toISOString(),
    progressUpdatedAt: new Date(start).toISOString(),
    flagged: false,
    cardType: "standard",
  };
}
const cards = Array.from({ length: 5 }, (_, i) => card(`c${i}`));
function evidence(
  items = cards,
  dates = [0, 1, 3],
  rating: LearningEvent["rating"] = "good",
): LearningEvent[] {
  return items.flatMap((c) =>
    dates.flatMap((d) =>
      (
        ["audio-dictation", "text-comprehension", "image-production"] as const
      ).map((mode) => ({
        id: `${c.id}:${d}:${mode}`,
        cardId: c.id,
        rating,
        mode,
        at: new Date(start + d * day).toISOString(),
      })),
    ),
  );
}
const batch = {
  format: "REVYSTUDY_BATCH_V1",
  curriculum: "english-v1",
  stage: 1,
  unit: 1,
  batch: "S01-U01-B01",
  cards: [
    {
      id: "S01-U01-B01-C01",
      english: "I am a student.",
      portuguese: "Eu sou estudante.",
      goal: "Cumprimentar e se apresentar usando nome e ocupação",
      structures: ["I'm a/an + occupation"],
      vocabulary: ["student"],
      image_prompt: "A student with books.",
    },
  ],
};

describe("curriculum evidence and retention", () => {
  it("keeps unseen skills explicit and cannot unlock an empty unit", () => {
    const m = measureUnit([], []);
    expect(m.ready).toBe(false);
    expect(m.skills.writing).toBeNull();
    expect(m.evidence.writing).toBe('none');
  });
  it("does not grant access from massed same-day easy ratings", () => {
    expect(
      measureUnit(cards, evidence(cards, [0, 0, 0], "easy"), start + day).ready,
    ).toBe(false);
  });
  it("requires coverage, enough situations, multiple dates and spacing", () => {
    expect(measureUnit(cards, evidence(), start + 4 * day).ready).toBe(true);
    expect(
      measureUnit(cards, evidence(cards.slice(0, 1)), start + 4 * day).ready,
    ).toBe(false);
    expect(
      measureUnit(
        cards,
        evidence().filter((e) => e.mode !== "audio-dictation"),
        start + 4 * day,
      ).ready,
    ).toBe(false);
    expect(
      measureUnit(cards.slice(0, 4), evidence(), start + 4 * day).ready,
    ).toBe(false);
  });
  it("separates access from seven-day mastery", () => {
    expect(measureUnit(cards, evidence(), start + 4 * day)).toMatchObject({
      ready: true,
      mastered: false,
    });
    expect(
      measureUnit(cards, evidence(cards, [0, 3, 8]), start + 8 * day),
    ).toMatchObject({ ready: true, mastered: true });
  });
  it("counts dictation toward listening and writing, never reading", () => {
    expect(modeSkills("audio-dictation")).toEqual(["listening", "writing"]);
  });
  it("retains earned access after forgetting and after adding new content", () => {
    const newCard = {
      ...card("later"),
      createdAt: new Date(start + 10 * day).toISOString(),
    };
    const p = curriculumProgress(
      [...cards, newCard],
      [...evidence(), ...evidence(cards, [12], "again")],
      start + 13 * day,
    );
    expect(p.units[0].ready).toBe(false);
    expect(p.units[0].earned).toBe(true);
    expect(p.current.stage).toBe(2);
  });
  it("does not infer skills or classify legacy cards", () => {
    const legacy = {
      ...card("old"),
      front: "<p>Hello</p>",
      back: "<p>Olá</p>",
    };
    expect(curriculumProgress([legacy], []).legacy).toBe(1);
    expect(readSituation(legacy.front, legacy.back)).toBeNull();
  });
  it("unlocks a manually selected stage without inventing mastery", () => {
    const progress=curriculumProgress([card("first",1),card("third",3)],[],start,3);
    expect(progress.current.stage).toBe(3);
    expect(progress.units[0]).toMatchObject({unlocked:true,earned:false,overall:0});
    expect(progress.units[2]).toMatchObject({unlocked:true,earned:false,overall:0});
    expect(progress.units[3].unlocked).toBe(false);
  });
  it("keeps old due content, omits locked and future-due content, never duplicates", () => {
    const list = [
      ...cards,
      card("current", 2),
      card("locked", 3),
      {
        ...card("later", 2),
        status: "review" as const,
        dueDate: new Date(start + 20 * day).toISOString(),
      },
    ];
    const q = mixedCurriculumQueue(list, evidence(), start + 4 * day);
    expect(q.map((c) => c.id)).toContain("c0");
    expect(q.map((c) => c.id)).toContain("current");
    expect(q.map((c) => c.id)).not.toContain("locked");
    expect(q.map((c) => c.id)).not.toContain("later");
    expect(new Set(q.map((c) => c.id)).size).toBe(q.length);
  });
});
describe("external AI protocol", () => {
  it("validates, round-trips metadata and ignores repeated imports", () => {
    const preview = inspectAiBatch(JSON.stringify(batch), [], []);
    expect(preview.additions).toHaveLength(1);
    const imported = {
      ...card("imported"),
      ...batchCardHtml(preview.batch, preview.additions[0]),
    };
    expect(
      readSituation(imported.front, imported.back)?.pedagogy,
    ).toMatchObject({
      stage: 1,
      source: "external-ai",
      batchId: "S01-U01-B01",
    });
    expect(inspectAiBatch(JSON.stringify(batch), [imported], [])).toMatchObject(
      { additions: [], duplicates: 1 },
    );
  });
  it("rejects locked stages, malformed JSON and undeclared future structures", () => {
    expect(() => inspectAiBatch("{", [], [])).toThrow("JSON");
    expect(() =>
      inspectAiBatch(JSON.stringify({ ...batch, stage: 2 }), [], []),
    ).toThrow("liberada");
    expect(() =>
      inspectAiBatch(
        JSON.stringify({
          ...batch,
          cards: [{ ...batch.cards[0], structures: ["present perfect"] }],
        }),
        [],
        [],
      ),
    ).toThrow("fora");
  });
  it("rejects duplicate IDs, conflicting existing IDs, unsafe URLs and oversized input", () => {
    expect(() =>
      inspectAiBatch(
        JSON.stringify({ ...batch, cards: [batch.cards[0], batch.cards[0]] }),
        [],
        [],
      ),
    ).toThrow("ID repetido");
    const p = inspectAiBatch(JSON.stringify(batch), [], []),
      saved = { ...card("a"), ...batchCardHtml(p.batch, p.additions[0]) };
    expect(() =>
      inspectAiBatch(
        JSON.stringify({
          ...batch,
          cards: [{ ...batch.cards[0], english: "You are a teacher." }],
        }),
        [saved],
        [],
      ),
    ).toThrow("outro conteúdo");
    expect(() =>
      inspectAiBatch(
        JSON.stringify({
          ...batch,
          cards: [{ ...batch.cards[0], image_url: "javascript:alert(1)" }],
        }),
        [],
        [],
      ),
    ).toThrow();
    expect(() => inspectAiBatch("x".repeat(1_000_001), [], [])).toThrow("1 MB");
  });
  it("escapes imported text and does not invent image or audio", () => {
    const p = inspectAiBatch(
      JSON.stringify({
        ...batch,
        cards: [{ ...batch.cards[0], english: "<script>alert(1)</script>" }],
      }),
      [],
      [],
    );
    const html = batchCardHtml(p.batch, p.additions[0]);
    expect(html.back).not.toContain("<script>");
    expect(html.front).not.toContain("<audio");
  });
  it("exports the app state without allowing a chat to assign mastery", () => {
    const state = JSON.parse(exportLearningContext(cards, []));
    expect(state.stage).toBe(1);
    expect(state).not.toHaveProperty('skills');
    expect(state.new_material.patterns).toContain("I'm a/an + occupation");
    expect(state.allowed_previous.patterns).toEqual([]);
    expect(() =>
      inspectAiBatch(JSON.stringify({ ...batch, mastery: 100 }), [], []),
    ).toThrow();
  });
});
