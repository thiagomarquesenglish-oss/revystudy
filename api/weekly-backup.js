import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';

const PAGE_SIZE = 1000;
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('O servidor de backup ainda não foi conectado ao Supabase.');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchAll(client, table, userId) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from(table).select('*').eq('user_id', userId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function extractMediaUrls(html) {
  if (typeof html !== 'string') return [];
  const urls = [];
  const regex = /(?:src|data-src)=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1] && !match[1].startsWith('{{MEDIA:')) urls.push(match[1]);
  }
  return urls;
}

function extensionFor(contentType, url = '') {
  const known = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/svg+xml': 'svg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
    'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  };
  const normalized = String(contentType || '').split(';')[0].toLowerCase();
  if (known[normalized]) return known[normalized];
  const path = String(url).split('?')[0];
  const candidate = path.includes('.') ? path.split('.').pop() : '';
  return candidate && /^[a-z0-9]{1,5}$/i.test(candidate) ? candidate : 'bin';
}

async function downloadRequired(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao incluir mídia no backup (${response.status}).`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

function localDateKey(date, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function localWeekday(date, timezone) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'America/Sao_Paulo', weekday: 'short',
  }).format(date);
  return WEEKDAYS[label];
}

async function sendBackupEmail(email, signedUrl, counts, generatedAt, expiresAt) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('O serviço de e-mail do backup ainda não foi conectado.');
  const from = process.env.BACKUP_FROM_EMAIL || 'RevyStudy <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Seu backup semanal do RevyStudy está pronto',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717">
          <h2>Seu backup do RevyStudy está pronto</h2>
          <p>O backup completo foi criado em ${new Date(generatedAt).toLocaleString('pt-BR')}.</p>
          <p><strong>${counts.decks}</strong> baralhos · <strong>${counts.cards}</strong> cartões · <strong>${counts.reviews}</strong> revisões · <strong>${counts.audios}</strong> áudios</p>
          <p style="margin:28px 0"><a href="${signedUrl}" style="background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Baixar backup</a></p>
          <p style="font-size:12px;color:#666">Por segurança, este link expira em ${new Date(expiresAt).toLocaleDateString('pt-BR')}.</p>
        </div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`O e-mail não pôde ser enviado: ${detail.slice(0, 180)}`);
  }
}

async function cleanupOldBackups(admin, userId, keep) {
  const { data } = await admin.from('backup_runs').select('id,storage_path')
    .eq('user_id', userId).eq('status', 'success').order('created_at', { ascending: false });
  const expired = (data || []).slice(Math.max(1, keep));
  const paths = expired.map((item) => item.storage_path).filter(Boolean);
  if (paths.length) await admin.storage.from('user-backups').remove(paths);
  if (expired.length) await admin.from('backup_runs').delete().in('id', expired.map((item) => item.id));
}

async function generateBackup(admin, userId, suppliedSettings) {
  const { data: settings } = suppliedSettings
    ? { data: suppliedSettings }
    : await admin.from('backup_settings').select('*').eq('user_id', userId).single();
  if (!settings) throw new Error('Configurações de backup não encontradas.');

  const { data: run, error: runError } = await admin.from('backup_runs')
    .insert({ user_id: userId, status: 'running', emailed_to: settings.email }).select('*').single();
  if (runError) throw runError;

  let uploadedPath = null;
  try {
    const [decks, sourceCards, reviewHistory, sourceAudios, dictationReviews] = await Promise.all([
      fetchAll(admin, 'decks', userId), fetchAll(admin, 'cards', userId),
      fetchAll(admin, 'review_history', userId), fetchAll(admin, 'deck_audios', userId), fetchAll(admin, 'dictation_reviews', userId),
    ]);
    const zip = new JSZip();
    const cards = sourceCards.map((card) => ({ ...card }));
    const embeddedUrls = new Set();
    cards.forEach((card) => {
      extractMediaUrls(card.front).forEach((url) => embeddedUrls.add(url));
      extractMediaUrls(card.back).forEach((url) => embeddedUrls.add(url));
    });

    const embeddedMedia = [];
    let mediaIndex = 0;
    if (settings.include_media) {
      for (const originalUrl of embeddedUrls) {
        const file = await downloadRequired(originalUrl);
        const zipPath = `media/embedded/media_${mediaIndex++}.${extensionFor(file.contentType, originalUrl)}`;
        zip.file(zipPath, file.bytes);
        embeddedMedia.push({ originalUrl, zipPath, contentType: file.contentType });
        cards.forEach((card) => {
          if (typeof card.front === 'string') card.front = card.front.split(originalUrl).join(`{{MEDIA:${zipPath}}}`);
          if (typeof card.back === 'string') card.back = card.back.split(originalUrl).join(`{{MEDIA:${zipPath}}}`);
        });
      }
    }

    const deckAudios = [];
    for (const audio of sourceAudios) {
      if (!settings.include_media) {
        deckAudios.push(audio);
        continue;
      }
      const { data } = admin.storage.from('deck-audios').getPublicUrl(audio.file_path);
      const file = await downloadRequired(data.publicUrl);
      const zipPath = `media/deck-audios/${audio.id}.${extensionFor(file.contentType, audio.file_path)}`;
      zip.file(zipPath, file.bytes);
      deckAudios.push({ ...audio, backup_zip_path: zipPath, backup_content_type: file.contentType });
    }

    const generatedAt = new Date().toISOString();
    const counts = { decks: decks.length, cards: cards.length, reviews: reviewHistory.length, audios: deckAudios.length };
    zip.file('revystudy-backup.json', JSON.stringify({
      format: 'revystudy-full-backup', version: 1, generatedAt, sourceUserId: userId,
      counts, decks, cards, reviewHistory, deckAudios, embeddedMedia, dictationReviews,
      preferences: settings.preferences || { pinnedStats: [], lastStudySession: null },
    }, null, 2));

    const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const stamp = generatedAt.slice(0, 10);
    const storagePath = `${userId}/revystudy-backup-${stamp}-${run.id}.revystudy.zip`;
    const { error: uploadError } = await admin.storage.from('user-backups').upload(storagePath, archive, {
      contentType: 'application/zip', upsert: false,
    });
    if (uploadError) throw uploadError;
    uploadedPath = storagePath;

    const linkSeconds = 7 * 24 * 60 * 60;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: signed, error: signedError } = await admin.storage.from('user-backups').createSignedUrl(storagePath, linkSeconds);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Não foi possível criar o link do backup.');
    await sendBackupEmail(settings.email, signed.signedUrl, counts, generatedAt, new Date(Date.now() + linkSeconds * 1000).toISOString());

    await admin.from('backup_runs').update({
      status: 'success', storage_path: storagePath, size_bytes: archive.length,
      expires_at: expiresAt, completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    await admin.from('backup_settings').update({ last_backup_at: generatedAt }).eq('user_id', userId);
    await cleanupOldBackups(admin, userId, settings.retention_count || 4);
    return { counts, sizeBytes: archive.length, email: settings.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (uploadedPath) await admin.storage.from('user-backups').remove([uploadedPath]);
    await admin.from('backup_runs').update({
      status: 'failed', error_message: message.slice(0, 500), completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    throw error;
  }
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return response.status(405).json({ error: 'Método não permitido.' });

  if (request.method === 'GET' && request.query?.health === '1') {
    return response.status(200).json({
      supabaseConnected: Boolean((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY),
      emailConnected: Boolean(process.env.RESEND_API_KEY),
      cronConnected: Boolean(process.env.CRON_SECRET),
    });
  }

  try {
    const admin = getAdminClient();
    if (request.method === 'POST') {
      const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const { data: { user }, error } = await admin.auth.getUser(token);
      if (error || !user) return response.status(401).json({ error: 'Sua sessão expirou.' });
      let { data: settings } = await admin.from('backup_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (!settings) {
        const inserted = await admin.from('backup_settings').insert({
          user_id: user.id, email: user.email, enabled: false, weekday: 0,
          timezone: 'America/Sao_Paulo', retention_count: 4, include_media: true,
        }).select('*').single();
        settings = inserted.data;
      }
      const result = await generateBackup(admin, user.id, settings);
      return response.status(200).json(result);
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.authorization !== `Bearer ${cronSecret}`) {
      return response.status(401).json({ error: 'Execução automática não autorizada.' });
    }
    const { data: settingsRows, error } = await admin.from('backup_settings').select('*').eq('enabled', true);
    if (error) throw error;
    const now = new Date();
    const results = [];
    for (const settings of settingsRows || []) {
      if (localWeekday(now, settings.timezone) !== settings.weekday) continue;
      if (settings.last_backup_at && localDateKey(new Date(settings.last_backup_at), settings.timezone) === localDateKey(now, settings.timezone)) continue;
      try {
        results.push({ userId: settings.user_id, ok: true, ...(await generateBackup(admin, settings.user_id, settings)) });
      } catch (backupError) {
        results.push({ userId: settings.user_id, ok: false, error: backupError instanceof Error ? backupError.message : String(backupError) });
      }
    }
    return response.status(200).json({ processed: results.length, results });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Falha inesperada no backup.' });
  }
}
