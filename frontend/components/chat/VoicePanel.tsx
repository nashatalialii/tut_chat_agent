'use client';

import { Mic, Square, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getOrCreateSessionId } from '@/lib/utils';
import { useChatStore } from '@/lib/store/chat-store';
import type { VoiceServerMessage } from '@egypt-traffic/backend/voice-protocol';

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function resolveVoiceWsUrl() {
  const configured = process.env.NEXT_PUBLIC_VOICE_WS_URL?.trim();
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:4000/voice`;
}

export function VoicePanel() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('جاهز للصوت');
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const assistantIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceWarningRef = useRef<string | null>(null);
  const wsOpenedRef = useRef(false);
  const { addMessage, appendToMessage, setMessage } = useChatStore();

  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      wsRef.current?.close();
      audioSourceRef.current?.stop();
      void audioContextRef.current?.close();
    };
  }, []);

  async function unlockAudio() {
    if (!audioContextRef.current) {
      const AudioContextCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) audioContextRef.current = new AudioContextCtor();
    }
    if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
  }

  async function playVoice(audioBase64: string) {
    await unlockAudio();
    const context = audioContextRef.current;
    if (!context) throw new Error('المتصفح لا يدعم تشغيل الصوت.');

    audioSourceRef.current?.stop();
    const decoded = await context.decodeAudioData(base64ToArrayBuffer(audioBase64));
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(context.destination);
    source.onended = () => {
      if (audioSourceRef.current === source) audioSourceRef.current = null;
      setStatus('جاهز لسؤال صوتي جديد');
    };
    audioSourceRef.current = source;
    source.start();
  }

  async function start() {
    if (busy) return;
    let stream: MediaStream | null = null;
    try {
      await unlockAudio();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 }
        }
      });
      const wsUrl = resolveVoiceWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      wsOpenedRef.current = false;
      chunksRef.current = [];
      voiceWarningRef.current = null;
      setBusy(true);
      setStatus('جاري فتح قناة الصوت...');

      ws.onopen = () => {
        wsOpenedRef.current = true;
        const preferredMimeTypes = [
          'audio/webm;codecs=opus',
          'audio/ogg;codecs=opus',
          'audio/webm',
          'audio/ogg'
        ];
        const requestedMimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
        const recorder = requestedMimeType
          ? new MediaRecorder(stream!, { mimeType: requestedMimeType })
          : new MediaRecorder(stream!);
        const mimeType = recorder.mimeType || requestedMimeType || 'application/octet-stream';
        ws.send(JSON.stringify({ type: 'start', sessionId: getOrCreateSessionId(), mimeType }));

        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = async () => {
          try {
            const audioBlob = new Blob(chunksRef.current, { type: mimeType });
            chunksRef.current = [];
            if (audioBlob.size === 0) throw new Error('لم يتم تسجيل صوت. حاول مرة أخرى.');
            if (ws.readyState !== WebSocket.OPEN) throw new Error('اتصال الصوت غير متاح.');
            ws.send(JSON.stringify({ type: 'audio', chunkBase64: await blobToBase64(audioBlob) }));
            ws.send(JSON.stringify({ type: 'commit' }));
            setStatus('جاري تحويل صوتك إلى نص...');
          } catch (error) {
            setBusy(false);
            setStatus(error instanceof Error ? error.message : 'تعذر إرسال التسجيل.');
          } finally {
            stream?.getTracks().forEach((track) => track.stop());
          }
        };
        recorder.start();
        setRecording(true);
        setBusy(false);
        setStatus('اسمعك الآن... اضغط إيقاف وإرسال عند انتهاء السؤال');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as VoiceServerMessage;
        if (msg.type === 'transcript') {
          addMessage({ role: 'user', content: msg.text });
          assistantIdRef.current = addMessage({ role: 'assistant', content: '', pending: true });
          setBusy(true);
          setStatus(`سمعت: ${msg.text} — جاري البحث والرد...`);
        }
        if (msg.type === 'answer_token' && assistantIdRef.current) {
          appendToMessage(assistantIdRef.current, msg.token);
        }
        if (msg.type === 'tts_audio') {
          voiceWarningRef.current = null;
          setStatus('تشغيل الإجابة بالصوت...');
          void playVoice(msg.audioBase64).catch((error: unknown) => {
            setStatus(error instanceof Error ? error.message : 'تمت الإجابة نصيًا، لكن تعذر تشغيل الصوت.');
          });
        }
        if (msg.type === 'voice_warning') {
          voiceWarningRef.current = msg.message;
          setStatus(msg.message);
        }
        if (msg.type === 'done' && assistantIdRef.current) {
          const patch = msg.citations
            ? { pending: false as const, citations: msg.citations }
            : { pending: false as const };
          setMessage(assistantIdRef.current, patch);
          setBusy(false);
          if (voiceWarningRef.current) setStatus(voiceWarningRef.current);
          else if (!audioSourceRef.current) setStatus('جاهز لسؤال صوتي جديد');
          assistantIdRef.current = null;
          ws.close();
        }
        if (msg.type === 'interrupted') {
          setBusy(false);
          setStatus('تم إيقاف الرد. يمكنك السؤال من جديد.');
        }
        if (msg.type === 'error') {
          setBusy(false);
          setStatus(msg.message);
        }
      };

      ws.onerror = () => {
        stream?.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setBusy(false);
        setStatus(`تعذر فتح WebSocket الصوت (${wsUrl}). تأكد أن backend يعمل على المنفذ 4000.`);
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (!wsOpenedRef.current && event.code !== 1000) {
          stream?.getTracks().forEach((track) => track.stop());
          setRecording(false);
          setBusy(false);
          setStatus(`فشل اتصال الصوت (code ${event.code}). أعد تشغيل backend بعد تطبيق Voice WS Fix.`);
        }
      };
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setBusy(false);
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setStatus('اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.');
      } else {
        setStatus(error instanceof Error ? error.message : 'تعذر تشغيل الميكروفون.');
      }
    }
  }

  function stopAndCommit() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    setRecording(false);
    setBusy(true);
    setStatus('جاري تجهيز التسجيل...');
  }

  function interrupt() {
    wsRef.current?.send(JSON.stringify({ type: 'interrupt' }));
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    audioSourceRef.current?.stop();
    audioSourceRef.current = null;
    setRecording(false);
    setBusy(false);
    setStatus('تمت المقاطعة.');
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-3xl border bg-white p-3">
      <Button type="button" disabled={busy && !recording} onClick={recording ? stopAndCommit : start} className="gap-2">
        {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {recording ? 'إيقاف وإرسال' : busy ? 'جاري المعالجة...' : 'تحدث الآن'}
      </Button>
      <Button type="button" onClick={interrupt} className="gap-2 bg-slate-900">
        <Zap className="h-4 w-4" /> مقاطعة
      </Button>
      <span className="text-xs text-muted-foreground">{status}</span>
    </div>
  );
}
