"use client";

import * as React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getAiResponse, summarizeConversation, getMessages } from './actions';
import type { Conversation, Message, Task, Memory } from '@/lib/types';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ChatHistorySidebar } from '@/components/chat/chat-history-sidebar';
import { ChatPanel } from '@/components/chat/chat-panel';
import { MemoryEditorPanel } from '@/components/chat/memory-editor-panel';
import { useToast } from '@/hooks/use-toast';

const mockTasks: Task[] = [
    { id: '1', type: 'Reminder', content: 'Call mom', time: '2024-08-15T14:00:00' },
    { id: '2', type: 'Task', content: 'Finish project report' },
    { id: '3', type: 'Alarm', content: 'Wake up', time: '2024-08-15T07:00:00' },
];

const mockMemories: Memory[] = [
  { id: '1', content: "User's birthday is October 26th." },
  { id: '2', content: "Favorite color is Teal (#008080)." },
  { id: '3', content: 'Prefers communication to be formal and concise.' },
];

export default function Home() {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [tasks, setTasks] = React.useState<Task[]>(mockTasks);
  const [memories, setMemories] = React.useState<Memory[]>(mockMemories);
  const [isClient, setIsClient] = React.useState(false);
  const { toast } = useToast();
  const activeConversationRef = React.useRef(activeConversationId);

  React.useEffect(() => {
    setIsClient(true);
    try {
      const storedConversations = localStorage.getItem('personal-ai-proto-chats');
      if (storedConversations) {
        const parsedConvos = JSON.parse(storedConversations) as Conversation[];
        setConversations(parsedConvos.map(c => ({...c, createdAt: new Date(c.createdAt), messages: [] })));
      }
      const storedTasks = localStorage.getItem('personal-ai-proto-tasks');
      if (storedTasks) {
          setTasks(JSON.parse(storedTasks));
      }
      const storedMemories = localStorage.getItem('personal-ai-proto-memories');
        if (storedMemories) {
            setMemories(JSON.parse(storedMemories));
      }

    } catch (error) {
      console.error("Failed to load data from localStorage", error);
    }
  }, []);

  React.useEffect(() => {
    if (isClient) {
      try {
        if (conversations.length > 0) {
          const conversationsToStore = conversations.map(({ messages, ...convo }) => convo);
          localStorage.setItem('personal-ai-proto-chats', JSON.stringify(conversationsToStore));
        }
        localStorage.setItem('personal-ai-proto-tasks', JSON.stringify(tasks));
        if (memories.length > 0) {
            localStorage.setItem('personal-ai-proto-memories', JSON.stringify(memories));
        }
      } catch (error) {
        console.error("Failed to save data to localStorage", error);
      }
    }
  }, [conversations, tasks, memories, isClient]);
  
  React.useEffect(() => {
    activeConversationRef.current = activeConversationId;
    if (activeConversationId) {
      const fetchMessages = async () => {
        const messages = await getMessages(activeConversationId);
        setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, messages } : c));
      };
      fetchMessages();
    }
  }, [activeConversationId]);

  const activeConversation = React.useMemo(() => {
    return conversations.find(c => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);
  
  const handleAddMemory = async (content: string) => {
    if (content.trim() === '') return;
    const newMemory: Memory = { id: uuidv4(), content };
    setMemories(prev => [newMemory, ...prev]);
  };

  const createMemoryFromConversation = async (conversation: Conversation) => {
    if (conversation.messages.length <= 2) return;

    const summary = await summarizeConversation(conversation.messages);
    if (summary && summary.trim() !== '' && summary.toLowerCase() !== 'null') {
      await handleAddMemory(summary);
      toast({
        title: "Memory Saved",
        description: "SABA has learned something new from your conversation.",
      });
    }
  };

  const handleSelectConversation = async (id: string) => {
    const previousConversationId = activeConversationRef.current;
    if (previousConversationId && previousConversationId !== id) {
      const previousConversation = conversations.find(c => c.id === previousConversationId);
      if (previousConversation) {
        await createMemoryFromConversation(previousConversation);
      }
    }
    setActiveConversationId(id);
  };

  const handleNewConversation = async () => {
     const previousConversationId = activeConversationRef.current;
    if (previousConversationId) {
      const previousConversation = conversations.find(c => c.id === previousConversationId);
      if (previousConversation) {
        await createMemoryFromConversation(previousConversation);
      }
    }
    setActiveConversationId(null);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  };

  const handleAddTask = (task: Omit<Task, 'id'>) => {
    const newTask = { ...task, id: uuidv4() };
    setTasks(prev => [newTask, ...prev]);
  };
  
  const handleDeleteTask = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };
  
  const handleDeleteMemory = (id: string) => {
    setMemories(prev => prev.filter(mem => mem.id !== id));
  };

  const handleSendMessage = async (userInput: string) => {
    let currentConvoId = activeConversationId;
    
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: userInput,
      createdAt: new Date(),
    };

    if (!currentConvoId) {
      const newConversation: Conversation = {
        id: uuidv4(),
        title: userInput.substring(0, 30) + (userInput.length > 30 ? '...' : ''),
        createdAt: new Date(),
        messages: [userMessage],
      };
      currentConvoId = newConversation.id;
      setConversations(prev => [newConversation, ...prev]);
      setActiveConversationId(newConversation.id);
    } else {
       setConversations(prev => prev.map(c => 
        c.id === currentConvoId ? { ...c, messages: [...c.messages, userMessage] } : c
      ));
    }

    const assistantMessageId = uuidv4();
    const loadingMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isProcessing: true,
      createdAt: new Date(),
    };

    setConversations(prev => prev.map(c => 
      c.id === currentConvoId ? { ...c, messages: [...c.messages, loadingMessage] } : c
    ));

    const { response, intent, entities, task } = await getAiResponse(userInput, currentConvoId);
    
    if (task) {
        handleAddTask(task);
        toast({
            title: "Task Added",
            description: `Your ${task.type.toLowerCase()} has been added.`,
        });
    }
    
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: response,
      intent,
      entities,
      isProcessing: false,
      createdAt: new Date(),
    };

    setConversations(prev => prev.map(c => {
      if (c.id === currentConvoId) {
        const updatedMessages = c.messages.map(m => m.id === assistantMessageId ? assistantMessage : m);
        return { ...c, messages: updatedMessages };
      }
      return c;
    }));
  };

  if (!isClient) {
    return null;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full bg-background text-foreground font-body">
        <ChatHistorySidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          tasks={tasks}
          onAddTask={handleAddTask}
          onDeleteTask={handleDeleteTask}
        />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <ChatPanel
            conversation={activeConversation}
            onSendMessage={handleSendMessage}
          />
        </main>
        <MemoryEditorPanel 
            memories={memories}
            onAddMemory={handleAddMemory}
            onDeleteMemory={handleDeleteMemory}
        />
      </div>
    </SidebarProvider>
  );
}