import { pedagogySchema, type Pedagogy } from './curriculum';
export interface SituationContent { english: string; context: string; portuguese: string; mediaHtml: string; pedagogy?: Pedagogy; imagePrompt?: string }
export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function buildSituationHtml(content: SituationContent) {
  const metadata = content.pedagogy ? ` data-learning="${escapeHtml(JSON.stringify(pedagogySchema.parse(content.pedagogy)))}"` : '';
  const front = `<div data-situation="true"${metadata}${content.imagePrompt ? ` data-image-prompt="${escapeHtml(content.imagePrompt)}"` : ''}><div data-context-en>${escapeHtml(content.context)}</div><div data-situation-media>${content.mediaHtml}</div></div>`;
  const back = `<div data-situation-answer><p data-answer-en lang="en">${escapeHtml(content.english)}</p>${content.portuguese ? `<p data-translation-pt lang="pt">${escapeHtml(content.portuguese)}</p>` : ''}</div>`;
  return { front, back };
}
export function readSituation(front: string, back: string): SituationContent | null {
  const root = document.createElement('div'); root.innerHTML = front + back;
  if (!root.querySelector('[data-situation]')) return null;
  let pedagogy: Pedagogy | undefined;
  try { const result=pedagogySchema.safeParse(JSON.parse(root.querySelector('[data-learning]')?.getAttribute('data-learning') || 'null')); if(result.success)pedagogy=result.data as Pedagogy; } catch { /* Legacy content remains usable. */ }
  return {
    ...(root.querySelector('[data-image-prompt]')?.getAttribute('data-image-prompt') ? {imagePrompt:root.querySelector('[data-image-prompt]')!.getAttribute('data-image-prompt')!} : {}),
    ...(pedagogy ? {pedagogy} : {}),
    english: root.querySelector('[data-answer-en]')?.textContent?.trim() || '',
    context: root.querySelector('[data-context-en]')?.textContent?.trim() || '',
    portuguese: root.querySelector('[data-translation-pt]')?.textContent?.trim() || '',
    mediaHtml: root.querySelector('[data-situation-media]')?.innerHTML || '',
  };
}

export const IMAGE_GENERATION_RULES = `Gere APENAS UMA imagem para o card abaixo e depois pare.

Interprete english como a fonte principal do sentido, usando hint, goal e image_prompt para eliminar ambiguidades. A cena precisa comunicar visualmente o significado e o tempo verbal, sem depender de texto.

Regras de composição:
- Use fotografia altamente fotorrealista e cinematográfica, com pessoas, objetos e ambientes críveis. Nunca use desenho, ilustração, anime ou quadrinhos.
- A imagem deve ser quadrada, proporção 1:1, com os elementos importantes dentro da área central.
- É proibido qualquer texto visível: sem palavras, letras, números escritos, legendas, balões, placas legíveis ou marcas d'água.
- Mostre uma única situação clara, sem objetos desnecessários.
- Quando houver I ou personagem genérico, use como protagonista recorrente um homem jovem adulto no fim dos 20/início dos 30 anos, mantendo aparência consistente.
- Respeite o gênero de he/she e mantenha Ana, Sam e outros nomes visualmente consistentes entre cards.
- Para he, she, they ou nome referido em terceira pessoa, inclua uma âncora de identificação: outra pessoa apresentando, um gesto natural de indicação, um ponto de vista de apresentação ou uma interação equivalente. Não mostre apenas o sujeito posando sozinho.
- Varie enquadramento e ângulo entre cards. Evite selfie, pose repetida e pessoa apontando diretamente para a câmera, exceto quando a frase exigir isso.
- Presente: ação acontecendo agora. Passado: personagem no presente com evidência concreta do que ocorreu. Futuro/intenção: preparação imediatamente anterior. Pergunta: procura, checagem ou diálogo com dúvida. Condicional: situação contemplativa.
- Negação deve mostrar ausência ou recusa; frequência deve mostrar hábito; comparações devem exibir os elementos lado a lado; emoções precisam de linguagem corporal e uma causa visível; quantidades devem ser exatas e contáveis.

Não escreva explicações. Gere somente a imagem.`;

function normalizedImageSkeleton(value:string){
  return value.replace(/ilustra(?:ção|cao)\s+simples\s+e\s+realista/gi,'fotografia fotorrealista e cinematográfica').replace(/ilustra(?:ção|cao)/gi,'fotografia').trim();
}

export function buildImageGenerationPrompt(content:SituationContent){
  return `${IMAGE_GENERATION_RULES}\n\nCARD ATUAL:\n${JSON.stringify({english:content.english,hint:content.context,goal:content.pedagogy?.goal||'',image_prompt:normalizedImageSkeleton(content.pedagogy?.imagePrompt||'')},null,2)}`;
}
export function translationSupportLevel(reviewCount: number) { return reviewCount < 3 ? 'visible' : reviewCount < 6 ? 'hint' : 'reference'; }
