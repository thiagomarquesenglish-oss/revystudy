export default function PedagogyFields({
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
      <h2 className="font-bold">Intenção da situação</h2>
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
        A dica orienta a produção sem exigir que uma imagem tenha uma única interpretação.
      </p>
    </section>
  );
}
