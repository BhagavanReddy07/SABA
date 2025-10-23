"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Card } from "@/components/ui/card"
import { Task } from "@/lib/types"
import { generateId } from "@/lib/utils"
import { Trash2Icon, CheckIcon, Plus } from "lucide-react"

interface TaskManagerProps {
  tasks: Task[]
  onTasksChange: (tasks: Task[]) => void
}

export function TaskManager({ tasks, onTasksChange }: TaskManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [taskContent, setTaskContent] = useState("")
  const [taskType, setTaskType] = useState<"Task" | "Reminder" | "Alarm">("Task")
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium")

  const addTask = () => {
    if (!taskContent.trim()) return

    const newTask: Task = {
      id: generateId(),
      type: taskType,
      content: taskContent,
      priority: taskPriority,
      completed: false,
      userId: "current-user",
      createdAt: new Date(),
    }

    onTasksChange([...tasks, newTask])
    setTaskContent("")
    setTaskType("Task")
    setTaskPriority("medium")
    setIsOpen(false)
  }

  const toggleTask = (id: string) => {
    onTasksChange(
      tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    )
  }

  const deleteTask = (id: string) => {
    onTasksChange(tasks.filter((t) => t.id !== id))
  }

  const activeTasks = tasks.filter((t) => !t.completed)
  const completedTasks = tasks.filter((t) => t.completed)

  return (
    <div className="space-y-4">
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button className="w-full gap-2">
            <Plus className="h-4 w-4" />
            Add Task
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>Create a task, reminder, or alarm</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-content">Task Content</Label>
              <Input
                id="task-content"
                placeholder="What do you need to do?"
                value={taskContent}
                onChange={(e) => setTaskContent(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-type">Type</Label>
                <select
                  id="task-type"
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option>Task</option>
                  <option>Reminder</option>
                  <option>Alarm</option>
                </select>
              </div>
              <div>
                <Label htmlFor="task-priority">Priority</Label>
                <select
                  id="task-priority"
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as any)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <Button onClick={addTask} className="w-full">
              Add Task
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active Tasks */}
      {activeTasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">
            Active ({activeTasks.length})
          </h3>
          {activeTasks.map((task) => (
            <Card key={task.id} className="p-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleTask(task.id)}
                  className="mt-1 h-5 w-5 rounded border border-input hover:bg-accent flex items-center justify-center"
                >
                  {task.completed && <CheckIcon className="h-3 w-3" />}
                </button>
                <div className="flex-1">
                  <p className="text-sm font-medium">{task.content}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                      {task.type}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${
                      task.priority === "high" ? "bg-destructive/20 text-destructive" :
                      task.priority === "medium" ? "bg-accent/20 text-accent" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">
            Completed ({completedTasks.length})
          </h3>
          {completedTasks.map((task) => (
            <Card key={task.id} className="p-3 opacity-60">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleTask(task.id)}
                  className="mt-1 h-5 w-5 rounded border border-input bg-primary flex items-center justify-center"
                >
                  <CheckIcon className="h-3 w-3 text-primary-foreground" />
                </button>
                <div className="flex-1">
                  <p className="text-sm font-medium line-through">{task.content}</p>
                </div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No tasks yet. Add one to get started!</p>
        </div>
      )}
    </div>
  )
}
