"use client"

import React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Message } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ChatMessageProps {
  message: Message
  isLoading?: boolean
}

export function ChatMessage({ message, isLoading }: ChatMessageProps) {
  const isAssistant = message.role === "assistant"

  const sanitized = (() => {
    // Strip heavy markdown markers and excessive whitespace for a clean, professional look
    let text = (message.content || "").toString()
    // Remove bold/italic markers ** __ * _
    text = text.replace(/\*\*(.*?)\*\*/g, "$1")
               .replace(/__(.*?)__/g, "$1")
               .replace(/\*(.*?)\*/g, "$1")
               .replace(/_(.*?)_/g, "$1")
    // Collapse more than 2 newlines
    text = text.replace(/\n{3,}/g, "\n\n")
    // Limit very long enumerations by trimming to 12 lines max
    const lines = text.split(/\n/)
    if (lines.length > 12) {
      text = [...lines.slice(0, 12), "…"].join("\n")
    }
    return text
  })()

  return (
    <div
      className={cn(
        "flex gap-3 w-full animate-fade-in",
        isAssistant ? "justify-start" : "justify-end"
      )}
    >
      {isAssistant && (
        <Avatar className="h-8 w-8 shrink-0 mt-1">
          <AvatarImage src="/ai-avatar.svg" alt="SABA" />
          <AvatarFallback className="bg-primary/20">SA</AvatarFallback>
        </Avatar>
      )}

      <div className={cn("flex flex-col gap-1 max-w-3xl md:max-w-4xl", isAssistant ? "" : "items-end")}> 
        <Card
          className={cn(
            "px-4 py-2",
            isAssistant
              ? "bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground"
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{sanitized}</p>
        </Card>

        <div className="flex items-center gap-2 px-1">
          {/* Intentionally hiding per-message timestamps for a cleaner, professional look */}
          {isLoading && isAssistant && (
            <span className="inline-flex gap-1">
              <span className="animate-typing inline-block h-2 w-2 rounded-full bg-muted-foreground"></span>
              <span className="animate-typing animation-delay-100 inline-block h-2 w-2 rounded-full bg-muted-foreground"></span>
              <span className="animate-typing animation-delay-200 inline-block h-2 w-2 rounded-full bg-muted-foreground"></span>
            </span>
          )}
        </div>

        {/* Hide intent/entity chips for a cleaner professional interface */}
      </div>

      {!isAssistant && (
        <Avatar className="h-8 w-8 shrink-0 mt-1">
          <AvatarImage src="/user-avatar.svg" alt="User" />
          <AvatarFallback className="bg-accent/20">U</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}
