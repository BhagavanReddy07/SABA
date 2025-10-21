"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Task } from "@/lib/types"
import { Trash2, Plus, CheckCircle2, Circle } from "lucide-react"

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  tasks: Task[]
  onAddTask: (taskData: { content: string; type: "Task" | "Reminder" | "Alarm"; priority: "low" | "medium" | "high"; dueDate?: Date; tags?: string[] }) => void
  onDeleteTask: (id: string) => void
  onToggleComplete: (id: string, completed: boolean) => void
}

export function TaskModal({
  isOpen,
  onClose,
  tasks,
  onAddTask,
  onDeleteTask,
  onToggleComplete,
}: TaskModalProps) {
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskNotes, setNewTaskNotes] = useState("")
  const [newTaskDate, setNewTaskDate] = useState("")
  const [newTaskHour, setNewTaskHour] = useState("")
  const [newTaskMin, setNewTaskMin] = useState("")
  const [newTaskAMPM, setNewTaskAMPM] = useState("AM")
  const [isAdding, setIsAdding] = useState(false)
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])
  const [completedTasks, setCompletedTasks] = useState<Task[]>([])

  // Initialize date/time to today and current time when form opens
  useEffect(() => {
    if (isAdding && !newTaskDate) {
      const today = new Date()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, "0")
      const day = String(today.getDate()).padStart(2, "0")
      setNewTaskDate(`${year}-${month}-${day}`)

      let hour = today.getHours()
      const ampm = hour >= 12 ? "PM" : "AM"
      hour = hour % 12 || 12
      
      setNewTaskHour(String(hour).padStart(2, "0"))
      setNewTaskMin(String(today.getMinutes()).padStart(2, "0"))
      setNewTaskAMPM(ampm)
    }
  }, [isAdding, newTaskDate])

  // Separate tasks into pending and completed
  useEffect(() => {
    setPendingTasks(tasks.filter(t => !t.completed))
    setCompletedTasks(tasks.filter(t => t.completed))
  }, [tasks])

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return

    // Convert 12-hour to 24-hour format
    let hour24 = parseInt(newTaskHour) || 0
    if (newTaskAMPM === "PM" && hour24 !== 12) hour24 += 12
    if (newTaskAMPM === "AM" && hour24 === 12) hour24 = 0

    // Create date with time
    let dueDate = undefined
    if (newTaskDate && newTaskHour && newTaskMin) {
      try {
        const timeStr = `${String(hour24).padStart(2, "0")}:${String(parseInt(newTaskMin) || 0).padStart(2, "0")}`
        const dateTimeStr = `${newTaskDate}T${timeStr}`
        const d = new Date(dateTimeStr)
        
        // Validate the date is actually valid
        if (!isNaN(d.getTime())) {
          dueDate = d
        } else {
          console.warn("⚠️ Invalid date created:", dateTimeStr)
        }
      } catch (e) {
        console.warn("⚠️ Error creating date:", e)
      }
    }

    const newTask = {
      content: newTaskTitle,
      type: "Task" as const,
      priority: "medium" as const,
      dueDate,
      tags: [],
    }

    onAddTask(newTask)

    // Reset form
    setNewTaskTitle("")
    setNewTaskNotes("")
    setNewTaskDate("")
    setNewTaskHour("")
    setNewTaskMin("")
    setNewTaskAMPM("AM")
    setIsAdding(false)
  }

  const handleDeleteTask = (id: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      onDeleteTask(id)
    }
  }

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return "No date"
    try {
      let d: Date
      
      // Handle both Date objects and ISO strings
      if (typeof date === "string") {
        d = new Date(date)
      } else {
        d = new Date(date)
      }
      
      // Check if date is valid
      if (isNaN(d.getTime())) {
        return "Invalid date"
      }
      
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    } catch {
      return "Invalid date"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none flex flex-col p-0 gap-0 bg-background">
        {/* Header - Fixed */}
        <DialogHeader className="border-b border-border p-6 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-4xl font-bold">My Tasks</DialogTitle>
            <button
              onClick={onClose}
              className="text-2xl text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
        </DialogHeader>

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6 space-y-8">
            {/* Add Task Form Section */}
            <div className="bg-muted/10 border border-border rounded-lg p-6">
              <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Plus className="h-6 w-6" />
                Add New Task
              </h3>

              {!isAdding ? (
                <Button
                  onClick={() => setIsAdding(true)}
                  variant="outline"
                  className="w-full text-lg py-6"
                >
                  + Add Task Manually
                </Button>
              ) : (
                <div className="space-y-6">
                  {/* Task Title */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Task Title *</label>
                    <Input
                      placeholder="e.g., Study JavaScript, Call mom, Buy groceries"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="text-lg py-3"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
                    <Textarea
                      placeholder="Add any notes or details about this task"
                      value={newTaskNotes}
                      onChange={(e) => setNewTaskNotes(e.target.value)}
                      className="min-h-24 text-lg py-3"
                    />
                  </div>

                  {/* Date and Time Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Date */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Date</label>
                      <Input
                        type="date"
                        value={newTaskDate}
                        onChange={(e) => setNewTaskDate(e.target.value)}
                        className="text-lg py-3"
                      />
                    </div>

                    {/* Hour */}
                    <div>
                      <label className="block text-sm font-medium mb-2">Hour (12 HR)</label>
                      <Input
                        type="number"
                        min="1"
                        max="12"
                        value={newTaskHour}
                        onChange={(e) => setNewTaskHour(e.target.value)}
                        placeholder="01"
                        className="text-lg py-3 text-center"
                      />
                    </div>

                    {/* Minute and AM/PM */}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-2">Minutes</label>
                        <Input
                          type="number"
                          min="0"
                          max="59"
                          value={newTaskMin}
                          onChange={(e) => setNewTaskMin(e.target.value)}
                          placeholder="00"
                          className="text-lg py-3 text-center"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-2">AM/PM</label>
                        <select
                          value={newTaskAMPM}
                          onChange={(e) => setNewTaskAMPM(e.target.value)}
                          className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground text-lg font-medium"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      onClick={handleAddTask}
                      disabled={!newTaskTitle.trim()}
                      className="flex-1 text-lg py-6 bg-primary hover:bg-primary/90"
                    >
                      ✓ Save Task
                    </Button>
                    <Button
                      onClick={() => {
                        setIsAdding(false)
                        setNewTaskTitle("")
                        setNewTaskNotes("")
                        setNewTaskDate("")
                        setNewTaskHour("")
                        setNewTaskMin("")
                        setNewTaskAMPM("AM")
                      }}
                      variant="outline"
                      className="flex-1 text-lg py-6"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Pending Tasks Section */}
            <div>
              <h3 className="text-2xl font-bold mb-4">
                📋 Pending Tasks ({pendingTasks.length})
              </h3>
              {pendingTasks.length === 0 ? (
                <div className="bg-muted/20 border border-border rounded-lg p-8 text-center">
                  <p className="text-lg text-muted-foreground">No pending tasks. Great job! 🎉</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingTasks.map((task) => (
                    <div
                      key={task.id}
                      className="border border-border rounded-lg p-4 bg-background hover:bg-muted/30 transition-colors flex items-start gap-4"
                    >
                      <button
                        onClick={() => onToggleComplete(task.id, true)}
                        className="flex-shrink-0 mt-1 text-muted-foreground hover:text-primary transition-colors"
                        title="Mark as complete"
                      >
                        <Circle className="h-6 w-6" />
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-medium break-words">{task.content}</p>
                        {task.dueDate && (
                          <p className="text-sm text-muted-foreground mt-2">
                            📅 {formatDate(task.dueDate)}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete task"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Completed Tasks Section */}
            {completedTasks.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold mb-4">
                  ✅ Completed Tasks ({completedTasks.length})
                </h3>
                <div className="space-y-3">
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="border border-border rounded-lg p-4 bg-muted/20 opacity-70 flex items-start gap-4"
                    >
                      <button
                        onClick={() => onToggleComplete(task.id, false)}
                        className="flex-shrink-0 mt-1 text-green-500 hover:text-primary transition-colors"
                        title="Mark as pending"
                      >
                        <CheckCircle2 className="h-6 w-6" />
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-medium line-through text-muted-foreground break-words">
                          {task.content}
                        </p>
                        {task.dueDate && (
                          <p className="text-sm text-muted-foreground mt-2">
                            📅 {formatDate(task.dueDate)}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete task"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="border-t border-border p-6 bg-background flex-shrink-0">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full text-lg py-6"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
