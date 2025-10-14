'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import type { Task } from '@/lib/types';


interface TaskManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tasks: Task[];
    onAddTask: (task: Omit<Task, 'id'>) => void;
    onDeleteTask: (id: string) => void;
}

export function TaskManager({ open, onOpenChange, tasks, onAddTask, onDeleteTask }: TaskManagerProps) {
  const [newTaskContent, setNewTaskContent] = React.useState('');
  const [newTaskTime, setNewTaskTime] = React.useState('');
  const [newTaskType, setNewTaskType] = React.useState<'Task' | 'Alarm' | 'Reminder'>('Task');
  
  const handleAddTask = () => {
    if (newTaskContent.trim() === '') return;

    const taskToAdd: Omit<Task, 'id'> = {
      type: newTaskType,
      content: newTaskContent,
      time: newTaskTime ? new Date(newTaskTime).toISOString() : undefined,
      completed: false,
      createdAt: new Date(),
      userId: 'default_user',
      conversationId: 'default_conversation',
      priority: 'medium',
      tags: [],
    };

    onAddTask(taskToAdd);
    
    setNewTaskContent('');
    setNewTaskTime('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] md:max-w-[600px] flex flex-col h-[70vh]">
        <DialogHeader>
          <DialogTitle>Task Manager</DialogTitle>
          <DialogDescription>
            Manage your tasks, alarms, and reminders.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 flex flex-col gap-4 py-4 overflow-hidden">
            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="task-content">Task / Reminder / Alarm</Label>
                    <Input
                        id="task-content"
                        value={newTaskContent}
                        onChange={(e) => setNewTaskContent(e.target.value)}
                        placeholder="Add a new task..."
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="task-datetime">Date & Time</Label>
                        <Input
                            id="task-datetime"
                            type="datetime-local"
                            value={newTaskTime}
                            onChange={(e) => setNewTaskTime(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="task-type">Type</Label>
                        <Select value={newTaskType} onValueChange={(value: any) => setNewTaskType(value)}>
                            <SelectTrigger id="task-type">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Task">Task</SelectItem>
                                <SelectItem value="Reminder">Reminder</SelectItem>
                                <SelectItem value="Alarm">Alarm</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                 <Button onClick={handleAddTask} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                </Button>
            </div>
            <ScrollArea className="flex-1 pr-4 -mr-4 mt-4 border-t pt-4">
            <div className="space-y-2">
                {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-3 border rounded-lg bg-card/50">
                    <div className='flex-1'>
                        <p className="text-sm font-medium">{task.content}</p>
                        <div className='flex items-center gap-2 mt-1.5'>
                           <Badge variant={
                               task.type === 'Alarm' ? 'destructive' : task.type === 'Reminder' ? 'secondary' : 'default'
                           }>{task.type}</Badge>
                           {task.time && <p className="text-xs text-muted-foreground">{new Date(task.time).toLocaleString()}</p>}
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => onDeleteTask(task.id)} className="shrink-0">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>
                ))}
            </div>
            </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
