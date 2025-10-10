'use client';

import * as React from 'react';
import { Send, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { Conversation } from '@/lib/types';
import { ChatMessage } from './chat-message';
import { Card, CardContent } from '../ui/card';

interface ChatPanelProps {
  conversation: Conversation | null;
  onSendMessage: (message: string) => Promise<void>;
}

export function ChatPanel({ conversation, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [conversation?.messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageToSend = input.trim();
    if (!messageToSend || isSending) return;

    setInput('');
    setIsSending(true);
    
    try {
      await onSendMessage(messageToSend);
    } finally {
      setIsSending(false);
    }
  };
  
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const starterPrompts = [
    "Explain quantum computing in simple terms",
    "What are some healthy dinner recipes?",
    "Write a short story about a robot who discovers music",
    "Plan a 3-day trip to Kyoto",
  ];

  return (
    <div className="flex flex-col h-full bg-muted/20">
      <ScrollArea className="flex-1 p-4 md:p-6" ref={scrollAreaRef}>
        <div className="max-w-4xl mx-auto w-full">
          {conversation && conversation.messages.length > 0 ? (
            <div className="space-y-6">
              {(() => {
                // Dedupe messages by id to avoid rendering duplicates if backend sent repeated IDs
                const uniqueMessages = conversation.messages.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
                return uniqueMessages.map((message, index) => (
                  // Use composite key including index to avoid duplicate key warnings when message IDs are not unique
                  <ChatMessage key={`${message.id}-${index}`} message={message} />
                ));
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <div className="mb-4 p-4 bg-primary/10 rounded-full">
                <BrainCircuit className="h-12 w-12 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">SABA</h2>
              <p className="max-w-md mb-6">Start a conversation with your personal AI assistant. It learns, adapts, and helps you with your tasks.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-lg">
                {starterPrompts.map((prompt, idx) => (
                  <Button variant="outline" size="sm" key={`starter-${idx}`} onClick={() => onSendMessage(prompt)} className="text-left justify-start h-auto py-2">
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 md:p-6 border-t bg-background">
        <Card className="max-w-4xl mx-auto w-full shadow-lg">
          <CardContent className="p-2">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Type your message here..."
                className="flex-1 resize-none border-0 shadow-none focus-visible:ring-0 min-h-0"
                rows={1}
                style={{maxHeight: '150px'}}
              />
              <Button type="submit" size="icon" disabled={isSending || !input.trim()}>
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
