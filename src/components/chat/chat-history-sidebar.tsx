"use client"

import React, { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Conversation, Task } from "@/lib/types"
import { cn, truncate } from "@/lib/utils"
import { PlusIcon, BrainCircuit, Trash2 } from "lucide-react"

interface ChatHistorySidebarProps {
  conversations: Conversation[]
  activeId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onLogout?: () => void
  user?: { name?: string; email?: string } | null
  tasks?: Task[]
  onOpenTasksModal?: () => void
  onDeleteConversation?: (id: string) => void
}

export function ChatHistorySidebar({
  conversations,
  activeId,
  onSelectConversation,
  onNewConversation,
  onLogout,
  user,
  tasks = [],
  onOpenTasksModal,
  onDeleteConversation,
}: ChatHistorySidebarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Get the first message from conversation to display as title
  const getConversationTitle = (conversation: Conversation): string => {
    // If it has a custom title (not "New Conversation"), use it
    if (conversation.title && conversation.title !== "New Conversation") {
      return conversation.title
    }
    
    // Otherwise, get first user message
    if (conversation.messages && conversation.messages.length > 0) {
      const firstUserMessage = conversation.messages.find(m => m.role === "user")
      if (firstUserMessage) {
        return firstUserMessage.content.substring(0, 40)
      }
    }
    
    return "New Conversation"
  }

  return (
    <div className="flex flex-col h-full w-full border-r border-border bg-background">
      {/* Header - Fixed */}
      <div className="p-6 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <BrainCircuit className="h-5 w-5 text-primary" />
          </div>
          <h1 className="font-bold text-lg">SABA</h1>
        </div>
        <Button onClick={onNewConversation} className="w-full gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30">
          <PlusIcon className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* User Profile Box - Fixed at Top */}
      <div className="border-b border-border p-2 flex-shrink-0">
        <div className="flex items-center gap-3 bg-muted/30 hover:bg-muted/50 rounded-lg p-2 transition-colors cursor-pointer group border border-border">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
            {(user?.name || "U").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {user?.name || "User"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email || "user@email.com"}
            </p>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0"
              title="Logout"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tasks Button - Opens Modal */}
      <div className="border-b border-border flex-shrink-0 p-3">
        <Button
          onClick={onOpenTasksModal}
          variant="outline"
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <span>✓</span>
            <span>Tasks</span>
          </span>
          <span className="text-xs bg-primary/20 text-primary rounded-full px-2 py-0.5">
            {tasks.length}
          </span>
        </Button>
      </div>

      {/* History - Custom Scrollable Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden w-full bg-background scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent hover:scrollbar-thumb-border/80"
      >
        <div className="px-3 py-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <div key={conv.id} className="group relative">
                <button
                  onClick={() => onSelectConversation(conv.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:text-foreground text-muted-foreground",
                    activeId === conv.id && "text-foreground bg-muted/50"
                  )}
                  title={getConversationTitle(conv)}
                >
                  <span className="block truncate">💬 {truncate(getConversationTitle(conv), 28)}</span>
                </button>
                {onDeleteConversation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (typeof window !== 'undefined') {
                        const ok = window.confirm('Delete this conversation permanently?')
                        if (!ok) return
                      }
                      onDeleteConversation(conv.id)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600 p-1"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
