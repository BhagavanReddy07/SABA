'use client';

import * as React from 'react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarMenuAction,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MessageSquare,
  Plus,
  BrainCircuit,
  Trash2,
  ListTodo,
  LogOut,
  User,
} from 'lucide-react';
import type { Conversation, Task, User as UserType } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TaskManager } from './task-manager';

interface ChatHistorySidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  tasks: Task[];
  onAddTask: (task: Omit<Task, 'id'>) => void;
  onDeleteTask: (id: string) => void;
  currentUser?: UserType | null;
  onLogout?: () => void;
}

export function ChatHistorySidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  tasks,
  onAddTask,
  onDeleteTask,
  currentUser,
  onLogout,
}: ChatHistorySidebarProps) {
  const [isTaskManagerOpen, setIsTaskManagerOpen] = React.useState(false);

  return (
    <>
      <Sidebar
        className="border-r border-border/10"
        collapsible="icon"
        variant="sidebar"
      >
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <BrainCircuit className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              SABA
            </h1>
          </div>
          <Separator className="bg-sidebar-border/50" />
          <div className='flex flex-col gap-1 p-2'>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:aspect-square"
              onClick={onNewConversation}
            >
              <Plus className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">New Chat</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:aspect-square"
              onClick={() => setIsTaskManagerOpen(true)}
            >
              <ListTodo className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Tasks</span>
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarMenu>
            {conversations.map(convo => (
              <SidebarMenuItem key={convo.id}>
                <SidebarMenuButton
                  onClick={() => onSelectConversation(convo.id)}
                  isActive={activeConversationId === convo.id}
                  className="truncate"
                  tooltip={{ children: convo.title, side: 'right' }}
                >
                  <MessageSquare />
                  <span className="truncate">{convo.title}</span>
                </SidebarMenuButton>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <Trash2 />
                    </SidebarMenuAction>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete this conversation.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDeleteConversation(convo.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <Separator className="mb-2 bg-sidebar-border/50" />
          <div className="p-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="h-9 w-9">
                <AvatarFallback>
                  {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium text-sidebar-foreground">
                  {currentUser?.name || 'User'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {currentUser?.email || 'user@email.com'}
                </span>
              </div>
            </div>
            {onLogout && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 group-data-[collapsible=icon]:hidden"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign Out?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You will need to sign in again to access your conversations and data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Sign Out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>
      <TaskManager 
        open={isTaskManagerOpen} 
        onOpenChange={setIsTaskManagerOpen}
        tasks={tasks}
        onAddTask={onAddTask}
        onDeleteTask={onDeleteTask}
      />
    </>
  );
}
