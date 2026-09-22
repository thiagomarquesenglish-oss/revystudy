import 'fake-indexeddb/auto';
import { localDB } from '@/lib/offline-db';
import { answerSchedule, loadScheduledCards } from '@/lib/fsrs-scheduling';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { Flashcard } from "@/lib/types";
import { buildSituationHtml } from "@/lib/situation";
import { manualPedagogy } from "@/lib/curriculum";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  import: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/learning-data", () => ({ loadLearningData: mocks.load }));
vi.mock("@/lib/storage", () => ({
  saveLearningReview: mocks.save,
  importLearningCards: mocks.import,
  addDeck: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  getCardsByDeck: vi.fn(async () => [card]),
}));
vi.mock("@/lib/study-media", () => ({ prepareHtml: vi.fn() }));
vi.mock("@/components/PageHeader", () => ({ default: () => null }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mocks.error, info: vi.fn() },
}));
vi.mock("@/components/StudyCard", () => ({
  default: ({
    card,
    onRate,
    forcedMode,
  }: {
    card: Flashcard;
    onRate: (r: string, m: string) => void;
    forcedMode: string;
  }) => (
    <button onClick={() => onRate("good", forcedMode)}>
      Avaliar {card.id}
    </button>
  ),
}));
import CurriculumContentPage from "@/pages/CurriculumContentPage";
import StudyPage, { buildSessionQueue } from "@/pages/StudyPage";
import FreePracticePage, { buildPractice, practiceOptions } from '@/pages/FreePracticePage';

it('free practice filters dictation by audio and selects each situation only once', () => {
  expect(practiceOptions(card, 'dictation')).toEqual([]);
  const withAudio = {...card, audioId: 'audio'};
  expect(practiceOptions(withAudio, 'dictation')).toEqual(['audio-dictation']);
  const cards = Array.from({length: 10}, (_, i) => ({...withAudio, id: String(i)}));
  const session = buildPractice(cards, 'random', 30);
  expect(session).toHaveLength(10);
  expect(new Set(session.map(item => item.card.id)).size).toBe(10);
  expect(buildPractice(cards, 'dictation', 5)).toHaveLength(5);
});

it('finishes free practice without saving reviews or changing curriculum evidence', async () => {
  mocks.load.mockResolvedValue({cards:[card], events:[], decks:[]});
  render(<MemoryRouter><FreePracticePage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', {name:'Começar treino'}));
  fireEvent.click(await screen.findByRole('button', {name:'Avaliar one'}));
  expect(await screen.findByText('Treino concluído')).toBeTruthy();
  expect(mocks.save).not.toHaveBeenCalled();
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await localDB.clearForFullRestore();
});
const now = new Date().toISOString();
const card: Flashcard = {
  id: "one",
  ...buildSituationHtml({
    english: "I am a student.",
    portuguese: "Eu sou estudante.",
    context: "",
    mediaHtml: "",
    pedagogy: manualPedagogy(1),
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
  dueDate: now,
  createdAt: now,
  updatedAt: now,
  progressUpdatedAt: now,
  flagged: false,
  cardType: "standard",
};
const data = {
  userId: 'test-user',
  cards: [card],
  events: [],
  decks: [{ id: "d", name: "English" }],
  offline: false,
};
it("selects a single available exercise without images or audio", () => {
  const queue = buildSessionQueue([card], []);
  expect(queue).toHaveLength(1);
  expect(["translation-production", "text-comprehension"]).toContain(
    queue[0].sessionMode,
  );
});
it("keeps the current exercise on failure and advances only after durable save", async () => {
  mocks.load.mockResolvedValue(data);
  mocks.save.mockRejectedValueOnce(new Error("storage full"));
  render(
    <MemoryRouter>
      <StudyPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Avaliar one" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(screen.getByRole("button", { name: "Avaliar one" })).toBeVisible();
  let finish!: (value: Flashcard) => void;
  mocks.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Avaliar one" }));
  fireEvent.click(screen.getByRole("button", { name: "Avaliar one" }));
  expect(mocks.save).toHaveBeenCalledTimes(2);
  await act(async () => {
    const schedule = answerSchedule(mocks.save.mock.calls[1][3], 'good', new Date());
    await localDB.saveSkillSchedules([schedule]);
    finish({ ...card, status: "learning", schedule } as Flashcard);
  });
  expect(await screen.findByText("Aguardando a próxima revisão")).toBeVisible();
});
it("requires a valid preview and explicit batch approval before importing", async () => {
  mocks.load.mockResolvedValue({ ...data, cards: [] });
  mocks.import.mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <CurriculumContentPage />
    </MemoryRouter>,
  );
  await screen.findByText('Preparar conteúdo da Etapa 1');
  expect(screen.queryByRole('button', {name:/Pular para a próxima etapa/i})).toBeNull();
  expect(screen.getByRole('button', {name:'Copiar Prompt Master'})).toBeVisible();
  expect(screen.getByRole('button', {name:'Copiar conteúdo para IA'})).toBeVisible();
  const batch = {
    format: "REVYSTUDY_BATCH_V2",
    curriculum: "english-v1",
    stage: 1,
    unit: 1,
    batch: "B01",
    cards: [
      {
        id: "C01",
        english: "I am a student.",
        portuguese: "Eu sou estudante.",
        goal: "Cumprimentar e se apresentar usando nome e ocupação",
        structures: ["I'm a/an + occupation"],
        vocabulary: ["student"],
      },
    ],
  };
  fireEvent.change(screen.getByRole("textbox", { name: "JSON da IA" }), {
    target: { value: JSON.stringify(batch) },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Validar lote" }),
  );
  expect(mocks.import).not.toHaveBeenCalled();
  expect(screen.getByText("I am a student.")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Aprovar e importar" }),
  );
  await waitFor(() => expect(mocks.import).toHaveBeenCalledOnce());
  expect(mocks.import.mock.calls[0][0]).toBe("d");
  expect(mocks.import.mock.calls[0][1][0].front).toContain("data-learning");
});

it('does not show an Easy exercise or its siblings after reopening study', async () => {
  const exercises = await loadScheduledCards([card], data.userId);
  await localDB.saveSkillSchedules([answerSchedule(exercises[0].schedule, 'easy')]);
  mocks.load.mockResolvedValue(data);
  const view = render(<MemoryRouter><StudyPage /></MemoryRouter>);
  expect(await screen.findByText('Tudo revisado por enquanto')).toBeVisible();
  expect(screen.queryByRole('button', {name:'Avaliar one'})).toBeNull();
  view.unmount();
  render(<MemoryRouter><StudyPage /></MemoryRouter>);
  expect(await screen.findByText('Tudo revisado por enquanto')).toBeVisible();
});

it('integrates a newly created card without leaving the empty session', async () => {
  mocks.load.mockResolvedValue({...data, cards:[]});
  render(<MemoryRouter><StudyPage /></MemoryRouter>);
  await screen.findByText('Tudo revisado por enquanto');
  await act(async () => { window.dispatchEvent(new Event('revystudy:cards-updated')); });
  expect(await screen.findByRole('button', {name:'Avaliar one'})).toBeVisible();
});
