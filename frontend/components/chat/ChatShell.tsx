'use client';

import { Send, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { getOrCreateSessionId, resetSessionId } from '@/lib/utils';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { MessageBubble } from './MessageBubble';
import { VoicePanel } from './VoicePanel';

export function ChatShell() {
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(() => (typeof window !== 'undefined' ? getOrCreateSessionId() : 'server'));
  const { messages, addMessage, setMessage, clear } = useChatStore();
  const askMutation = trpc.chat.ask.useMutation();
  const clearMutation = trpc.chat.clearMemory.useMutation();

  function submit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || askMutation.isPending) return;

    const history = messages.map((message) => ({ role: message.role, content: message.content }));
    addMessage({ role: 'user', content: question });
    const assistantId = addMessage({ role: 'assistant', content: 'جاري تجهيز الإجابة...', pending: true });
    setInput('');

    askMutation.mutate(
      { sessionId, question, history },
      {
        onSuccess(data) {
          setMessage(assistantId, { content: data.answer, citations: data.citations, pending: false });
        },
        onError(error) {
          setMessage(assistantId, { content: `حصل خطأ: ${error.message}`, pending: false });
        }
      }
    );
  }

  function newConversation() {
    if (clearMutation.isPending) return;
    clearMutation.mutate(
      { sessionId },
      {
        onSettled() {
          clear();
          setSessionId(resetSessionId());
        }
      }
    );
  }

  return (
    <section className="mx-auto grid h-[calc(100vh-2rem)] max-w-6xl grid-rows-[auto_1fr_auto] gap-4 md:h-[calc(100vh-3rem)]">
      <header className="flex flex-col gap-3 rounded-[2rem] border bg-white/85 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold text-primary">Egyptian Traffic Laws RAG</p>
          <h1 className="text-2xl font-black tracking-tight">مساعد قانون المرور المصري</h1>
          <p className="text-sm text-muted-foreground">إجابات مبنية على الأدلة القانونية المنشورة في قاعدة المعرفة مع مراجع قابلة للتتبع.</p>
        </div>

        <Button type="button" onClick={newConversation} disabled={clearMutation.isPending} className="gap-2 bg-slate-900">
          <Trash2 className="h-4 w-4" />
          محادثة جديدة
        </Button>
      </header>

      <Card className="overflow-hidden p-0">
        <div className="h-full overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <p className="text-lg font-bold text-foreground">اسأل عن قانون المرور المصري</p>
              <p className="mt-2 max-w-xl text-sm">مثال: ما النص المتاح عن تجاوز السرعة؟ ما حالات سحب الرخصة في المصادر المنشورة؟</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}</div>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        <VoicePanel />
        <form onSubmit={submit} className="flex gap-2 rounded-[2rem] border bg-white p-3 shadow-sm">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="اكتب سؤالك عن قانون المرور المصري..."
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button disabled={!input.trim() || askMutation.isPending} className="h-[52px] w-[52px] shrink-0 rounded-2xl p-0">
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </section>
  );
}
