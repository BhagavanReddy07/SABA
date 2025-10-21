"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Memory } from "@/lib/types"
import { generateId } from "@/lib/utils"
import { useState } from "react"

interface MemoryPanelProps {
  memories: Memory[]
  onMemoriesChange: (memories: Memory[]) => void
  onAddMemory?: (content: string) => void
  onEditMemory?: (id: string, patch: Partial<Pick<Memory, 'content' | 'type' | 'importance'>> & { source?: string; confidence?: number }) => void
  onDeleteMemory?: (id: string) => void
  onMemorizeNow?: () => void
}

export function MemoryPanel({ memories, onMemoriesChange, onAddMemory, onEditMemory, onDeleteMemory, onMemorizeNow }: MemoryPanelProps) {
  const [newMemory, setNewMemory] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ content: string; type: Memory['type']; importance: Memory['importance']; source?: string; confidence?: number }>({ content: "", type: "personal", importance: "medium", source: undefined, confidence: undefined })

  const addMemory = () => {
    if (!newMemory.trim()) return
    if (onAddMemory) {
      onAddMemory(newMemory.trim())
    } else {
      const memory: Memory = {
        id: generateId(),
        content: newMemory,
        userId: "current-user",
        type: "fact",
        importance: "medium",
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      onMemoriesChange([...memories, memory])
    }
    setNewMemory("")
  }

  const deleteMemory = (id: string) => {
    if (onDeleteMemory) {
      onDeleteMemory(id)
    } else {
      onMemoriesChange(memories.filter((m) => m.id !== id))
    }
  }

  const startEdit = (m: Memory) => {
    setEditingId(m.id)
    setEditDraft({ content: m.content, type: m.type, importance: m.importance })
  }

  const saveEdit = () => {
    if (!editingId) return
    const patch = { ...editDraft }
    if (onEditMemory) {
      onEditMemory(editingId, patch)
    } else {
      const updated = memories.map(m => m.id === editingId ? { ...m, ...patch, updatedAt: new Date() } : m)
      onMemoriesChange(updated)
    }
    setEditingId(null)
  }

  return (
    <Card className="h-full flex flex-col border-l border-border">
      <CardHeader className="pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">💾</span>
          <CardTitle className="text-base">Memory</CardTitle>
          {onMemorizeNow && (
            <Button size="sm" className="ml-auto" onClick={onMemorizeNow} title="Summarize current conversation now">
              Memorize now
            </Button>
          )}
        </div>
        <CardDescription>Manage SABA's memories.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Add Memory */}
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Add a new memory</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., My favorite food is p"
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background/50 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Button 
                onClick={addMemory} 
                disabled={!newMemory.trim()}
                size="icon"
                className="bg-primary hover:bg-primary/90 rounded-md"
              >
                +
              </Button>
            </div>
          </div>
        </div>

        {/* Memory List */}
        <div className="space-y-2 flex-1 overflow-y-auto pr-2">
          {memories.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No memories saved yet
            </p>
          ) : (
            memories.map((memory) => (
              <div key={memory.id} className="p-3 bg-muted/30 rounded-md border border-border/50 group hover:border-border transition-colors">
                {editingId === memory.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editDraft.content}
                      onChange={(e) => setEditDraft({ ...editDraft, content: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background/50"
                    />
                    <div className="flex gap-2">
                      <select
                        value={editDraft.type}
                        onChange={(e) => setEditDraft({ ...editDraft, type: e.target.value as any })}
                        className="px-2 py-1 text-sm border border-border rounded-md bg-background/50"
                      >
                        <option value="personal">personal</option>
                        <option value="fact">fact</option>
                        <option value="preference">preference</option>
                      </select>
                      <select
                        value={editDraft.importance}
                        onChange={(e) => setEditDraft({ ...editDraft, importance: e.target.value as any })}
                        className="px-2 py-1 text-sm border border-border rounded-md bg-background/50"
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="source (optional)"
                        value={editDraft.source || ''}
                        onChange={(e) => setEditDraft({ ...editDraft, source: e.target.value })}
                        className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background/50"
                      />
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        placeholder="confidence"
                        value={editDraft.confidence ?? ''}
                        onChange={(e) => setEditDraft({ ...editDraft, confidence: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className="w-28 px-3 py-2 text-sm border border-border rounded-md bg-background/50"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={saveEdit} disabled={!editDraft.content.trim()}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{memory.content}</p>
                      {/* Hide extra detail line to keep the panel clean; details available in edit mode */}
                    </div>
                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <button onClick={() => startEdit(memory)} className="text-muted-foreground hover:text-foreground">✎</button>
                      <button onClick={() => deleteMemory(memory.id)} className="text-muted-foreground hover:text-destructive">✕</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
