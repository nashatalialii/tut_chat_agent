import { z } from 'zod';
import type { LegalCitation } from '../rag/types.js';

export const VoiceClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), sessionId: z.string().min(1).max(128), mimeType: z.string().min(1).max(100).default('audio/webm') }),
  z.object({ type: z.literal('audio'), chunkBase64: z.string().min(1).max(15_000_000) }),
  z.object({ type: z.literal('commit') }),
  z.object({ type: z.literal('interrupt') }),
  z.object({ type: z.literal('close') })
]);

export type VoiceClientMessage = z.infer<typeof VoiceClientMessageSchema>;

export type VoiceServerMessage =
  | { type: 'ready' }
  | { type: 'transcript'; text: string; final: boolean }
  | { type: 'answer_token'; token: string }
  | { type: 'tts_audio'; audioBase64: string; mimeType: string }
  | { type: 'voice_warning'; message: string }
  | { type: 'done'; citations?: LegalCitation[] }
  | { type: 'interrupted' }
  | { type: 'error'; message: string };
