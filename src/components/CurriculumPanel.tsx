import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Progress } from "./ui/progress";
import { loadLearningData } from "@/lib/learning-data";
import {
  curriculumProgress,
  SKILLS,
  SKILL_LABELS,
} from "@/lib/learning-progress";
import {
  MASTER_PROMPT,
  exportLearningContext,
  inspectAiBatch,
  batchCardHtml,
} from "@/lib/ai-protocol";
import { addDeck, importLearningCards } from "@/lib/storage";
import { readSituation } from "@/lib/situation";

export default function CurriculumPanel() {
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof loadLearningData>
  > | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showImport, setShowImport] = useState(false);
  const [json, setJson] = useState(""),
    [deckId, setDeckId] = useState(""),
    [copyText, setCopyText] = useState("");
  const [preview, setPreview] = useState<ReturnType<
    typeof inspectAiBatch
  > | null>(null);
  const [count, setCount] = useState(10);
  const progress = useMemo(() => data ? curriculumProgress(data.cards, data.events) : null, [data]);
  const refresh = async () => {
    try {
      const value = await loadLearningData();
      setData(value);
      setDeckId((old) =>
        value.decks.some((d) => d.id === old) ? old : value.decks[0]?.id || "",
      );
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar o currículo.",
      );
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado! Cole no seu chat de inglês.");
    } catch {
      setCopyText(text);
      toast.info("Selecione e copie o texto abaixo.");
    }
  };
  if (!data)
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <p role="status">{error || "Carregando seu currículo…"}</p>
        {error && <Button onClick={refresh}>Tentar novamente</Button>}
      </section>
    );
  const current = progress.current;
  const maintenance = data.cards.filter((c) => {
    const p = readSituation(c.front, c.back)?.pedagogy;
    return p && p.stage < current.stage;
  }).length;
  const inspect = () => {
    try {
      setPreview(inspectAiBatch(json, data.cards, data.events));
      setError("");
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Lote inválido.");
    }
  };
  const save = async () => {
    if (busy || !deckId || !preview) return;
    setBusy(true);
    try {
      const latest = await loadLearningData();
      if (!latest.decks.some((d) => d.id === deckId))
        throw new Error("Escolha um baralho existente.");
      const checked = inspectAiBatch(json, latest.cards, latest.events);
      await importLearningCards(
        deckId,
        checked.additions.map((item) => ({
          ...batchCardHtml(checked.batch, item),
          english: item.english,
        })),
      );
      toast.success(
        `${checked.additions.length} ${checked.additions.length === 1 ? 'situação salva' : 'situações salvas'} no aparelho.`,
        {
          description:
            "A sincronização com a nuvem segue o fluxo normal do app.",
        },
      );
      setJson("");
      setPreview(null);
      setShowImport(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4" aria-label="Currículo de inglês">
      <div className="rounded-2xl border border-primary/30 bg-card p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-primary">
            Seu caminho de inglês · 30 microetapas
          </p>
          <h2 className="text-xl font-bold mt-2">
            Etapa {current.stage} — {current.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Unidade {current.unit} · {current.goal}
          </p>
        </div>
        {data.offline && (
          <p role="status" className="text-sm text-amber-500">
            Exibindo dados disponíveis no aparelho. Conecte e atualize para
            incluir as revisões de outros dispositivos.
          </p>
        )}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Domínio da unidade</span>
            <strong>{current.overall}%</strong>
          </div>
          <Progress value={current.overall} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {SKILLS.map((skill) => (
            <div key={skill}>
              <div className="flex justify-between text-sm mb-2">
                <span>{SKILL_LABELS[skill]}</span>
                <span>
                  {current.coverage[skill] === 0
                    ? "Sem evidência"
                    : `${current.skills[skill]}%`}
                </span>
              </div>
              <Progress value={current.skills[skill]} className="h-1.5" />
            </div>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {current.count} situações · {current.retained} com evidência em dias
          espaçados · {maintenance} em manutenção
        </p>
        <p className="text-sm">
          {progress.complete
            ? "Todas as etapas estão liberadas. Continue reforçando a retenção."
            : current.mastered
              ? "Domínio com retenção demonstrado."
              : current.earned
                ? "Próxima etapa liberada. Continue revisando para consolidar."
                : "Para avançar: 80% geral, ao menos 65% em cada habilidade, 5 situações, 80% de cobertura por habilidade e revisão em 3 dias, com retenção de pelo menos 48 horas em 80% das situações."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/practice')}>Treino livre</Button>
          <Button onClick={() => navigate("/curriculum/study")}>
            Estudar meu currículo
          </Button>
          <Button variant="outline" onClick={() => setShowImport(!showImport)}>
            Importar conteúdo da IA
          </Button>
          <Button variant="ghost" onClick={refresh}>
            Atualizar progresso
          </Button>
        </div>
      </div>
      <div className="rounded-2xl border border-border p-4 space-y-3">
        <h3 className="font-semibold">Novo lote com seu chat</h3>
        <p className="text-sm text-muted-foreground">
          Copie o Prompt Master uma vez. A cada lote, envie o contexto
          atualizado. Revise o texto antes de produzir imagem e áudio.
        </p>
        <label className="text-sm flex items-center gap-3">
          Situações por lote
          <input
            aria-label="Situações por lote"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(50, Number(e.target.value) || 10)))
            }
            className="w-20 rounded border border-border bg-background p-2"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              copy(exportLearningContext(data.cards, data.events, count))
            }
          >
            Copiar contexto para IA
          </Button>
          <Button variant="outline" onClick={() => copy(MASTER_PROMPT)}>
            Copiar Prompt Master
          </Button>
        </div>
        {copyText && (
          <Textarea
            aria-label="Texto para copiar"
            readOnly
            value={copyText}
            rows={10}
            onFocus={(e) => e.target.select()}
          />
        )}
      </div>
      {showImport && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <h3 className="font-semibold">Importar conteúdo da IA</h3>
          <p className="text-sm text-muted-foreground">
            Cole o JSON ou abra um arquivo de até 1 MB. Nenhuma mídia será
            gerada. URLs de mídia fornecidas serão usadas nos exercícios.
          </p>
          <input
            aria-label="Abrir JSON da IA"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1_000_000) {
                setError("Arquivo maior que 1 MB.");
                return;
              }
              setJson(await file.text());
              setPreview(null);
            }}
          />
          <Textarea
            aria-label="JSON da IA"
            rows={9}
            value={json}
            disabled={busy}
            onChange={(e) => {
              setJson(e.target.value);
              setPreview(null);
              setError("");
            }}
            placeholder='{"format":"REVYSTUDY_BATCH_V1", ...}'
          />
          <label className="block text-sm">
            Baralho de destino
            <select
              aria-label="Baralho de destino"
              value={deckId}
              disabled={busy}
              onChange={(e) => setDeckId(e.target.value)}
              className="block mt-2 w-full bg-background border border-border rounded p-2"
            >
              <option value="" disabled>
                Escolha um baralho
              </option>
              {data.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {!data.decks.length && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const deck = await addDeck(
                    "Meu currículo de inglês",
                    "Situações do currículo progressivo",
                  );
                  await refresh();
                  setDeckId(deck.id);
                } catch {
                  setError("Não foi possível criar o baralho.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Criar baralho do currículo
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy || !json.trim()}
            onClick={inspect}
          >
            Validar e revisar lote
          </Button>
          {preview && (
            <div className="space-y-3">
              <p>
                {preview.additions.length} novas situações ·{" "}
                {preview.duplicates} duplicadas ignoradas
              </p>
              <p className="text-sm text-muted-foreground">
                Etapa {preview.batch.stage}, unidade {preview.batch.unit} · Lote{" "}
                {preview.batch.batch}. Confira naturalidade, tradução e
                adequação: a validação automática verifica formato e metadados,
                não julga toda a gramática.
              </p>
              <div className="max-h-96 overflow-y-auto space-y-3">
                {preview.additions.map((item) => (
                  <article
                    key={item.id}
                    className="border border-border rounded-xl p-3"
                  >
                    <p className="text-xs text-muted-foreground">{item.id}</p>
                    <p lang="en" className="font-medium">
                      {item.english}
                    </p>
                    <p lang="pt" className="text-sm text-muted-foreground">
                      {item.portuguese}
                    </p>
                    {item.hint && <p className="text-sm">Dica: {item.hint}</p>}
                    <p className="text-xs mt-2">
                      {item.structures.join(" · ")} ·{" "}
                      {item.image_url ? "Imagem anexada" : "Imagem pendente"} ·{" "}
                      {item.audio_url ? "Áudio anexado" : "Áudio pendente"}
                    </p>
                  </article>
                ))}
              </div>
              <Button
                disabled={busy || !deckId || !preview.additions.length}
                onClick={save}
              >
                {busy ? "Salvando…" : "Aprovar e importar lote"}
              </Button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive whitespace-pre-wrap"
        >
          {error}
        </p>
      )}
      <details className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer font-semibold">
          Mapa do currículo e retenção
        </summary>
        <p className="text-sm text-muted-foreground my-3">
          Liberar permite avançar. Dominar exige 90% geral, 80% por habilidade e
          ao menos 7 dias entre revisões. Esquecimento posterior pede reforço e
          não retira o acesso já conquistado.
        </p>
        <ol className="space-y-3">
          {progress.units.map((unit) => (
            <li key={unit.stage} className="border-t border-border pt-3">
              <div className="flex justify-between gap-2">
                <span>
                  {unit.stage}. {unit.title}
                </span>
                <span className="text-xs text-primary">
                  {!unit.unlocked
                    ? "Bloqueada"
                    : unit.mastered
                      ? "Dominada"
                      : unit.earned
                        ? "Avanço conquistado"
                        : "Liberada"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Unidade {unit.unit} · {unit.overall}% · {unit.count} situações
              </p>
              <p className="text-xs mt-1">{unit.structures.join(" · ")}</p>
            </li>
          ))}
        </ol>
      </details>
      {progress.legacy > 0 && (
        <p className="text-sm text-muted-foreground">
          {progress.legacy} cards estão sem etapa. Eles continuam disponíveis
          nos baralhos. Para incluir uma situação no currículo, edite-a e
          escolha sua etapa.
        </p>
      )}
    </section>
  );
}
