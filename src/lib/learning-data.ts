import { supabase } from "@/integrations/supabase/client";
import { localDB, offlineQueue } from "./offline-db";
import { getCardsByDeck } from "./storage";
import { getDictationEvents, syncDictation } from "./dictation-sync";
import { toLearningEvent, type LearningEvent } from "./learning-progress";

function withDeadline<T>(request:PromiseLike<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('A sincronização demorou demais.')),15000);
    Promise.resolve(request).then(result=>{clearTimeout(timer);resolve(result);},error=>{clearTimeout(timer);reject(error);});
  });
}

const MANUAL_STAGE_KEY='revystudy-manual-curriculum-stage';

function localManualStage():number {
  try { return Math.max(1,Math.min(30,Number(localStorage.getItem(MANUAL_STAGE_KEY))||1)); }
  catch { return 1; }
}

export async function saveManualCurriculumStage(stage:number):Promise<number>{
  const value=Math.max(1,Math.min(30,Math.floor(stage)));
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error('Entre novamente para salvar o avanço.');
  if(navigator.onLine){
    const {error}=await supabase.from('learning_settings').upsert({user_id:session.user.id,manual_stage:value,updated_at:new Date().toISOString()});
    if(error)throw error;
  }
  localStorage.setItem(MANUAL_STAGE_KEY,String(value));
  return value;
}

export async function loadLearningData() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Entre novamente para carregar seu currículo.");
  const userId = session.user.id;
  let offline = !navigator.onLine;
  let manualStage=localManualStage();
  let deckRows = (await localDB.getDecks()).filter(
    (row) => row.user_id === userId,
  );
  if (navigator.onLine) {
    try {
      const {data:settings,error:settingsError}=await withDeadline(supabase.from('learning_settings').select('manual_stage').eq('user_id',userId).maybeSingle());
      if(settingsError)throw settingsError;
      if(settings?.manual_stage){manualStage=settings.manual_stage;localStorage.setItem(MANUAL_STAGE_KEY,String(manualStage));}
      const { data, error } = await withDeadline(supabase
        .from("decks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at"));
      if (error) throw error;
      const pending = (await offlineQueue.getAll())
        .filter(
          (m) =>
            m.table === "decks" &&
            m.action === "insert" &&
            m.payload.user_id === userId,
        )
        .map((m) => m.payload);
      const deleted = new Set(
        (await offlineQueue.getAll())
          .filter((m) => m.table === "decks" && m.action === "delete")
          .map((m) => m.payload.id),
      );
      deckRows = [
        ...new Map(
          [...(data || []), ...pending].map((row) => [row.id, row]),
        ).values(),
      ].filter((row) => !deleted.has(row.id));
    } catch {
      offline = true;
    }
  }
  const decks = deckRows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description || "",
    createdAt: row.created_at,
    contentUpdatedAt: row.content_updated_at,
    cardCount: row.card_count || 0,
    audioCount: row.audio_count || 0,
  }));
  const cards = (
    await Promise.all(decks.map((d) => getCardsByDeck(d.id)))
  ).flat();
  let rows = (await localDB.getReviewHistory()).filter(
    (r) => r.user_id === userId,
  );
  if (navigator.onLine) {
    try {
      const remote = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await withDeadline(supabase
          .from("review_history")
          .select("*")
          .eq("user_id", userId)
          .order("reviewed_at")
          .order("id")
          .range(from, from + 999));
        if (error) throw error;
        remote.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const pending = (await offlineQueue.getAll())
        .filter(
          (m) =>
            m.table === "review_history" &&
            m.action === "insert" &&
            m.payload.user_id === userId,
        )
        .map((m) => m.payload);
      rows = [
        ...new Map([...remote, ...pending].map((r) => [r.id, r])).values(),
      ];
      await Promise.all(rows.map((r) => localDB.saveReview(r)));
      await withDeadline(syncDictation());
    } catch {
      offline = true;
    }
  }
  const events: LearningEvent[] = rows
    .map(toLearningEvent)
    .filter((e): e is LearningEvent => !!e);
  for (const event of getDictationEvents(userId)) {
    if (event.rating === "legacy") continue;
    events.push({
      id: `dictation:${event.id}`,
      cardId: event.card_id,
      rating: event.rating,
      mode: "audio-dictation",
      at: event.reviewed_at,
    });
  }
  events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return { cards, decks, events, offline, manualStage };
}
