import { env } from '../env.js';
import { logger } from '../observability/logger.js';

type SttResponse = {
  text?: string;
  raw_text?: string;
  confidence?: number | null;
  model?: string;
  retry_used?: boolean;
  correction_applied?: boolean;
  correction_score?: number;
  correction_margin?: number;
  correction_faq_id?: string | null;
  correction_intent?: string | null;
  correction_references?: string[];
  correction_reason?: string;
};

export async function transcribeAudio(buffer: Buffer, mimeType: string) {
  if (!env.STT_SERVICE_URL) {
    throw new Error('Arabic STT service is not configured. Set STT_SERVICE_URL to enable voice transcription.');
  }
  if (buffer.length === 0) throw new Error('No audio was received.');
  if (buffer.length > env.VOICE_MAX_AUDIO_BYTES) throw new Error('Audio exceeds the configured maximum size.');

  const response = await fetch(env.STT_SERVICE_URL, {
    method: 'POST',
    headers: { 'content-type': mimeType },
    body: buffer
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim();
    const suffix = detail ? ` - ${detail.slice(0, 240)}` : '';
    throw new Error(`STT service failed: ${response.status}${suffix}`);
  }

  const data = (await response.json()) as SttResponse;
  const text = data.text?.trim();
  if (!text) throw new Error('STT service returned an empty transcript.');

  const confidence = data.confidence ?? null;
  const correctionScore = data.correction_score ?? 0;
  if (
    confidence !== null &&
    confidence < 0.28 &&
    !data.correction_applied &&
    correctionScore < 65
  ) {
    logger.warn('voice.stt_unclear', {
      confidence,
      correction_score: correctionScore,
      retry_used: data.retry_used ?? false
    });
    throw new Error('لم أسمع السؤال بوضوح كفاية. حاول تاني واتكلم قريب من الميكروفون وبهدوء.');
  }

  logger.info('voice.stt_result', {
    model: data.model ?? 'unknown',
    raw_text: data.raw_text?.slice(0, 240),
    final_text: text.slice(0, 240),
    confidence: data.confidence ?? null,
    retry_used: data.retry_used ?? false,
    correction_applied: data.correction_applied ?? false,
    correction_score: data.correction_score ?? null,
    correction_margin: data.correction_margin ?? null,
    correction_faq_id: data.correction_faq_id ?? null,
    correction_intent: data.correction_intent ?? null,
    correction_references: data.correction_references?.join(', ') ?? null,
    correction_reason: data.correction_reason ?? null
  });

  return text;
}
