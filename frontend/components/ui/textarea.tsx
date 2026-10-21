import * as React from 'react';
import { cn } from '@/lib/utils';

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-[52px] w-full resize-none rounded-2xl border bg-white px-4 py-3 text-sm outline-none ring-offset-background transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring',
        props.className
      )}
    />
  );
}
