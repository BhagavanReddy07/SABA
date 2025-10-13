'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BrainCircuit, Plus, Trash2 } from 'lucide-react';
import type { Memory } from '@/lib/types';


interface MemoryEditorPanelProps {
    memories: Memory[];
    onAddMemory: (content: string) => void;
    onDeleteMemory: (id: string) => void;
}

export function MemoryEditorPanel({ memories, onAddMemory, onDeleteMemory }: MemoryEditorPanelProps) {
  const [newMemory, setNewMemory] = React.useState('');

  const handleAddMemory = () => {
    onAddMemory(newMemory);
    setNewMemory('');
  };

  return (
    <aside className="hidden lg:flex flex-col w-80 h-full border-l p-4 bg-card/50">
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg">Memory</CardTitle>
            <CardDescription>Manage SABA's memories.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-memory">Add a new memory</Label>
              <div className="flex gap-2">
                <Input
                  id="new-memory"
                  value={newMemory}
                  onChange={e => setNewMemory(e.target.value)}
                  placeholder="e.g., My favorite food is pizza"
                  onKeyDown={e => e.key === 'Enter' && handleAddMemory()}
                />
                <Button onClick={handleAddMemory} size="icon" className='shrink-0'>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <Separator />
          <ScrollArea className="flex-1 pr-4 -mr-4">
            <div className="space-y-2">
              {memories.map(memory => (
                <div key={memory.id} className="group flex items-center gap-2 p-3 border rounded-lg bg-card/50 text-sm">
                  <p className="flex-1">{memory.content}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteMemory(memory.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </aside>
  );
}
