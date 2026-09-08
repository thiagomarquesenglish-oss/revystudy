# Currículo de inglês · MVP v1

## Uso

1. Abra **Progresso**. A primeira microetapa é “Apresentar-se”, unidade 1.
2. Copie **Prompt Master** para um chat externo. Depois copie **Contexto para IA** e cole no mesmo chat.
3. Peça o lote. Em **Importar conteúdo da IA**, cole o JSON ou abra um arquivo, escolha o baralho e pressione **Validar e revisar lote**.
4. Confira inglês, tradução, intenção e adequação pedagógica. **Aprovar e importar lote** grava as situações. Reimportar a mesma frase/ID não cria cópias.
5. Na biblioteca, edite cada situação para anexar imagem e áudio quando estiverem prontos. O prompt de imagem fica disponível na edição. Apenas modalidades com os recursos presentes são selecionadas.
6. Use **Estudar meu currículo** para intercalar conteúdos de etapas liberadas. Os baralhos e exercícios livres continuam disponíveis.

O usuário continua sendo a ponte entre o app e o chat. Não há integração de API, cobrança de geração, reconhecimento de voz ou geração automática de mídia. A produção oral é uma tentativa em voz alta seguida de autoavaliação. A dica de intenção reduz a ambiguidade da imagem e respostas naturais equivalentes podem ser consideradas corretas pelo usuário.

## Decisões pedagógicas

- São 30 microetapas cumulativas e versionadas em `english-v1`. Cada microetapa contém uma unidade no MVP; o protocolo mantém ambos os campos para permitir expansão posterior. Não representam certificação de nível CEFR.
- Cada etapa define objetivo, estruturas e vocabulário novos. As anteriores são permitidas para reutilização. A IA produz exemplos dentro desse mapa, nunca escolhe o nível ou libera etapas.
- Cada situação é um único registro em `cards`. O motor seleciona uma modalidade por encontro, considerando recursos presentes, histórico, fraquezas, exploração e redução gradual de ajuda. Não força seis repetições da mesma situação por sessão.
- Listening, compreensão, produção e escrita são separados. Ditado contribui para listening e escrita. Revisões antigas sem modalidade não são convertidas em evidência inventada.
- A escala de domínio usa Errei=0, Difícil=40, Bom=90, Fácil=100. Por situação/habilidade, toma a última avaliação de cada dia UTC e até seis dias recentes, com maior peso nos mais recentes. Dias sem estudo não viram acertos. Após 30 dias sem evidência há redução gradual, limitada a 50% da pontuação anterior.
- A nota da unidade inclui situações não treinadas como zero. A UI distingue “Sem evidência” de uma nota observada.
- **Avançar:** pelo menos cinco situações, média de 80%, mínimo de 65% em cada habilidade, cobertura de 80% das situações em cada habilidade, três dias de treino e acertos separados por pelo menos 48 horas em 80% das situações.
- **Dominar:** os mesmos requisitos de cobertura/quantidade, média de 90%, mínimo de 80% por habilidade e evidência distribuída em pelo menos sete dias.
- A liberação conquistada é reconstruída dos eventos datados e do conjunto de situações que existia naquele momento. Esquecimento e novos lotes não retiram o acesso conquistado. Apagar conteúdo/histórico ou reclassificá-lo pode alterar essa reconstrução; o app não faz isso automaticamente.
- A sessão curricular contém até 30 situações vencidas ou novas. Intercala aproximadamente 55% da etapa atual, 25% das duas anteriores e 20% de etapas mais antigas, preenchendo vagas quando uma faixa está vazia. Dentro de cada faixa, revisões vencidas têm prioridade sobre novos conteúdos. Não adianta artificialmente revisões futuras só para cumprir uma porcentagem.
- Retentativas Errei/Difícil mantêm o mecanismo de posições existente. Se faltarem outros exercícios para o espaçamento dentro da sessão, a situação permanece no agendamento SRS e volta depois.

Os limiares são heurísticas transparentes do MVP, não uma medida validada de proficiência. O ditado pode sinalizar erro de escrita, mas não diagnostica sozinho sua causa; a contribuição dupla é uma aproximação explícita.

## Compatibilidade e persistência

Stack preservada: React 18, TypeScript, Vite, componentes shadcn/Tailwind, Supabase, IndexedDB e fila durável de sincronização. O agendador SRS existente continua responsável pelos intervalos.

O app já armazenava situações estruturadas em `cards.front/back`, usando atributos `data-situation`, `data-answer-en`, `data-translation-pt` e `data-situation-media`. O MVP acrescenta um atributo `data-learning` com JSON validado/escapado e preserva esse formato. Nele ficam currículo, etapa, unidade, objetivo, estruturas, vocabulário, verbo principal, tags, dificuldade, origem, IDs, prompt de imagem e texto de áudio. A mídia permanece nos elementos já usados pelo app.

Essa escolha evita nova tabela e backfill destrutivo e mantém os metadados nos fluxos existentes de download por baralho, exportação/importação ZIP e backup completo. Edições de situações preservam os metadados, salvo mudança explícita da etapa. Cards clássicos continuam com frente/verso e sem classificação. Não são apagados nem classificados automaticamente.

