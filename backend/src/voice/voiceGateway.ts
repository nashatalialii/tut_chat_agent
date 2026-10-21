import { WebSocketServer, WebSocket } from 'ws';
import { VoiceClientMessageSchema, type VoiceServerMessage } from './protocol.js';
import { transcribeAudio } from './stt.js';
import { synthesizeArabicSpeech } from './tts.js';
import { RagPipeline } from '../rag/pipeline.js';
import { redis } from '../redis/client.js';
import { env } from '../env.js';
import { logger } from '../observability/logger.js';
import type { LegalCitation } from '../rag/types.js';

function send(ws: WebSocket, msg: VoiceServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function createVoiceGateway() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, request) => {
    let sessionId = 'voice-anon';
    let mimeType = 'audio/webm';
    let chunks: Buffer[] = [];
    let totalAudioBytes = 0;
    let abortController: AbortController | null = null;

    logger.info('voice.connected', {
      path: request.url ?? '/voice',
      origin: request.headers.origin ?? 'unknown'
    });
    send(ws, { type: 'ready' });

    ws.on('error', (error) => {
      logger.error('voice.socket_error', { error: error.message });
    });

    ws.on('close', (code) => {
      abortController?.abort();
      chunks = [];
      totalAudioBytes = 0;
      logger.info('voice.disconnected', { code });
    });

    ws.on('message', async (raw) => {
      try {
        const parsed = VoiceClientMessageSchema.parse(JSON.parse(raw.toString()));

        if (parsed.type === 'start') {
          sessionId = parsed.sessionId;
          mimeType = parsed.mimeType;
          chunks = [];
          totalAudioBytes = 0;
          abortController?.abort();
          abortController = new AbortController();
          logger.info('voice.recording_started', { session_id: sessionId, mime_type: mimeType });
          send(ws, { type: 'ready' });
          return;
        }

        if (parsed.type === 'audio') {
          const chunk = Buffer.from(parsed.chunkBase64, 'base64');
          totalAudioBytes += chunk.length;
          if (totalAudioBytes > env.VOICE_MAX_AUDIO_BYTES) {
            chunks = [];
            totalAudioBytes = 0;
            throw new Error('التسجيل الصوتي أطول أو أكبر من الحد المسموح. حاول بسؤال أقصر.');
          }
          chunks.push(chunk);
          return;
        }

        if (parsed.type === 'interrupt') {
          abortController?.abort();
          chunks = [];
          totalAudioBytes = 0;
          send(ws, { type: 'interrupted' });
          return;
        }

        if (parsed.type === 'commit') {
          const audio = Buffer.concat(chunks);
          chunks = [];
          totalAudioBytes = 0;
          if (audio.length === 0) throw new Error('لم يصل تسجيل صوتي. حاول مرة أخرى.');

          logger.info('voice.audio_committed', { session_id: sessionId, audio_bytes: audio.length, mime_type: mimeType });
          const text = await transcribeAudio(audio, mimeType);
          logger.info('voice.transcribed', { session_id: sessionId, text_chars: text.length });
          send(ws, { type: 'transcript', text, final: true });

          const rag = new RagPipeline(redis);
          let fullAnswer = '';
          let citations: LegalCitation[] = [];
          abortController = new AbortController();

          for await (const event of rag.streamAnswer({ question: text, sessionId, signal: abortController.signal })) {
            if (event.type === 'token') {
              fullAnswer += event.token;
              send(ws, { type: 'answer_token', token: event.token });
            } else if (event.type === 'done') {
              citations = event.citations;
            }
          }

          if (!abortController.signal.aborted && fullAnswer.trim()) {
            try {
              const speech = await synthesizeArabicSpeech(fullAnswer);
              if (speech) {
                send(ws, { type: 'tts_audio', ...speech });
              } else {
                send(ws, { type: 'voice_warning', message: 'تمت الإجابة نصيًا، لكن خدمة قراءة الإجابة بالصوت غير مفعلة.' });
              }
            } catch (error) {
              send(ws, {
                type: 'voice_warning',
                message: `تمت الإجابة نصيًا، لكن تعذر توليد الصوت: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`
              });
            }
          }

          send(ws, { type: 'done', citations });
          return;
        }

        if (parsed.type === 'close') ws.close();
      } catch (err) {
        logger.error('voice.message_error', { error: err instanceof Error ? err.message : 'unknown voice error' });
        send(ws, { type: 'error', message: err instanceof Error ? err.message : 'حدث خطأ في خدمة الصوت.' });
      }
    });
  });

  return wss;
}
