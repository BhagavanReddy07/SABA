"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ChatPanel } from "@/components/chat/chat-panel"
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar"
import { MemoryPanel } from "@/components/chat/memory-panel"
import { TaskModal } from "@/components/chat/task-modal"
import { Conversation, Memory, Task, User } from "@/lib/types"
import { generateId } from "@/lib/utils"

export default function ChatPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [showMemoryPanel, setShowMemoryPanel] = useState(true)
  const [showTasksModal, setShowTasksModal] = useState(false)
  const [token, setToken] = useState<string>("")

  useEffect(() => {
    const loadUserData = async () => {
      const userData = localStorage.getItem("user")
      const authToken = localStorage.getItem("authToken")
      
      if (!userData || !authToken) {
        router.push("/login")
        return
      }

      setToken(authToken)
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)

      // FIRST: Optionally load tasks from localStorage for immediate UI, but we'll always replace with backend
      const savedTasks = localStorage.getItem(`tasks-${parsedUser.id}`)
      if (savedTasks) {
        try {
          const local = JSON.parse(savedTasks)
          // Filter out any legacy/local-only items with non-numeric ids to avoid reappearing after refresh
          const cleaned = Array.isArray(local) ? local.filter((t: any) => typeof t?.id === "string" ? /^\d+$/.test(t.id) : true) : []
          setTasks(cleaned)
        } catch {}
      }

      // Load conversations from backend; always ensure one active conversation exists
      try {
        const response = await fetch("/api/conversations", {
          headers: { Authorization: `Bearer ${authToken}` },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && Array.isArray(data.conversations) && data.conversations.length > 0) {
            setConversations(data.conversations)
            setActiveConversationId(data.conversations[0].id)
          } else {
            const newConv: Conversation = {
              id: generateId(),
              title: "New Conversation",
              messages: [],
              userId: parsedUser.id || "unknown",
              isActive: true,
              createdAt: new Date(),
            }
            setConversations([newConv])
            setActiveConversationId(newConv.id)
          }
        } else {
          // If unauthorized or server error, still create a local conversation so user can start chatting
          const newConv: Conversation = {
            id: generateId(),
            title: "New Conversation",
            messages: [],
            userId: parsedUser.id || "unknown",
            isActive: true,
            createdAt: new Date(),
          }
          setConversations([newConv])
          setActiveConversationId(newConv.id)
        }
      } catch (error) {
        console.error("Failed to load conversations:", error)
        const newConv: Conversation = {
          id: generateId(),
          title: "New Conversation",
          messages: [],
          userId: parsedUser.id || "unknown",
          isActive: true,
          createdAt: new Date(),
        }
        setConversations([newConv])
        setActiveConversationId(newConv.id)
      }

      // Load memories from localStorage
      const savedMemories = localStorage.getItem("memories")
      if (savedMemories) {
        setMemories(JSON.parse(savedMemories))
      }
      // Also refresh from backend to get persisted memories
      try {
        const res = await fetch('/api/memory', { headers: { Authorization: `Bearer ${authToken}` } })
        if (res.ok) {
          const data = await res.json()
          if (data?.success && Array.isArray(data.memories)) {
            setMemories(data.memories)
            localStorage.setItem('memories', JSON.stringify(data.memories))
          }
        }
      } catch {}

      // Load tasks from backend API (authoritative)
      try {
        const tasksResponse = await fetch(`/api/tasks?token=${authToken}`)
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json()
          if (tasksData.success && Array.isArray(tasksData.tasks)) {
            console.log("✅ Loaded tasks from backend API")
            // Normalize dueDate: if string without timezone, treat as UTC by appending 'Z'
            const normalized = tasksData.tasks.map((t: any) => {
              if (t && typeof t.dueDate === "string" && t.dueDate && !/[Zz]|[+\-]\d{2}:?\d{2}$/.test(t.dueDate)) {
                return { ...t, dueDate: `${t.dueDate}Z` }
              }
              return t
            })
            // Always prefer backend as source of truth
            setTasks(normalized)
            localStorage.setItem(`tasks-${parsedUser.id}`, JSON.stringify(normalized))
          } else {
            // If backend returns empty list, clear local tasks to avoid resurrecting deleted ones
            setTasks([])
            localStorage.setItem(`tasks-${parsedUser.id}`, JSON.stringify([]))
          }
        }
      } catch (error) {
        console.error("Backend task sync skipped (API unavailable):", error)
      }
    }

    loadUserData()
  }, [router])

  // Helper to sync tasks from backend
  const refreshTasksFromBackend = async () => {
    if (!user || !token) return
    try {
      const res = await fetch(`/api/tasks?token=${token}`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks)
        localStorage.setItem(`tasks-${user.id}`, JSON.stringify(data.tasks))
      }
    } catch {}
  }

  // Periodically sync tasks from backend so completed status updates after reminders
  useEffect(() => {
    if (!user || !token) return

    const syncTasks = async () => {
      await refreshTasksFromBackend()
    }

    // initial quick sync and then every 60s
    const initial = setTimeout(syncTasks, 5000)
    const interval = setInterval(syncTasks, 60000)
    return () => { clearTimeout(initial); clearInterval(interval) }
  }, [user, token])

  // Listen for tasks refresh events from child components
  useEffect(() => {
    const handler = () => {
      refreshTasksFromBackend()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('tasks:refresh', handler)
      return () => window.removeEventListener('tasks:refresh', handler)
    }
  }, [user, token])

  const currentConversation = conversations.find(
    (c) => c.id === activeConversationId
  ) || null

  const handleNewConversation = () => {
    const newConversation: Conversation = {
      id: generateId(),
      title: "New Conversation",
      messages: [],
      userId: user?.id || "unknown",
      isActive: true,
      createdAt: new Date(),
    }
    const updated = [newConversation, ...conversations]
    setConversations(updated)
    setActiveConversationId(newConversation.id)
    localStorage.setItem("conversations", JSON.stringify(updated))
  }

  const refreshMemoriesFromBackend = async () => {
    if (!token) return
    try {
      const res = await fetch('/api/memory', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data?.success && Array.isArray(data.memories)) {
        setMemories(data.memories)
        localStorage.setItem('memories', JSON.stringify(data.memories))
      }
    } catch {}
  }

  const handleSelectConversation = async (newId: string) => {
    // Before switching, extract memories from the current conversation once
    if (activeConversationId && activeConversationId !== newId && token) {
      try {
        await fetch('/api/memory/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ conversationId: activeConversationId }),
        })
        // Refresh memory list after extraction
        await refreshMemoriesFromBackend()
      } catch {}
    }
    setActiveConversationId(newId)
  }

  const handleUpdateConversation = (oldId: string, conversation: Conversation) => {
    // If the conversation ID changed (new conversation got backend ID), we need to:
    // 1. Remove the old local ID from the list
    // 2. Add the new one or update if it exists
    const updated = conversations
      .filter(c => c.id !== oldId) // Remove old ID
      .map(c => c.id === conversation.id ? conversation : c) // Update if exists
    
    // If the conversation ID is new (not in the list), add it
    if (!updated.some(c => c.id === conversation.id)) {
      updated.unshift(conversation)
    }
    
    setConversations(updated)
    
    // If the active conversation was the old one, update it to the new ID
    if (activeConversationId === oldId) {
      setActiveConversationId(conversation.id)
    }
    
    localStorage.setItem("conversations", JSON.stringify(updated))
  }

  const handleDeleteConversation = async (id: string) => {
    if (!token) return
    try {
      // Run memory extraction once before deletion
      try {
        await fetch('/api/memory/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ conversationId: id })
        })
        await refreshMemoriesFromBackend()
      } catch {}

      const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        console.error('Failed to delete conversation:', res.status)
        return
      }

      // Update local state
      const remaining = conversations.filter(c => c.id !== id)
      setConversations(remaining)

      // Reassign active conversation if needed
      if (activeConversationId === id) {
        if (remaining.length > 0) {
          setActiveConversationId(remaining[0].id)
        } else {
          // Create a local fresh conversation if none remain
          const newConv: Conversation = {
            id: generateId(),
            title: 'New Conversation',
            messages: [],
            userId: user?.id || 'unknown',
            isActive: true,
            createdAt: new Date(),
          }
          setConversations([newConv])
          setActiveConversationId(newConv.id)
        }
      }

      localStorage.setItem('conversations', JSON.stringify(remaining))
    } catch (e) {
      console.error('Error deleting conversation:', e)
    }
  }
  const handleMemoriesChange = (newMemories: Memory[]) => {
    setMemories(newMemories)
    localStorage.setItem("memories", JSON.stringify(newMemories))
  }

  const handleLogout = () => {
    localStorage.removeItem("authToken")
    localStorage.removeItem("user")
    router.push("/login")
  }

  const handleAddTask = async (taskData: { content: string; type: "Task" | "Reminder" | "Alarm"; priority: "low" | "medium" | "high"; dueDate?: Date; tags?: string[] }) => {
    try {
      // Create task object with ID
      const newTask: Task = {
        id: `task-${Date.now()}`,
        content: taskData.content,
        type: taskData.type,
        priority: taskData.priority,
        completed: false,
        dueDate: taskData.dueDate,
        tags: taskData.tags || [],
        userId: user?.id || "unknown",
        createdAt: new Date(),
        time: taskData.dueDate ? taskData.dueDate.toLocaleTimeString() : undefined,
      }

      // Optimistic add to local state
      setTasks(prev => {
        const updated = [...prev, newTask]
        localStorage.setItem(`tasks-${user?.id}`, JSON.stringify(updated))
        return updated
      })

      // 📧 Email is now handled by backend scheduler!
      // The backend automatically schedules email for the due time
      // No need to send email here anymore

      // Try to save to API
      try {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: taskData.content,
            type: taskData.type,
            priority: taskData.priority,
            dueDate: taskData.dueDate?.toISOString(),
            tags: taskData.tags || [],
            completed: false,
            token: token,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          const serverId = data?.task?.id
          if (serverId) {
            // Replace temporary id with backend id so future PATCH/DELETE persist
            setTasks(prev => {
              const updated = prev.map(t => t.id === newTask.id ? { ...t, id: String(serverId) } : t)
              localStorage.setItem(`tasks-${user?.id}`, JSON.stringify(updated))
              return updated
            })
          }
          console.log("✅ Task saved to backend")
          // Force a refresh from backend to ensure authoritative state
          try {
            const r = await fetch(`/api/tasks?token=${token}`)
            if (r.ok) {
              const d = await r.json()
              if (d?.success && Array.isArray(d.tasks)) {
                setTasks(d.tasks)
                localStorage.setItem(`tasks-${user?.id}`, JSON.stringify(d.tasks))
              }
            }
          } catch {}
        } else {
          console.log("⚠️ Task saved locally (backend unavailable)")
        }
      } catch (apiError) {
        console.log("⚠️ Task saved locally (backend unavailable)")
      }
    } catch (error) {
      console.error("Failed to add task:", error)
    }
  }

  const handleDeleteTask = async (id: string) => {
    // Keep previous state in case we need to roll back
    const prev = tasks
    try {
      // Optimistically remove
      const updatedTasks = tasks.filter(t => t.id !== id)
      setTasks(updatedTasks)
      localStorage.setItem(`tasks-${user?.id}` || "tasks", JSON.stringify(updatedTasks))

      // Call API (pass token redundantly in header and query for reliability)
      const response = await fetch(`/api/tasks/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        // Roll back on failure
        setTasks(prev)
        localStorage.setItem(`tasks-${user?.id}` || "tasks", JSON.stringify(prev))
        console.error("❌ Failed to delete from backend:", response.status)
        return
      }

      console.log("✅ Task deleted from backend")
      // Refresh from backend to ensure authoritative state
      try {
        const r = await fetch(`/api/tasks?token=${encodeURIComponent(token)}`)
        if (r.ok) {
          const d = await r.json()
          if (d?.success && Array.isArray(d.tasks)) {
            setTasks(d.tasks)
            localStorage.setItem(`tasks-${user?.id}` || "tasks", JSON.stringify(d.tasks))
          }
        }
      } catch {}
    } catch (error) {
      // Roll back on unexpected error
      setTasks(prev)
      localStorage.setItem(`tasks-${user?.id}` || "tasks", JSON.stringify(prev))
      console.error("Failed to delete task:", error)
    }
  }

  const handleToggleComplete = async (id: string, completed: boolean) => {
    try {
      // Update local state immediately
      const updatedTasks = tasks.map(t => t.id === id ? { ...t, completed } : t)
      setTasks(updatedTasks)

      // Save to localStorage
      localStorage.setItem(`tasks-${user?.id}`, JSON.stringify(updatedTasks))

      // Try to update API
      try {
        const resp = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ completed }),
        })
        if (resp.ok) {
          console.log("✅ Task updated on backend")
          // Refresh from backend to ensure persisted state
          try {
            const r = await fetch(`/api/tasks?token=${token}`)
            if (r.ok) {
              const d = await r.json()
              if (d?.success && Array.isArray(d.tasks)) {
                setTasks(d.tasks)
                localStorage.setItem(`tasks-${user?.id}`, JSON.stringify(d.tasks))
              }
            }
          } catch {}
        }
      } catch (apiError) {
        console.log("⚠️ Task updated locally (backend unavailable)")
      }
    } catch (error) {
      console.error("Failed to toggle task:", error)
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 h-full flex-shrink-0 border-r border-border overflow-hidden flex flex-col">
        <ChatHistorySidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onLogout={handleLogout}
          user={user}
          tasks={tasks}
          onOpenTasksModal={() => setShowTasksModal(true)}
          onDeleteConversation={handleDeleteConversation}
        />
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Content */}
        <div className="flex-1 flex gap-2 p-2 min-w-0 overflow-hidden">
          {/* Chat */}
          <div className="flex-1 flex flex-col rounded-lg overflow-hidden relative min-w-0">
            <ChatPanel
              conversation={currentConversation}
              onUpdateConversation={handleUpdateConversation}
              onTasksRefresh={refreshTasksFromBackend}
            />
            {/* Settings Icon - Top Right Corner */}
            <button
              onClick={() => setShowMemoryPanel(!showMemoryPanel)}
              className="absolute top-2 right-2 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors z-10"
              title="Toggle memory panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {/* Right Panel */}
          {showMemoryPanel && (
            <div className="w-80 flex-shrink-0 flex flex-col space-y-2 overflow-hidden min-w-0">
              <div className="flex-1 rounded-lg border border-border overflow-hidden min-w-0">
                <MemoryPanel
                  memories={memories}
                  onMemoriesChange={handleMemoriesChange}
                  onMemorizeNow={async () => {
                    if (!activeConversationId || !token) return
                    try {
                      await fetch('/api/memory/extract', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ conversationId: activeConversationId })
                      })
                      await refreshMemoriesFromBackend()
                    } catch {}
                  }}
                  onAddMemory={async (content) => {
                    if (!token) return
                    try {
                      const res = await fetch('/api/memory', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ contents: [content], source: 'manual' })
                      })
                      if (res.ok) await refreshMemoriesFromBackend()
                    } catch {}
                  }}
                  onEditMemory={async (id, patch) => {
                    if (!token) return
                    try {
                      const res = await fetch('/api/memory', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ id, ...patch })
                      })
                      if (res.ok) await refreshMemoriesFromBackend()
                    } catch {}
                  }}
                  onDeleteMemory={async (id) => {
                    if (!token) return
                    try {
                      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` },
                      })
                      if (res.ok) await refreshMemoriesFromBackend()
                    } catch {}
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task Modal */}
      <TaskModal
        isOpen={showTasksModal}
        onClose={() => setShowTasksModal(false)}
        tasks={tasks}
        onAddTask={handleAddTask}
        onDeleteTask={handleDeleteTask}
        onToggleComplete={handleToggleComplete}
      />
    </div>
  )
}
