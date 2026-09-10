import { CURRICULUM } from "@/lib/curriculum";
export default function PedagogyFields({
  stage,
  onStage,
  hint,
  onHint,
}: {
  stage: number;
  onStage: (n: number) => void;
  hint: string;
  onHint: (s: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <h2 className="font-bold">Currículo e intenção</h2>
      <label className="block text-sm">
        Etapa
        <select
          value={stage}
          onChange={(e) => onStage(Number(e.target.value))}
          className="block mt-2 w-full bg-background rounded border border-border p-2"
        >
          <option value={0}>Sem etapa · conteúdo livre</option>
          {CURRICULUM.map((u) => (
            <option key={u.stage} value={u.stage}>
              Etapa {u.stage} — {u.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Dica de intenção em português
        <input
          value={hint}
          maxLength={500}
          onChange={(e) => onHint(e.target.value)}
          placeholder="Diga a que horas costuma acordar."
          className="block mt-2 w-full bg-background rounded border border-border p-2"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        A dica orienta a produção sem exigir que uma imagem tenha uma única
        interpretação. Classificar um conteúdo não libera uma etapa.
      </p>
    </section>
  );
}
