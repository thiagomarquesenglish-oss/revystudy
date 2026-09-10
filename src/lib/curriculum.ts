import { z } from "zod";

export const CURRICULUM_VERSION = "english-v1";
export interface CurriculumUnit {
  stage: number;
  unit: number;
  targetContent: number;
  title: string;
  goal: string;
  structures: string[];
  vocabulary: string[];
}

// A versioned, cumulative syllabus. Entries introduce only the listed material.
const syllabus: [string, string, string[], string[]][] = [
  [
    "Dizer quem você é",
    "Cumprimentar e se apresentar usando nome e ocupação",
    ["Hi / Hello", "I'm + name", "My name is + name", "I'm a/an + occupation", "Nice to meet you"],
    [
      "I",
      "a",
      "an",
      "hi",
      "hello",
      "name",
      "student",
      "teacher",
      "doctor",
      "engineer",
      "designer",
    ],
  ],
  [
    "Identificar pessoas e coisas",
    "Identificar pessoas e objetos",
    ["he is", "she is", "it is", "a/an"],
    ["he", "she", "it", "book", "phone", "table", "friend"],
  ],
  [
    "Descrever como alguém está",
    "Expressar estados e características",
    ["be + adjective"],
    ["happy", "tired", "hungry", "busy", "new", "old"],
  ],
  [
    "Falar sobre grupos",
    "Falar sobre grupos e quantidades",
    ["we are", "they are", "regular plurals"],
    ["we", "they", "people", "one", "two", "three", "four", "five"],
  ],
  [
    "Falar sobre posse",
    "Dizer o que alguém tem",
    ["have/has", "my/your/his/her"],
    ["have", "has", "my", "your", "his", "her", "bag", "car", "house"],
  ],
  [
    "Dizer onde as coisas estão",
    "Dizer onde algo está",
    ["in/on/under/next to", "where is"],
    [
      "where",
      "in",
      "on",
      "under",
      "next to",
      "room",
      "school",
      "here",
      "there",
    ],
  ],
  [
    "Informar horários e dias",
    "Entender e informar horários",
    ["at + time", "on + day"],
    [
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
      "eleven",
      "twelve",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
      "morning",
      "night",
    ],
  ],
  [
    "Falar sobre sua rotina",
    "Falar sobre ações habituais",
    ["simple present affirmative"],
    [
      "wake up",
      "get up",
      "go",
      "eat",
      "work",
      "study",
      "sleep",
      "home",
      "water",
      "food",
    ],
  ],
  [
    "Dizer com que frequência algo acontece",
    "Descrever a frequência de hábitos",
    ["frequency adverbs"],
    ["always", "usually", "sometimes", "never", "every day", "often"],
  ],
  [
    "Falar do que você gosta",
    "Expressar gostos e interesses",
    ["like/love + noun", "like + ing"],
    ["like", "love", "read", "music", "coffee", "tea", "play", "walk"],
  ],
  [
    "Dizer o que você quer e precisa",
    "Expressar desejos e necessidades",
    ["want/need + noun", "want/need to + verb"],
    ["want", "need", "help", "buy", "drink", "rest"],
  ],
  [
    "Dizer o que não acontece",
    "Dizer o que não é ou não acontece",
    ["be negative", "do not/does not"],
    ["not", "don't", "doesn't", "isn't", "aren't"],
  ],
  [
    "Perguntar sobre hábitos",
    "Fazer perguntas sobre hábitos",
    ["do/does questions", "be questions"],
    ["do", "does", "yes", "no"],
  ],
  [
    "Pedir informações",
    "Perguntar o quê, quando e por quê",
    ["what/when/why/how questions"],
    ["what", "when", "why", "how", "because"],
  ],
  [
    "Falar sobre habilidades e permissão",
    "Dizer o que consegue fazer",
    ["can/cannot", "can questions"],
    ["can", "can't", "swim", "drive", "speak", "open", "close"],
  ],
  [
    "Descrever o que acontece agora",
    "Descrever o que acontece agora",
    ["present continuous"],
    ["now", "today", "listen", "cook", "wait", "run"],
  ],
  [
    "Descrever lugares e quantidades",
    "Descrever o que existe em um lugar",
    ["there is/are", "some/any"],
    ["some", "any", "many", "much", "shop", "park", "city"],
  ],
  [
    "Fazer pedidos com educação",
    "Pedir algo com educação",
    ["would like", "could you"],
    ["please", "thank you", "menu", "ticket", "price", "bring"],
  ],
  [
    "Descrever como algo era",
    "Contar como algo era",
    ["was/were"],
    ["yesterday", "last week", "last year", "before"],
  ],
  [
    "Contar ações passadas",
    "Contar ações concluídas",
    ["simple past regular"],
    ["worked", "studied", "played", "walked", "visited"],
  ],
  [
    "Contar acontecimentos passados",
    "Relatar experiências cotidianas passadas",
    ["simple past irregular"],
    ["went", "ate", "had", "saw", "bought", "got"],
  ],
  [
    "Conversar sobre o passado",
    "Perguntar e negar acontecimentos passados",
    ["did questions", "did not"],
    ["did", "didn't", "ago"],
  ],
  [
    "Falar sobre planos",
    "Falar sobre planos e intenções",
    ["going to"],
    ["tomorrow", "next week", "travel", "meet", "plan"],
  ],
  [
    "Fazer previsões e tomar decisões",
    "Expressar decisões e previsões",
    ["will/will not"],
    ["will", "won't", "think", "hope", "soon"],
  ],
  [
    "Comparar pessoas e coisas",
    "Comparar opções e características",
    ["comparatives", "superlatives"],
    ["bigger", "smaller", "better", "best", "more", "most", "than"],
  ],
  [
    "Dar conselhos e explicar obrigações",
    "Dar conselhos e explicar obrigações",
    ["should", "must", "have to"],
    ["should", "must", "safe", "careful", "rule"],
  ],
  [
    "Falar sobre experiências",
    "Falar sobre experiências sem data específica",
    ["present perfect", "ever/never"],
    ["been", "done", "seen", "ever", "already", "yet"],
  ],
  [
    "Contar histórias",
    "Relacionar ações passadas e interrupções",
    ["past continuous", "when/while"],
    ["while", "suddenly", "happen", "arrive"],
  ],
  [
    "Falar sobre possibilidades",
    "Relacionar condições e consequências reais",
    ["first conditional"],
    ["if", "rain", "stay", "finish", "enough"],
  ],
  [
    "Explicar e conectar opiniões",
    "Explicar opiniões com razões e contrastes",
    ["although", "relative clauses who/which"],
    ["although", "however", "agree", "believe", "opinion", "which", "who"],
  ],
];
export const CURRICULUM: CurriculumUnit[] = syllabus.map(
  ([title, goal, structures, vocabulary], i) => ({
    stage: i + 1,
    unit: 1,
    targetContent: i === 0 ? 10 : 12,
    title,
    goal,
    structures,
    vocabulary,
  }),
);
export const unitKey = (unit: Pick<CurriculumUnit, "stage" | "unit">) =>
  `${unit.stage}.${unit.unit}`;
