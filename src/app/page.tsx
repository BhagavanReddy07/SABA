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
import { LoginForm } from '@/components/auth/login-form';
import type { User } from '@/lib/types';


const mockTasks: Task[] = [
    {
        id: '1',
        type: 'Reminder',
        content: 'Call mom',
        time: '2024-08-15T14:00:00',
        completed: false,
        createdAt: new Date(),
        userId: 'default_user',
        conversationId: 'default_conversation',
        priority: 'medium'
    },
    {
        id: '2',
        type: 'Task',
        content: 'Finish project report',
        completed: false,
        createdAt: new Date(),
        userId: 'default_user',
        conversationId: 'default_conversation',
        priority: 'high'
    },
    {
        id: '3',
        type: 'Alarm',
        content: 'Wake up',
        time: '2024-08-15T07:00:00',
        completed: false,
        createdAt: new Date(),
        userId: 'default_user',
        conversationId: 'default_conversation',
        priority: 'high'
    },
];

const mockMemories: Memory[] = [
  {
      id: '1',
      content: "User's birthday is October 26th.",
      userId: 'default_user',
      type: 'personal',
      importance: 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
  },
  {
      id: '2',
      content: "Favorite color is Teal (#008080).",
      userId: 'default_user',
      type: 'preference',
      importance: 'low',
      createdAt: new Date(),
      updatedAt: new Date()
  },
  {
      id: '3',
      content: 'Prefers communication to be formal and concise.',
      userId: 'default_user',
      type: 'preference',
      importance: 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
  },
];

