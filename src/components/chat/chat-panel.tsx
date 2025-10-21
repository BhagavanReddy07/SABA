"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChatMessage } from "./chat-message"
import { Message, Conversation } from "@/lib/types"
import { generateId } from "@/lib/utils"
import { SendIcon, BrainCircuit } from "lucide-react"

interface ChatPanelProps {
  conversation: Conversation | null
  onUpdateConversation: (oldId: string, newConversation: Conversation) => void
  onTasksRefresh?: () => void
}

// Generate a title from the first message
const generateTitleFromMessage = (message: string): string => {
  // Get first 50 characters or first sentence
  const trimmed = message.trim()
  const firstSentence = trimmed.split(/[.!?]/)[0].trim()
  const title = firstSentence.substring(0, 50)
  return title || "New Conversation"
}

const starterPrompts = [
  "Hello! What can you help me with?",
  "Tell me about yourself",
  "Help me organize my day",
  "Create a reminder for me",
]

export function ChatPanel({
  conversation,
  onUpdateConversation,
  onTasksRefresh,
}: ChatPanelProps) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (conversation) {
      setMessages(conversation.messages)
    } else {
      setMessages([])
    }
  }, [conversation])

  useEffect(() => {
    // Auto-scroll to bottom
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim()) return
    
    // If no conversation exists, we need to handle this
    if (!conversation) {
      console.warn('No active conversation')
      return
    }

    const userInput = input
    const newMessage: Message = {
      id: generateId(),
      role: "user",
      content: userInput,
      createdAt: new Date(),
      userId: "current-user",
      conversationId: conversation.id,
    }

    const updatedMessages = [...messages, newMessage]
    setMessages(updatedMessages)
    setInput("")
    setIsLoading(true)

    try {
      const token = localStorage.getItem("authToken")
      
      if (!token) {
        throw new Error("No authentication token found")
      }

      console.log('Sending message to conversation:', conversation.id)
      
      // Only send conversationId if conversation already has messages (existing conversation)
      // For new conversations, let the backend create them
      const requestBody: any = {
        message: userInput,
      }
      
      if (conversation.messages && conversation.messages.length > 0) {
        requestBody.conversationId = conversation.id
      }
      
      // Send message to backend API
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to get response")
      }

  const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "API returned error")
      }

      console.log('Received response:', data)

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: data.response || "Sorry, I couldn't process that.",
        intent: data.intent,
        entities: data.entities,
        createdAt: new Date(),
        userId: "assistant",
        conversationId: data.conversationId || conversation.id,
      }

      const allMessages = [...updatedMessages, assistantMessage]
      setMessages(allMessages)

      // Update conversation with backend conversation ID if it's new
      const updatedConversation = {
        ...conversation,
        id: data.conversationId || conversation.id, // Use backend ID
        title: conversation.messages.length === 0 ? generateTitleFromMessage(userInput) : conversation.title,
        messages: allMessages,
        updatedAt: new Date(),
      }
      
      // Pass old ID and new conversation so parent can handle ID changes
      onUpdateConversation(conversation.id, updatedConversation)

      // If a task was created by the AI endpoint, request a tasks refresh
      if (data.task) {
        if (onTasksRefresh) {
          onTasksRefresh()
        } else {
          // Fallback: emit a browser event so parent can listen
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tasks:refresh'))
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error)
      
      // Add error message to chat
      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
        createdAt: new Date(),
        userId: "assistant",
        conversationId: conversation.id,
      }
      
      const allMessages = [...updatedMessages, errorMessage]
      setMessages(allMessages)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Messages Area - Scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <div className="mb-8">
                <div className="mb-6 flex justify-center">
                  <BrainCircuit className="h-16 w-16 text-primary" />
                </div>
                <h1 className="text-4xl font-bold mb-3">SABA</h1>
                <p className="text-muted-foreground text-lg max-w-2xl">
                  Start a conversation with your personal AI assistant. It learns, adapts, and helps you with your tasks.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12 w-full max-w-2xl">
                {starterPrompts.map((prompt, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className="h-auto py-4 px-6 text-base text-left justify-start rounded-lg border border-border hover:bg-accent/10 transition-colors"
                    onClick={() => {
                      setInput(prompt)
                      sendMessage()
                    }}
                  >
                    <span className="text-muted-foreground group-hover:text-foreground">{prompt}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 flex flex-col">
              {messages.map((message, i) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLoading={isLoading && i === messages.length - 1}
                />
              ))}
              <div ref={scrollRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input - Fixed at Bottom */}
      <div className="border-t border-border p-4 flex-shrink-0 bg-background">
        <div className="flex gap-3">
          <Input
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            size="icon"
          >
            <SendIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
