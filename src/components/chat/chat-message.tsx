'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { Bot, User, BrainCircuit } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { role, content, isProcessing, intent, entities } = message;
  const isAssistant = role === 'assistant';

  if (isProcessing) {
    return (
      <div className="flex items-start gap-3">
        <Avatar className="flex-shrink-0 h-9 w-9 border border-zinc-200">
          <AvatarFallback className="bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 w-full',
        !isAssistant && 'flex-row-reverse'
      )}
    >
      <Avatar
        className={cn(
          'flex-shrink-0 h-9 w-9 border',
          isAssistant ? 'border-zinc-200' : 'border-accent'
        )}
      >
        <AvatarFallback className={cn(isAssistant ? 'bg-primary/10' : 'bg-accent/10')}>
          {isAssistant ? (
            <Bot className="h-5 w-5 text-primary" />
          ) : (
            <User className="h-5 w-5 text-accent" />
          )}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'flex-1 rounded-lg px-4 py-3 shadow-sm max-w-[85%]',
          isAssistant ? 'bg-card' : 'bg-accent/20'
        )}
      >
        <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
        {isAssistant && intent && intent !== 'error' && (
          <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-500">
                Intent: {intent}
              </span>
            </div>
            {entities &&
              entities.length > 0 &&
              entities.map((entity, idx) => (
                // include index in key to avoid duplicates when entity text repeats
                <Badge variant="outline" key={`${entity}-${idx}`}>
                  {entity}
                </Badge>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
