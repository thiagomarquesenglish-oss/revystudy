import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('O servidor ainda não foi conectado ao Supabase.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

function parseJson(text) {
  const normalized = String(text || '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const value = JSON.parse(normalized);
  for (const field of ['conceptKey', 'title', 'explanation', 'quickMeaning', 'cardFront', 'cardBack']) {
    if (typeof value[field] !== 'string' || !value[field].trim()) throw new Error('A IA retornou uma explicação incompleta.');
  }
  return value;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido.' });
  try {
    const admin = adminClient();
    const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return response.status(401).json({ error: 'Sua sessão expirou.' });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return response.status(503).json({ error: 'A ajuda por IA ainda não foi conectada. Adicione GEMINI_API_KEY na Vercel.' });
    const sentence = clean(request.body?.sentence, 500);
    const selectedText = clean(request.body?.selectedText, 120);
    const portuguese = clean(request.body?.portuguese, 500);
    const question = clean(request.body?.question, 500);
    const level = clean(request.body?.level, 80) || 'iniciante';
    if (!sentence || !selectedText) return response.status(400).json({ error: 'Selecione um trecho da frase.' });

    const prompt = `Você é o tutor de inglês do RevyStudy. Explique em português do Brasil somente a dúvida indicada, de modo curto, concreto e adequado a um aluno ${level}.
Frase completa em inglês: ${JSON.stringify(sentence)}
Tradução de referência: ${JSON.stringify(portuguese)}
Trecho selecionado: ${JSON.stringify(selectedText)}
Pergunta adicional: ${JSON.stringify(question || 'Explique o significado, o uso e por que esse trecho aparece nesta frase.')}

Identifique o conceito e o sentido específico no contexto. Use no máximo 120 palavras na explicação, exemplos curtos e linguagem simples. Não use Markdown. Crie também um cartão de conceito curto, autocontido e próprio para memorização; não transforme a frase original em seis exercícios.
Responda APENAS JSON válido neste formato:
{"conceptKey":"categoria:conceito_sentido","title":"título curto","quickMeaning":"significado em poucas palavras","explanation":"explicação curta com exemplos em linhas separadas","cardFront":"pergunta curta para revisão","cardBack":"resposta curta com regra e exemplos"}`;

    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const gemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 700 },
      }),
    });
    if (!gemini.ok) {
      const detail = await gemini.text();
      console.error('Gemini error', gemini.status, detail.slice(0, 500));
      return response.status(gemini.status === 429 ? 429 : 502).json({ error: gemini.status === 429 ? 'O limite gratuito da IA foi atingido. Tente novamente mais tarde.' : 'A IA não conseguiu gerar a explicação agora.' });
    }
    const payload = await gemini.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    return response.status(200).json(parseJson(text));
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Não foi possível gerar a explicação.' });
  }
}
