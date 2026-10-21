import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/store/chat-store';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex w-full', isUser ? 'justify-start' : 'justify-end')}>
      <article
        className={cn(
          'max-w-[88%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm md:max-w-[74%]',
          isUser ? 'bg-primary text-primary-foreground' : 'border bg-white text-foreground'
        )}
      >
        {message.content || (message.pending ? 'جاري التفكير...' : '')}

        {!isUser && message.citations && message.citations.length > 0 ? (
          <div className="mt-4 border-t pt-3 text-xs leading-6 text-muted-foreground">
            <p className="font-bold text-foreground">المراجع المسترجعة</p>
            {message.citations.map((citation, index) => (
              <div key={`${citation.documentId}-${citation.articleNumber ?? ''}-${citation.pageNumber ?? index}`} className="mt-2">
                <div>
                  {index + 1}. {citation.documentTitle}
                  {citation.lawNumber ? ` — قانون رقم ${citation.lawNumber}${citation.lawYear ? ` لسنة ${citation.lawYear}` : ''}` : ''}
                  {citation.articleNumber ? ` — مادة ${citation.articleNumber}` : ''}
                  {citation.pageNumber ? ` — ص ${citation.pageNumber}${citation.pageEnd && citation.pageEnd !== citation.pageNumber ? `–${citation.pageEnd}` : ''}` : ''}
                </div>
                <div>
                  المصدر: {citation.sourceName} · {citation.sourceStatus === 'official' ? 'رسمي' : citation.sourceStatus === 'verified' ? 'مراجع' : citation.sourceStatus}
                  {citation.sourceUrl ? (
                    <>
                      {' · '}
                      <a href={citation.sourceUrl} target="_blank" rel="noreferrer" className="underline">فتح المصدر</a>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </article>
    </div>
  );
}
