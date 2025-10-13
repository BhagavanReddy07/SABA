import redisClient from './redis';
import { v4 as uuidv4 } from 'uuid';

export interface Task {
  id: string;
  type: 'Task' | 'Reminder' | 'Alarm';
  content: string;
  time?: string;
  completed: boolean;
  createdAt: Date;
  completedAt?: Date;
  userId: string;
  conversationId: string;
  priority: 'low' | 'medium' | 'high';
  tags?: string[];
}

export interface TaskFilter {
  userId?: string;
  completed?: boolean;
  type?: 'Task' | 'Reminder' | 'Alarm';
  tags?: string[];
}

export class TaskManager {
  private static instance: TaskManager;

  static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'completed'>): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      ...taskData,
      createdAt: new Date(),
      completed: false,
    };

    try {
      // Save task
      const taskKey = `task:${task.id}`;
      await redisClient.setEx(taskKey, 30 * 24 * 60 * 60, JSON.stringify(task)); // 30 days

      // Add to user's task list
      const userTasksKey = `user:tasks:${task.userId}`;
      await redisClient.lPush(userTasksKey, task.id);
      await redisClient.expire(userTasksKey, 30 * 24 * 60 * 60);

      // Add to type-specific list
      const typeTasksKey = `tasks:${task.type.toLowerCase()}:${task.userId}`;
      await redisClient.lPush(typeTasksKey, task.id);
      await redisClient.expire(typeTasksKey, 30 * 24 * 60 * 60);

      // Add tags if present
      if (task.tags && task.tags.length > 0) {
        for (const tag of task.tags) {
          const tagKey = `tasks:tag:${tag}:${task.userId}`;
          await redisClient.lPush(tagKey, task.id);
          await redisClient.expire(tagKey, 30 * 24 * 60 * 60);
        }
      }

      console.log('Task created successfully:', task);
      return task;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  async getTask(taskId: string): Promise<Task | null> {
    try {
      const taskKey = `task:${taskId}`;
      const taskData = await redisClient.get(taskKey);

      if (taskData) {
        return JSON.parse(taskData);
      }
      return null;
    } catch (error) {
      console.error('Error getting task:', error);
      return null;
    }
  }

  async getTasks(filter: TaskFilter = {}): Promise<Task[]> {
    try {
      let taskIds: string[] = [];

      if (filter.userId) {
        const userTasksKey = `user:tasks:${filter.userId}`;
        taskIds = await redisClient.lRange(userTasksKey, 0, -1);
      }

      if (taskIds.length === 0) {
        return [];
      }

      const tasks: Task[] = [];
      for (const taskId of taskIds) {
        const task = await this.getTask(taskId);
        if (task) {
          // Apply filters
          if (filter.completed !== undefined && task.completed !== filter.completed) {
            continue;
          }
          if (filter.type && task.type !== filter.type) {
            continue;
          }
          if (filter.tags && filter.tags.length > 0) {
            const hasMatchingTag = filter.tags.some(tag =>
              task.tags?.includes(tag)
            );
            if (!hasMatchingTag) {
              continue;
            }
          }
          tasks.push(task);
        }
      }

      // Sort by creation date (newest first)
      return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      console.error('Error getting tasks:', error);
      return [];
    }
  }

  async updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'userId' | 'conversationId'>>): Promise<Task | null> {
    try {
      const existingTask = await this.getTask(taskId);
      if (!existingTask) {
        return null;
      }

      const updatedTask: Task = {
        ...existingTask,
        ...updates,
        completedAt: updates.completed && !existingTask.completed ? new Date() : existingTask.completedAt,
      };

      const taskKey = `task:${taskId}`;
      await redisClient.setEx(taskKey, 30 * 24 * 60 * 60, JSON.stringify(updatedTask));

      return updatedTask;
    } catch (error) {
      console.error('Error updating task:', error);
      return null;
    }
  }

  async deleteTask(taskId: string): Promise<boolean> {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        return false;
      }

      // Remove from all lists
      const taskKey = `task:${taskId}`;
      await redisClient.del(taskKey);

      const userTasksKey = `user:tasks:${task.userId}`;
      await redisClient.lRem(userTasksKey, 0, taskId);

      const typeTasksKey = `tasks:${task.type.toLowerCase()}:${task.userId}`;
      await redisClient.lRem(typeTasksKey, 0, taskId);

      if (task.tags) {
        for (const tag of task.tags) {
          const tagKey = `tasks:tag:${tag}:${task.userId}`;
          await redisClient.lRem(tagKey, 0, taskId);
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting task:', error);
      return false;
    }
  }

  async getUpcomingReminders(userId: string, limit: number = 10): Promise<Task[]> {
    try {
      const reminders = await this.getTasks({
        userId,
        type: 'Reminder',
        completed: false
      });

      // Filter reminders that have a time set and are in the future
      const now = new Date();
      return reminders
        .filter(task => task.time && new Date(task.time) > now)
        .sort((a, b) => new Date(a.time!).getTime() - new Date(b.time!).getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting upcoming reminders:', error);
      return [];
    }
  }

  async markTaskCompleted(taskId: string): Promise<Task | null> {
    return this.updateTask(taskId, { completed: true });
  }

  async markTaskIncomplete(taskId: string): Promise<Task | null> {
    return this.updateTask(taskId, { completed: false, completedAt: undefined });
  }

  async getTaskStats(userId: string): Promise<{
    total: number;
    completed: number;
    pending: number;
    byType: Record<string, number>;
  }> {
    try {
      const allTasks = await this.getTasks({ userId });

      const stats = {
        total: allTasks.length,
        completed: allTasks.filter(t => t.completed).length,
        pending: allTasks.filter(t => !t.completed).length,
        byType: {} as Record<string, number>
      };

      // Count by type
      allTasks.forEach(task => {
        stats.byType[task.type] = (stats.byType[task.type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Error getting task stats:', error);
      return { total: 0, completed: 0, pending: 0, byType: {} };
    }
  }
}

export const taskManager = TaskManager.getInstance();
