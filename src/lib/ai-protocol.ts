import { z } from "zod";
import {
  CURRICULUM_VERSION,
  allowedKnowledge,
  findUnit,
} from "./curriculum";
import { buildSituationHtml, escapeHtml, readSituation } from "./situation";
import {
  curriculumProgress,
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
    format: z.enum(["REVYSTUDY_BATCH_V1","REVYSTUDY_BATCH_V2"]),
    curriculum: z.literal(CURRICULUM_VERSION),
    stage: z.number().int(),
    unit: z.number().int().default(1),
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
  manualStage=1,
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
  if (!unit) throw new Error("Esta etapa não existe neste currículo.");
  const progress = curriculumProgress(cards, events,Date.now(),manualStage);
  if (
    !progress.units.find(
      (u) => u.stage === batch.stage && u.unit === batch.unit,
    )?.unlocked
  )
    throw new Error("Esta etapa ainda não foi liberada pelo seu progresso.");
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
      throw new Error(`${item.id}: objetivo diferente do definido na etapa.`);
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
  const existingCount=existing.filter(s=>s?.pedagogy?.stage===batch.stage).length;
  const remaining=Math.max(0,unit.targetContent-existingCount);
  if(batch.format==='REVYSTUDY_BATCH_V2'&&additions.length>remaining)
    throw new Error(`Esta etapa precisa de apenas ${remaining} conteúdos novos.`);
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
  manualStage=1,
) {
  const progress = curriculumProgress(cards, events,Date.now(),manualStage),
    current = progress.current;
  const situations = cards
    .map((c) => ({ card: c, s: readSituation(c.front, c.back) }))
    .filter((x) => x.s?.pedagogy);
  const currentSituations=situations.filter(x=>x.s?.pedagogy?.stage===current.stage);
  const batches=new Set(currentSituations.map(x=>x.s?.pedagogy?.batchId).filter(id=>id&&/^S\d+-B\d+$/.test(id)));
  const difficult = events
    .filter((e) => e.rating === "again" || e.rating === "hard")
    .slice(-30);
  const focus = [
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
      format: "REVYSTUDY_GENERATION_REQUEST_V2",
      curriculum: CURRICULUM_VERSION,
      stage: current.stage,
      title: current.title,
      goal: current.goal,
      target_content: current.targetContent,
      existing_content_count: currentSituations.length,
      needed: Math.max(0,current.targetContent-currentSituations.length),
      new_material: {
        patterns: current.structures,
        words: current.vocabulary,
      },
      allowed_previous: {
        patterns: allowedKnowledge(current.stage).structures,
        words: allowedKnowledge(current.stage).vocabulary,
      },
      strict_output_rules: {
        structures: "Cada item deve ser copiado literalmente de allowed_structure_values. Não combine, traduza ou invente rótulos.",
        allowed_structure_values:[...allowedKnowledge(current.stage).structures,...current.structures],
        vocabulary: "Cada item deve ser copiado literalmente de allowed_vocabulary_values. Não use palavras futuras.",
        allowed_vocabulary_values:[...allowedKnowledge(current.stage).vocabulary,...current.vocabulary],
        goal: "Copie goal literalmente em todos os cartões.",
        self_check: "Antes de responder, valide todos os cartões contra estas listas e corrija qualquer valor não permitido.",
      },
      learned_previous_content: situations
        .filter(x=>(x.s?.pedagogy?.stage||0)<current.stage)
        .map(x=>({
          stage:x.s!.pedagogy!.stage,
          english:x.s!.english,
          portuguese:x.s!.portuguese,
        })),
      focus,
      existing_sentences: currentSituations.map(x=>x.s!.english),
      next_batch: `S${String(current.stage).padStart(2,'0')}-B${String(batches.size+1).padStart(2,'0')}`,
    },
    null,
    2,
  );
}
export const MASTER_PROMPT = `Você é o gerador de conteúdo do RevyStudy. Sempre aguarde um REVYSTUDY_GENERATION_REQUEST_V2.
Gere conteúdo somente para a etapa informada. Não decida progressão e não infira conhecimentos ausentes do pedido.
Use new_material, allowed_previous e learned_previous_content. Reaproveite naturalmente o conhecimento das etapas anteriores, mas não copie frases já existentes. Não repita existing_sentences e gere exatamente a quantidade indicada em needed.
OBRIGATÓRIO: em cada cartão, cada item de structures deve ser copiado literalmente de strict_output_rules.allowed_structure_values. Nunca crie rótulos compostos como "He is + a/an + occupation".
OBRIGATÓRIO: em cada cartão, cada item de vocabulary deve ser copiado literalmente de strict_output_rules.allowed_vocabulary_values. Não introduza perguntas, negativas, adjetivos, possessivos ou qualquer matéria futura ausente das listas.
Antes de responder, confira todos os cartões contra strict_output_rules. Se um valor não estiver nas listas, corrija-o; jamais amplie o currículo por conta própria.
Produza inglês natural e cotidiano. Ensine padrões reutilizáveis, sem criar variações artificiais da mesma sentença.
hint deve descrever em português a intenção comunicativa sem entregar a tradução.
image_prompt deve ser um esqueleto específico da cena, coerente com english, hint e goal. Descreva pessoas, ação, ambiente e uma composição fotográfica realista e cinematográfica. Para he/she/they, inclua outra pessoa ou interação que deixe visualmente claro que o sujeito está sendo identificado. Varie ângulo e enquadramento; evite poses e selfies repetidas. A cena deve ser 1:1 e não conter texto, letras, legendas ou marcas d'água.
Não gere mídia nem URLs. Copie goal exatamente do pedido.
Retorne somente JSON válido no formato REVYSTUDY_BATCH_V2, sem HTML, comentários ou campos extras:
{"format":"REVYSTUDY_BATCH_V2","curriculum":"english-v1","stage":1,"batch":"S01-B01","cards":[{"id":"S01-B01-C01","english":"I'm a student.","portuguese":"Eu sou estudante.","hint":"Apresente sua ocupação.","goal":"Cumprimentar e se apresentar usando nome e ocupação","structures":["I'm a/an + occupation"],"vocabulary":["student"],"tags":[],"difficulty":1,"image_prompt":"Uma pessoa adulta com material de estudo, composição quadrada, sem texto."}]}`;

export function exportGeneratorPackage(cards:Flashcard[],events:LearningEvent[],manualStage=1){
  return `${MASTER_PROMPT}\n\nPEDIDO ATUAL DO APLICATIVO:\n${exportLearningContext(cards,events,manualStage)}`;
}
