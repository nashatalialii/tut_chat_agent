import { env } from '../env.js';

async function callTts(baseUrl: string, text: string): Promise<{ audioBase64: string; mimeType: string } | null> {
  const res = await fetch(`${baseUrl}/synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, voice: 'ar_EG' }),
    signal: AbortSignal.timeout(env.VOICE_TTS_TIMEOUT_MS)
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`TTS ${baseUrl} failed (${res.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`TTS ${baseUrl} returned empty audio.`);

  return {
    audioBase64: buf.toString('base64'),
    mimeType: res.headers.get('content-type') ?? 'audio/wav'
  };
}

export async function synthesizeArabicSpeech(text: string): Promise<{ audioBase64: string; mimeType: string } | null> {
  if (!env.TTS_SERVICE_URL) return null;

  const endpoints = [env.TTS_SERVICE_URL, env.TTS_FALLBACK_SERVICE_URL]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index);

  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    try {
      return await callTts(endpoint, text);
    } catch (error) {
      lastError = error;
      // VoiceTut can legitimately return 503 while the large local model is
      // downloading/loading. Fall through immediately to the stable Edge/Piper
      // service so the user still gets an answer instead of a frozen chat.
      continue;
    }
  }

  if (lastError instanceof Error && (lastError.name === 'TimeoutError' || lastError.name === 'AbortError')) {
    throw new Error('تحويل الإجابة إلى صوت استغرق وقتًا أطول من المتوقع.');
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('تعذر تحويل الإجابة إلى صوت.');
}
