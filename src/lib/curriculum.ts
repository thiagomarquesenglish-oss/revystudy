import { z } from "zod";

export const CURRICULUM_VERSION = "english-v1";
export interface CurriculumUnit {
  stage: number;
  unit: number;
  title: string;
  goal: string;
  structures: string[];
  vocabulary: string[];
}

// A versioned, cumulative syllabus. Entries introduce only the listed material.
const syllabus: [string, string, string[], string[]][] = [
  [
    "Apresentar-se",
    "Dizer quem você é",
    ["I am", "you are", "a/an"],
    [
      "I",
      "you",
      "a",
      "an",
      "hello",
      "name",
      "student",
      "teacher",
      "Ana",
      "Sam",
    ],
  ],
  [
    "Identificar coisas",
    "Identificar pessoas e objetos",
    ["he is", "she is", "it is", "a/an"],
    ["he", "she", "it", "book", "phone", "table", "friend"],
  ],
  [
    "Descrever estados",
    "Expressar estados e características",
    ["be + adjective"],
    ["happy", "tired", "hungry", "busy", "new", "old"],
  ],
  [
    "Pessoas e grupos",
    "Falar sobre grupos e quantidades",
    ["we are", "they are", "regular plurals"],
    ["we", "they", "people", "one", "two", "three", "four", "five"],
  ],
  [
    "Posse",
    "Dizer o que alguém tem",
    ["have/has", "my/your/his/her"],
    ["have", "has", "my", "your", "his", "her", "bag", "car", "house"],
  ],
  [
    "Localização",
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
    "Horas e dias",
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
    "Rotina",
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
    "Frequência",
    "Descrever a frequência de hábitos",
    ["frequency adverbs"],
    ["always", "usually", "sometimes", "never", "every day", "often"],
  ],
  [
    "Preferências",
    "Expressar gostos e interesses",
    ["like/love + noun", "like + ing"],
    ["like", "love", "read", "music", "coffee", "tea", "play", "walk"],
  ],
  [
    "Desejos e necessidades",
    "Expressar desejos e necessidades",
    ["want/need + noun", "want/need to + verb"],
    ["want", "need", "help", "buy", "drink", "rest"],
  ],
  [
    "Negação",
    "Dizer o que não é ou não acontece",
    ["be negative", "do not/does not"],
    ["not", "don't", "doesn't", "isn't", "aren't"],
  ],
  [
    "Perguntas básicas",
    "Fazer perguntas sobre hábitos",
    ["do/does questions", "be questions"],
    ["do", "does", "yes", "no"],
  ],
  [
    "Buscar informações",
    "Perguntar o quê, quando e por quê",
    ["what/when/why/how questions"],
    ["what", "when", "why", "how", "because"],
  ],
  [
    "Habilidades e permissão",
    "Dizer o que consegue fazer",
    ["can/cannot", "can questions"],
    ["can", "can't", "swim", "drive", "speak", "open", "close"],
  ],
  [
    "Ações em andamento",
    "Descrever o que acontece agora",
    ["present continuous"],
    ["now", "today", "listen", "cook", "wait", "run"],
  ],
  [
    "Existência e quantidade",
    "Descrever o que existe em um lugar",
    ["there is/are", "some/any"],
    ["some", "any", "many", "much", "shop", "park", "city"],
  ],
  [
    "Pedidos cotidianos",
    "Pedir algo com educação",
    ["would like", "could you"],
    ["please", "thank you", "menu", "ticket", "price", "bring"],
  ],
  [
    "Passado: estados",
    "Contar como algo era",
    ["was/were"],
    ["yesterday", "last week", "last year", "before"],
  ],
  [
    "Passado: ações",
    "Contar ações concluídas",
    ["simple past regular"],
    ["worked", "studied", "played", "walked", "visited"],
  ],
  [
    "Passado irregular",
    "Relatar experiências cotidianas passadas",
    ["simple past irregular"],
    ["went", "ate", "had", "saw", "bought", "got"],
  ],
  [
    "Perguntar sobre o passado",
    "Perguntar e negar acontecimentos passados",
    ["did questions", "did not"],
    ["did", "didn't", "ago"],
  ],
  [
    "Planos",
    "Falar sobre planos e intenções",
    ["going to"],
    ["tomorrow", "next week", "travel", "meet", "plan"],
  ],
  [
    "Decisões e previsões",
    "Expressar decisões e previsões",
    ["will/will not"],
    ["will", "won't", "think", "hope", "soon"],
  ],
  [
    "Comparações",
    "Comparar opções e características",
    ["comparatives", "superlatives"],
    ["bigger", "smaller", "better", "best", "more", "most", "than"],
  ],
  [
    "Conselhos e obrigações",
    "Dar conselhos e explicar obrigações",
    ["should", "must", "have to"],
    ["should", "must", "safe", "careful", "rule"],
  ],
  [
    "Experiências",
    "Falar sobre experiências sem data específica",
    ["present perfect", "ever/never"],
    ["been", "done", "seen", "ever", "already", "yet"],
  ],
  [
    "Histórias",
    "Relacionar ações passadas e interrupções",
    ["past continuous", "when/while"],
    ["while", "suddenly", "happen", "arrive"],
  ],
  [
    "Possibilidades",
    "Relacionar condições e consequências reais",
    ["first conditional"],
    ["if", "rain", "stay", "finish", "enough"],
  ],
  [
    "Opiniões conectadas",
    "Explicar opiniões com razões e contrastes",
    ["although", "relative clauses who/which"],
    ["although", "however", "agree", "believe", "opinion", "which", "who"],
  ],
];
export const CURRICULUM: CurriculumUnit[] = syllabus.map(
  ([title, goal, structures, vocabulary], i) => ({
    stage: i + 1,
    unit: 1,
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