export const findUnit = (stage: number, unit: number) =>
  CURRICULUM.find((u) => u.stage === stage && u.unit === unit);
export function allowedKnowledge(stage: number) {
  const prior = CURRICULUM.filter((u) => u.stage < stage);
  return {
    structures: [...new Set(prior.flatMap((u) => u.structures))],
    vocabulary: [...new Set(prior.flatMap((u) => u.vocabulary))],
  };
}
const text = z.string().trim().max(300);
export const pedagogySchema = z
  .object({
    curriculum: z.literal(CURRICULUM_VERSION),
    stage: z.number().int().min(1).max(30),
    unit: z.number().int().min(1),
    goal: text,
    structures: z.array(text).max(30),
    vocabulary: z.array(text).max(80),
    mainVerb: text.optional(),
    tags: z.array(text).max(20).default([]),
    difficulty: z.number().int().min(1).max(5).default(1),
    batchId: text,
    contentId: text,
    source: z.enum(["manual", "external-ai"]).default("manual"),
    imagePrompt: z.string().max(3000).default(""),
    audioText: z.string().max(1000).default(""),
  })
  .strict()
  .refine((p) => !!findUnit(p.stage, p.unit), "Etapa/unidade desconhecida");
export type Pedagogy = Required<
  Omit<z.infer<typeof pedagogySchema>, "mainVerb">
> & { mainVerb?: string };
export function manualPedagogy(
  stage: number,
  existing?: Pedagogy,
): Pedagogy | undefined {
  const unit = findUnit(stage, 1);
  if (!unit) return undefined;
  return {
    ...existing,
    curriculum: CURRICULUM_VERSION,
    stage,
    unit: 1,
    goal: unit.goal,
    structures: unit.structures,
    vocabulary: unit.vocabulary,
    tags: existing?.tags || [],
    difficulty: existing?.difficulty || 1,
    batchId: existing?.batchId || "manual",
    contentId: existing?.contentId || crypto.randomUUID(),
    source: existing?.source || "manual",
    imagePrompt: existing?.imagePrompt || "",
    audioText: existing?.audioText || "",
  };
}
