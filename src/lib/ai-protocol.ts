import { z } from "zod";
import {
  CURRICULUM,
  CURRICULUM_VERSION,
  allowedKnowledge,
  findUnit,
} from "./curriculum";
import { buildSituationHtml, escapeHtml, readSituation } from "./situation";
import {
  curriculumProgress,
  SKILLS,
  SKILL_LABELS,
  type LearningEvent,
} from "./learning-progress";
import type { Flashcard } from "./types";

const phrase = z.string().trim().min(1).max(1000);
const mediaUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Use uma URL HTTPS sem credenciais")
  .optional();
export const aiBatchSchema = z
  .object({
    format: z.literal("REVYSTUDY_BATCH_V1"),
    curriculum: z.literal(CURRICULUM_VERSION),
    stage: z.number().int(),
    unit: z.number().int(),
    batch: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    cards: z
      .array(
        z
          .object({
            id: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
            english: phrase,
            portuguese: phrase,
            hint: z.string().max(500).default(""),
            goal: z.string().max(300),
            structures: z.array(z.string().max(300)).min(1).max(30),
            vocabulary: z.array(z.string().max(300)).max(80),
            main_verb: z.string().max(100).optional(),
            tags: z.array(z.string().max(100)).max(20).default([]),
            difficulty: z.number().int().min(1).max(5).default(1),
            image_prompt: z.string().max(3000).default(""),
            image_url: mediaUrl,
            audio_url: mediaUrl,
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type AiBatch = z.infer<typeof aiBatchSchema>;
const normalized = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function inspectAiBatch(
  text: string,
  cards: Flashcard[],
  events: LearningEvent[],
) {
  if (text.length > 1_000_000)
    throw new Error("O lote deve ter no máximo 1 MB.");
  let input: unknown;
  try {
    input = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new Error("JSON inválido. Cole o objeto completo gerado pelo chat.");
  }
  const parsed = aiBatchSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n"),
    );
  const batch = parsed.data,
    unit = findUnit(batch.stage, batch.unit);
  if (!unit) throw new Error("Etapa ou unidade não existe neste currículo.");
  const progress = curriculumProgress(cards, events);
  if (
    !progress.units.find(
      (u) => u.stage === batch.stage && u.unit === batch.unit,
    )?.unlocked
  )
    throw new Error("Esta etapa ainda não foi liberada pelo seu progresso.");
  const prior = allowedKnowledge(batch.stage);
  const structures = new Set(
    [...prior.structures, ...unit.structures].map(normalized),
  );
  const vocabulary = new Set(
    [...prior.vocabulary, ...unit.vocabulary].map(normalized),
  );
  const seen = new Set<string>(),
    sentences = new Set<string>();
  const existing = cards
    .map((c) => readSituation(c.front, c.back))
    .filter((s) => !!s);
  const additions: AiBatch["cards"] = [];
  let duplicates = 0;
  for (const item of batch.cards) {
    if (seen.has(item.id)) throw new Error(`ID repetido no lote: ${item.id}`);
    seen.add(item.id);
    if (item.goal !== unit.goal)
      throw new Error(`${item.id}: objetivo diferente do definido na unidade.`);
    if (
      item.structures.some((s) => !structures.has(normalized(s))) ||
      item.vocabulary.some((v) => !vocabulary.has(normalized(v)))
    )
      throw new Error(
        `${item.id}: estrutura ou vocabulário declarado fora do currículo permitido.`,
      );
    const old = existing.find((s) => s?.pedagogy?.contentId === item.id);
    if (
      old &&
      (normalized(old.english) !== normalized(item.english) ||
        normalized(old.portuguese) !== normalized(item.portuguese))
    )
      throw new Error(
        `${item.id}: esse ID já pertence a outro conteúdo. Nenhum card foi alterado.`,
      );
    const key = normalized(item.english);
    if (
      old ||
      sentences.has(key) ||
      existing.some((s) => normalized(s!.english) === key)
    ) {
      duplicates++;
      continue;
    }
    sentences.add(key);
    additions.push(item);
  }
  return { batch, additions, duplicates };
}
export function batchCardHtml(batch: AiBatch, item: AiBatch["cards"][number]) {
  const image = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="Situação visual">`
    : "";
  const audio = item.audio_url
    ? `<div data-audio="true" data-src="${escapeHtml(item.audio_url)}"><audio src="${escapeHtml(item.audio_url)}"></audio></div>`
    : "";
  return buildSituationHtml({
    english: item.english,
    portuguese: item.portuguese,
    context: item.hint,
    mediaHtml: image + audio,
    pedagogy: {
      curriculum: CURRICULUM_VERSION,
      stage: batch.stage,
      unit: batch.unit,
      goal: item.goal,
      structures: item.structures,
      vocabulary: item.vocabulary,
      mainVerb: item.main_verb,
      tags: item.tags,
      difficulty: item.difficulty,
      batchId: batch.batch,
      contentId: item.id,
      source: "external-ai",
      imagePrompt: item.image_prompt,
      audioText: item.english,
    },
  });
}
export function exportLearningContext(
  cards: Flashcard[],
  events: LearningEvent[],
  count = 10,
) {
  const progress = curriculumProgress(cards, events),
    current = progress.current;
  const situations = cards
    .map((c) => ({ card: c, s: readSituation(c.front, c.back) }))
    .filter((x) => x.s?.pedagogy);
  const recent = [...situations].sort((a, b) =>
    b.card.createdAt.localeCompare(a.card.createdAt),
  );
  const difficult = events
    .filter((e) => e.rating === "again" || e.rating === "hard")
    .slice(-30);
  const weakStructures = [
    ...new Set(
      difficult.flatMap(
        (e) =>
          situations.find((x) => x.card.id === e.cardId)?.s?.pedagogy
            ?.structures || [],
      ),
    ),
  ];
  return JSON.stringify(
    {
      format: "CURRICULUM_STATE_V1",
      curriculum: CURRICULUM_VERSION,
      exportedAt: new Date().toISOString(),
      current: {
        stage: current.stage,
        unit: current.unit,
        title: current.title,
        goal: current.goal,
        overall: current.overall,
        skills: current.skills,
        earned: current.earned,
        mastered: current.mastered,
      },
      allowed_previous: allowedKnowledge(current.stage),
      new_material: {
        structures: current.structures,
        vocabulary: current.vocabulary,
      },
      learned_units: progress.units
        .filter((u) => u.earned)
        .map((u) => ({
          stage: u.stage,
          unit: u.unit,
          title: u.title,
          mastered: u.mastered,
        })),
      difficulties: {
        skills: SKILLS.filter((s) => current.skills[s] < 80).map(
          (s) => SKILL_LABELS[s],
        ),
        structures: weakStructures,
      },
      existing_content: situations.map((x) => ({
        id: x.s!.pedagogy!.contentId,
        english: x.s!.english,
      })),
      last_batch: recent[0]?.s?.pedagogy?.batchId || null,
      request: `Gerar ${Math.max(1, Math.min(50, count))} situações novas na etapa/unidade atual. Retornar REVYSTUDY_BATCH_V1. Não decidir progressão nem gerar mídia.`,
    },
    null,
    2,
  );
}
export const MASTER_PROMPT = `Você gera conteúdos de inglês para o RevyStudy. O aplicativo é a fonte da verdade do progresso.
Antes de gerar um lote, solicite CURRICULUM_STATE_V1 atualizado. Não infira etapa pela memória do chat, não libere etapas e não invente progresso.
Use o currículo ${CURRICULUM_VERSION} abaixo e obedeça à etapa, unidade, objetivo e quantidade do estado exportado.
Introduza apenas estruturas e vocabulário da unidade atual; reutilize o material anterior permitido. Priorize inglês natural, útil e geral, em frases completas. Flexões das palavras permitidas são aceitas; não introduza estruturas futuras.
Reforce dificuldades indicadas, varie contextos e não repita existing_content. Português é tradução de apoio. hint deve ser uma intenção em português, sem entregar a frase, para reduzir a ambiguidade da imagem.
Primeiro gere texto para revisão humana. image_prompt descreve uma imagem sem texto. Não gere imagens nem áudio; não invente URLs. Se a frase exige material ainda não permitido, reformule.
Responda apenas com JSON válido, sem HTML, campos extras ou comentários:
{"format":"REVYSTUDY_BATCH_V1","curriculum":"english-v1","stage":1,"unit":1,"batch":"S01-U01-B01","cards":[{"id":"S01-U01-B01-C01","english":"I am a student.","portuguese":"Eu sou estudante.","hint":"Apresente sua ocupação.","goal":"Dizer quem você é","structures":["I am"],"vocabulary":["I","student"],"tags":[],"difficulty":1,"image_prompt":"Uma pessoa adulta com material de estudo, sem texto."}]}
O exemplo demonstra o formato. Ajuste a frase para respeitar estritamente o material liberado. Copie goal exatamente do estado. Em structures e vocabulary use os rótulos do currículo. IDs e batch devem ser novos, com letras, números, hífen ou sublinhado. Nunca reutilize um ID para outra frase.
Máximo 50 conteúdos por lote. image_url e audio_url são opcionais e só podem conter URLs HTTPS reais fornecidas pelo usuário após revisão. O usuário aprova o conteúdo na prévia do app; você não aprova por ele.
CURRÍCULO COMPLETO:
${JSON.stringify(CURRICULUM, null, 2)}`;