O banco precisa ter a migração já existente `20260906201000_add_adaptive_learning_fields.sql`, que adiciona `review_history.skill` e `exercise_mode`. Não há nova migração SQL para este MVP. Esses campos foram conferidos no banco conectado antes da publicação.

O salvamento de uma avaliação grava o card e o evento de revisão junto da fila de sincronização em uma única transação IndexedDB. A tela só avança após esse compromisso local. A atualização enviada à nuvem contém apenas campos de progresso, para não sobrescrever conteúdo editado em outro dispositivo. Não altera a política existente de resolução de conflitos SRS entre dispositivos.

A importação aprovada também grava todos os cards e a fila numa única transação local. Falhas abortam o lote integralmente. A sincronização remota usa a fila já existente; a confirmação local não promete que a nuvem já recebeu tudo. IDs de eventos tornam reenvios idempotentes. A prevenção de frases/IDs duplicados é local e revalidada antes da gravação: importações simultâneas do mesmo lote em aparelhos desconectados ainda podem produzir duplicatas remotas.

O painel combina revisões multimodais e os eventos de ditado já existentes, sem alterar o agendamento separado do modo de ditado. Históricos são paginados e as revisões locais pendentes são preservadas. O painel usa somente baralhos da conta ativa e sinaliza quando só há dados locais. Baralhos instalados continuam seguindo o fluxo explícito de atualização de pacotes do app.

## Protocolo externo

Fonte canônica do Prompt Master: `MASTER_PROMPT` em `src/lib/ai-protocol.ts`; disponível para copiar no painel. O currículo completo é anexado automaticamente.

O contexto exportado é `CURRICULUM_STATE_V1`, com versão, etapa/unidade atual, habilidades, materiais permitidos, novos conteúdos, dificuldades por habilidade/estrutura, unidades já liberadas, IDs/frases existentes, último lote e pedido de quantidade. Não envia credenciais, e-mail ou IDs da conta.

O lote de entrada é `REVYSTUDY_BATCH_V1`. Exemplos com os campos mínimos:

```json
{
  "format": "REVYSTUDY_BATCH_V1",
  "curriculum": "english-v1",
  "stage": 1,
  "unit": 1,
  "batch": "S01-U01-B01",
  "cards": [
    {
      "id": "S01-U01-B01-C01",
      "english": "I am a student.",
      "portuguese": "Eu sou estudante.",
      "hint": "Apresente sua ocupação.",
      "goal": "Dizer quem você é",
      "structures": ["I am", "a/an"],
      "vocabulary": ["I", "a", "student"],
      "image_prompt": "Uma pessoa adulta com material de estudo, sem texto."
    }
  ]
}
```

Campos opcionais: `main_verb`, `tags`, `difficulty` (1–5), `image_url`, `audio_url`. URLs devem ser HTTPS sem credenciais; a IA não deve inventá-las. Mídia ausente não impede importar texto ou treinar leitura/produção por português, mas limita habilidades disponíveis até ser anexada.

Limites: 1 MB de entrada e 50 situações por lote. A validação rejeita versões desconhecidas, campos extras, etapas bloqueadas, IDs repetidos no lote, conflitos de IDs já existentes, URLs inválidas e metadados fora dos conjuntos permitidos. Strings viram texto escapado, nunca HTML executável. Ela não é um analisador completo de gramática ou naturalidade: por isso a prévia e a revisão humana são obrigatórias.

## Verificação e operação

- Instalação: 
pm ci`.
- Testes sem credenciais reais: definir `VITE_SUPABASE_URL=https://test.supabase.co` e `VITE_SUPABASE_PUBLISHABLE_KEY=test-public-key`, executar 
pm test`.
- Tipos: 
px tsc --noEmit -p tsconfig.app.json`.
- Build: 
pm run build`, com as variáveis reais configuradas na Vercel para produção.
- Casos cobertos: domínio/retencão, conservação de acesso, legado, mistura sem duplicação, rejeição de lotes, importação repetida, escape de texto, prévia/aprovação, falha de salvamento e rollback transacional IndexedDB.
- O lint geral tem problemas anteriores ao MVP (principalmente `any` em módulos existentes). Não se reescreveu o projeto para resolver avisos não relacionados. O build também mantém o aviso de tamanho de bundle já presente.

Para reverter a interface, reverta o commit de implementação. Os campos HTML e eventos permanecem compatíveis com a versão anterior; não exclua os dados para fazer rollback.

## Treino livre
Acesse Treino livre pelo progresso ou por um baralho. Escolha aleatório, escuta, produção ou ditado e um limite de 5, 10, 20 ou 30 exercícios. Cada situação aparece no máximo uma vez por sessão, usando os materiais disponíveis. Ditado compara com a frase inglesa cadastrada. As avaliações servem apenas ao resumo da sessão, não são persistidas como evidência de domínio e não alteram SRS nem liberação de etapas. A revisão diária continua escolhendo uma modalidade por situação, com reforço quando necessário.