export default function Home() {
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [tasks, setTasks] = React.useState<Task[]>(mockTasks);
  const [memories, setMemories] = React.useState<Memory[]>(mockMemories);
  const [isClient, setIsClient] = React.useState(false);
  const { toast } = useToast();
  const activeConversationRef = React.useRef(activeConversationId);

  React.useEffect(() => {
    setIsClient(true);

    // Check for existing user session
    const storedUser = localStorage.getItem('saba_user');
    const storedSession = localStorage.getItem('saba_session');

    if (storedUser && storedSession) {
      try {
        const user = JSON.parse(storedUser);
        const session = JSON.parse(storedSession);

        // Check if session is still valid
        if (new Date(session.expiresAt) > new Date()) {
          setCurrentUser(user);

          // Load user's data
          const userId = user.id;
          loadUserData(userId);
        } else {
          // Session expired, clear storage
          localStorage.removeItem('saba_user');
          localStorage.removeItem('saba_session');
        }
      } catch (error) {
        console.error('Error parsing stored user data:', error);
        localStorage.removeItem('saba_user');
        localStorage.removeItem('saba_session');
      }
    }
  }, []);

  const loadUserData = async (userId: string) => {
    try {
      // Load user's conversations, tasks, and memories
      const storedConversations = localStorage.getItem(`personal-ai-proto-chats-${userId}`);
      if (storedConversations) {
        const parsedConvos = JSON.parse(storedConversations) as Conversation[];
        // Load conversations first with empty messages
        const conversationsWithEmptyMessages = parsedConvos.map(c => ({...c, createdAt: new Date(c.createdAt), messages: [] }));
        setConversations(conversationsWithEmptyMessages);

        // Load messages for all conversations in the background
        const conversationsWithMessages = await Promise.all(
          parsedConvos.map(async (c) => {
            try {
              const messages = await getMessages(c.id);
              return { ...c, createdAt: new Date(c.createdAt), messages };
            } catch (error) {
              console.error(`Failed to load messages for conversation ${c.id}:`, error);
              return { ...c, createdAt: new Date(c.createdAt), messages: [] };
            }
          })
        );
        setConversations(conversationsWithMessages);
      }

      const storedTasks = localStorage.getItem(`personal-ai-proto-tasks-${userId}`);
      if (storedTasks) {
        setTasks(JSON.parse(storedTasks));
      }

      const storedMemories = localStorage.getItem(`personal-ai-proto-memories-${userId}`);
      if (storedMemories) {
        setMemories(JSON.parse(storedMemories));
      }
    } catch (error) {
      console.error("Failed to load user data from localStorage", error);
    }
  };

  React.useEffect(() => {
    if (isClient && currentUser) {
      try {
        const userId = currentUser.id;

        if (conversations.length > 0) {
          const conversationsToStore = conversations.map(({ messages, ...convo }) => convo);
          localStorage.setItem(`personal-ai-proto-chats-${userId}`, JSON.stringify(conversationsToStore));
        }
        localStorage.setItem(`personal-ai-proto-tasks-${userId}`, JSON.stringify(tasks));
        if (memories.length > 0) {
            localStorage.setItem(`personal-ai-proto-memories-${userId}`, JSON.stringify(memories));
        }
      } catch (error) {
        console.error("Failed to save data to localStorage", error);
      }
    }
  }, [conversations, tasks, memories, isClient, currentUser]);
  
  React.useEffect(() => {
    activeConversationRef.current = activeConversationId;
    if (activeConversationId) {
      const conversationToLoad = conversations.find(c => c.id === activeConversationId);
      // Only fetch messages if the conversation exists and its messages haven't been loaded yet
      if (conversationToLoad && conversationToLoad.messages.length === 0) {
        const fetchMessages = async () => {
          const messages = await getMessages(activeConversationId);
          setConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, messages } : c));
        };
        fetchMessages();
      }
    }
  }, [activeConversationId, conversations]); // Add conversations to dependency array

  const activeConversation = React.useMemo(() => {
    return conversations.find(c => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);
  
  const handleAddMemory = async (content: string) => {
    if (content.trim() === '' || !currentUser) return;
    const newMemory: Memory = {
      id: uuidv4(),
      content,
      userId: currentUser.id,
      type: 'fact',
      importance: 'medium',
      createdAt: new Date(),
      updatedAt: new Date()
    };
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

  const handleLogout = () => {
    // Clear all user data
    setCurrentUser(null);
    setConversations([]);
    setActiveConversationId(null);
    setTasks([]);
    setMemories([]);

    // Clear localStorage
    localStorage.removeItem('saba_user');
    localStorage.removeItem('saba_session');

    toast({
      title: 'Logged Out',
      description: 'You have been successfully logged out.',
    });
  };

  const handleSendMessage = async (userInput: string) => {
    // Use active conversation ID or create a new one
    const currentConvoId = activeConversationId || uuidv4();
    const userId = currentUser?.id || 'default_user'; // Use actual user ID from authentication

    // Create user message for UI
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: userInput,
      createdAt: new Date(),
      userId: userId,
      conversationId: currentConvoId,
    };

    // Create or update conversation in UI
    if (!activeConversationId) {
      const newConversation: Conversation = {
        id: currentConvoId,
        title: userInput.substring(0, 30) + (userInput.length > 30 ? '...' : ''),
        createdAt: new Date(),
        messages: [userMessage],
        userId: userId,
        isActive: true,
      };
      setConversations(prev => [newConversation, ...prev]);
      setActiveConversationId(newConversation.id);
    } else {
       setConversations(prev => prev.map(c =>
        c.id === currentConvoId ? { ...c, messages: [...c.messages, userMessage] } : c
      ));
    }

    // Show loading state
    const assistantMessageId = uuidv4();
    const loadingMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isProcessing: true,
      createdAt: new Date(),
      userId: userId,
      conversationId: currentConvoId,
    };

    setConversations(prev => prev.map(c =>
      c.id === currentConvoId ? { ...c, messages: [...c.messages, loadingMessage] } : c
    ));

    try {
      // Use the API route for AI processing with conversation context
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userInput,
          conversationId: currentConvoId, // Pass the conversation ID for context retention
          userId: userId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const result = await response.json();

      // Handle task creation if needed
      if (result.task) {
        handleAddTask(result.task);
        toast({
            title: "Task Added",
            description: `Your ${result.task.type.toLowerCase()} has been added.`,
        });
      }

      // Create assistant message for UI
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: result.response,
        intent: result.intent,
        entities: result.entities,
        isProcessing: false,
        createdAt: new Date(),
        userId: userId,
        conversationId: currentConvoId,
      };

      // Update conversation with AI response
      setConversations(prev => prev.map(c => {
        if (c.id === currentConvoId) {
          const updatedMessages = c.messages.map(m => m.id === assistantMessageId ? assistantMessage : m);
          return { ...c, messages: updatedMessages };
        }
        return c;
      }));

    } catch (error) {
      console.error('Error processing message:', error);

      // Show error message
      const errorMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your message. Please try again.',
        intent: 'Error',
        entities: [],
        isProcessing: false,
        createdAt: new Date(),
        userId: userId,
        conversationId: currentConvoId,
      };

      setConversations(prev => prev.map(c => {
        if (c.id === currentConvoId) {
          const updatedMessages = c.messages.map(m => m.id === assistantMessageId ? errorMessage : m);
          return { ...c, messages: updatedMessages };
        }
        return c;
      }));
    }
  };

  // Show login form if no user is authenticated
  if (!currentUser) {
    return <LoginForm onLogin={setCurrentUser} />;
  }

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
          currentUser={currentUser}
          onLogout={handleLogout}
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
