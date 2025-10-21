import React, { useState, useRef, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import * as chrono from "chrono-node";
import { useOutletContext } from "react-router-dom";

function Chatbox({ chat }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { memories, setMemories } = useOutletContext();

  useEffect(() => {
    if (chat) {
      setMessages(chat.messages || []);
      setCurrentChatId(chat.id || null);
    }
  }, [chat]);

  // -------- SAVE TO HISTORY --------
  const saveToHistory = (msgs) => {
    let history = JSON.parse(localStorage.getItem("chatHistory")) || [];
    if (msgs.length === 1) {
      const chatId = currentChatId || (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
      setCurrentChatId(chatId);
      history.push({ id: chatId, title: msgs[0].content, messages: msgs });
    } else {
      const idx = history.findIndex((h) => h.id === currentChatId);
      if (idx >= 0) {
        history[idx].messages = msgs;
        if (!history[idx].title && msgs[0]) {
          history[idx].title = msgs[0].content;
        }
      } else {
        // fallback: append as new
        const chatId = currentChatId || (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
        setCurrentChatId(chatId);
        history.push({ id: chatId, title: msgs[0]?.content || "New chat", messages: msgs });
      }
    }
    localStorage.setItem("chatHistory", JSON.stringify(history));
  };

  // -------- NEW CHAT --------
  const startNewChat = () => {
    const newId = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
    setCurrentChatId(newId);
    setMessages([]);
  };

  // -------- ADD CALENDAR EVENT --------
  const addEventFromChat = (text) => {
    const results = chrono.parse(text);
    if (results.length > 0) {
      const date = results[0].start.date();
      const newEvent = {
        id: Date.now(),
        title: text,
        start: date,
        end: new Date(date.getTime() + 60 * 60 * 1000),
      };
      const saved = JSON.parse(localStorage.getItem("myEvents")) || [];
      saved.push(newEvent);
      localStorage.setItem("myEvents", JSON.stringify(saved));
    }
  };

  // -------- SEND TEXT MESSAGE --------
  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessage = { type: "text", sender: "user", content: input };
    const updated = [...messages, newMessage];
    setMessages(updated);
    setInput("");
    saveToHistory(updated);
    addEventFromChat(input);

    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_message: input, token, chat_id: currentChatId }),
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      const reply = data.reply || data.response || "⚠ No response from AI";

      setMessages((prev) => {
        const withAi = [...prev, { type: "text", sender: "ai", content: reply }];
        saveToHistory(withAi);

        // Extract memories from the conversation after AI responds
        setTimeout(() => {
          extractMemoriesFromConversation(withAi);
        }, 1000);

        return withAi;
      });
    } catch (err) {
      console.error("Backend error:", err);
      setMessages((prev) => [
        ...prev,
        { type: "text", sender: "ai", content: "⚠ Failed to reach backend" },
      ]);
    }
  };

  // -------- HANDLE FILE UPLOAD (Images, PDFs, Docs) --------
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileURL = URL.createObjectURL(file);
    const newMessage = { type: "image", sender: "user", content: fileURL };
    const updated = [...messages, newMessage];
    setMessages(updated);
    saveToHistory(updated);

    // Create FormData to send file + message
    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "prompt",
      JSON.stringify({
        sender: "user",
        text: "Please analyze this document or image and tell me what you see.",
      })
    );

    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/chat-with-upload/", {
        method: "POST",
        body: (() => { formData.append("token", token || ""); formData.append("chat_id", currentChatId || ""); return formData; })(),
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      const reply = data.response || "⚠ No analysis received";

      setMessages((prev) => {
        const withAi = [...prev, { type: "text", sender: "ai", content: reply }];
        saveToHistory(withAi);
        return withAi;
      });
    } catch (err) {
      console.error("Upload error:", err);
      setMessages((prev) => [
        ...prev,
        { type: "text", sender: "ai", content: "⚠ File upload failed" },
      ]);
    }
  };

  // -------- EXTRACT MEMORIES FROM CONVERSATION --------
  const extractMemoriesFromConversation = (conversationMessages) => {
    const allText = conversationMessages.map(msg => msg.content).join(' ').toLowerCase();
    const currentMemories = memories.map(m => m.content.toLowerCase());

    // Simple patterns to extract personal information
    const memoryPatterns = [
      { pattern: /my name is (\w+)/i, template: "User's name is $1" },
      { pattern: /i am (\w+)/i, template: "User identifies as $1" },
      { pattern: /i'm (\w+)/i, template: "User is $1" },
      { pattern: /my favorite (\w+) is (\w+)/i, template: "User's favorite $1 is $2" },
      { pattern: /i like (\w+)/i, template: "User likes $1" },
      { pattern: /i love (\w+)/i, template: "User loves $1" },
      { pattern: /i prefer (\w+)/i, template: "User prefers $1" },
      { pattern: /i work as (\w+)/i, template: "User works as $1" },
      { pattern: /i'm (\d+) years old/i, template: "User is $1 years old" },
      { pattern: /i live in (\w+)/i, template: "User lives in $1" },
      { pattern: /my birthday is (\w+)/i, template: "User's birthday is $1" },
      { pattern: /i was born in (\w+)/i, template: "User was born in $1" },
      { pattern: /my hobby is (\w+)/i, template: "User's hobby is $1" },
      { pattern: /i enjoy (\w+)/i, template: "User enjoys $1" },
      { pattern: /my favorite color is (\w+)/i, template: "User's favorite color is $1" },
      { pattern: /i'm from (\w+)/i, template: "User is from $1" },
      { pattern: /i speak (\w+)/i, template: "User speaks $1" },
      { pattern: /my native language is (\w+)/i, template: "User's native language is $1" },
      { pattern: /i have (\w+)/i, template: "User has $1" },
      { pattern: /my pet is (\w+)/i, template: "User's pet is $1" },
      { pattern: /i'm allergic to (\w+)/i, template: "User is allergic to $1" },
      { pattern: /my favorite food is (\w+)/i, template: "User's favorite food is $1" },
      { pattern: /i hate (\w+)/i, template: "User hates $1" },
      { pattern: /my dream is (\w+)/i, template: "User's dream is $1" },
      { pattern: /my goal is (\w+)/i, template: "User's goal is $1" },
      { pattern: /i'm learning (\w+)/i, template: "User is learning $1" },
      { pattern: /i'm studying (\w+)/i, template: "User is studying $1" },
      { pattern: /my favorite movie is (\w+)/i, template: "User's favorite movie is $1" },
      { pattern: /my favorite book is (\w+)/i, template: "User's favorite book is $1" },
      { pattern: /my favorite song is (\w+)/i, template: "User's favorite song is $1" },
      { pattern: /i play (\w+)/i, template: "User plays $1" },
      { pattern: /my favorite sport is (\w+)/i, template: "User's favorite sport is $1" },
      { pattern: /i support (\w+)/i, template: "User supports $1" },
      { pattern: /my favorite team is (\w+)/i, template: "User's favorite team is $1" },
      { pattern: /i'm married/i, template: "User is married" },
      { pattern: /i'm single/i, template: "User is single" },
      { pattern: /i have children/i, template: "User has children" },
      { pattern: /i have (\d+) kids/i, template: "User has $1 children" },
      { pattern: /my child is (\w+)/i, template: "User's child is $1" },
      { pattern: /i'm a parent/i, template: "User is a parent" },
      { pattern: /i'm a (\w+)/i, template: "User is a $1" },
      { pattern: /my company is (\w+)/i, template: "User's company is $1" },
      { pattern: /i work for (\w+)/i, template: "User works for $1" },
      { pattern: /my boss is (\w+)/i, template: "User's boss is $1" },
      { pattern: /i'm currently (\w+)/i, template: "User is currently $1" },
      { pattern: /i'm planning to (\w+)/i, template: "User is planning to $1" },
      { pattern: /i'm thinking about (\w+)/i, template: "User is thinking about $1" },
      { pattern: /i'm interested in (\w+)/i, template: "User is interested in $1" },
      { pattern: /i'm passionate about (\w+)/i, template: "User is passionate about $1" },
      { pattern: /my biggest fear is (\w+)/i, template: "User's biggest fear is $1" },
      { pattern: /i'm afraid of (\w+)/i, template: "User is afraid of $1" },
      { pattern: /my weakness is (\w+)/i, template: "User's weakness is $1" },
      { pattern: /my strength is (\w+)/i, template: "User's strength is $1" },
      { pattern: /i'm good at (\w+)/i, template: "User is good at $1" },
      { pattern: /i'm bad at (\w+)/i, template: "User is bad at $1" },
      { pattern: /i struggle with (\w+)/i, template: "User struggles with $1" },
      { pattern: /i'm confident in (\w+)/i, template: "User is confident in $1" },
    ];

    const newMemoriesFound = [];

    memoryPatterns.forEach(({ pattern, template }) => {
      const matches = allText.match(pattern);
      if (matches) {
        let memoryText = template;
        for (let i = 1; i < matches.length; i++) {
          memoryText = memoryText.replace(`$${i}`, matches[i]);
        }

        // Check if this memory already exists (case-insensitive)
        const memoryExists = currentMemories.some(existing =>
          existing.toLowerCase() === memoryText.toLowerCase()
        );

        if (!memoryExists) {
          newMemoriesFound.push(memoryText);
        }
      }
    });

    // Add new memories if any were found
    if (newMemoriesFound.length > 0) {
      const updatedMemories = [
        ...memories,
        ...newMemoriesFound.map(memory => ({ id: Date.now() + Math.random(), content: memory }))
      ];
      setMemories(updatedMemories);
      localStorage.setItem("sabaMemories", JSON.stringify(updatedMemories));
    }
  };

  // Example prompt buttons data
  const examplePrompts = [
    "Explain quantum computing in simple terms",
    "What are some healthy dinner recipes?",
    "Write a short story about a robot who dreams",
    "Plan a 3-day trip to Kyoto"
  ];

  const handleExampleClick = (prompt) => {
    setInput(prompt);
  };

  return (
    <div className="d-flex flex-column" style={{ height: "100vh", backgroundColor: "#0f0f0f" }}>
      {/* SABA Header */}
      <div style={{
        backgroundColor: "#1a1a1a",
        padding: "20px 40px",
        borderBottom: "1px solid #333",
        textAlign: "center"
      }}>
        <div className="d-flex align-items-center justify-content-center mb-3">
          <div style={{
            width: "48px",
            height: "48px",
            backgroundColor: "#8B5CF6",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "16px",
            fontSize: "24px",
            fontWeight: "bold",
            color: "white"
          }}>
            S
          </div>
          <h1 style={{ margin: 0, color: "white", fontSize: "32px", fontWeight: "700" }}>SABA</h1>
        </div>
        <p style={{ color: "#9CA3AF", fontSize: "16px", margin: 0 }}>
          Start a conversation with your personal AI assistant. It learns, adapts, and helps you with your tasks.
        </p>
      </div>

      {/* Chat Messages */}
      <div className="flex-grow-1 p-4 overflow-auto" style={{ backgroundColor: "#0f0f0f" }}>
        {messages.length === 0 ? (
          <div>
            {/* Example Prompt Buttons */}
            <div className="mb-5">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", maxWidth: "800px", margin: "0 auto" }}>
                {examplePrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(prompt)}
                    style={{
                      backgroundColor: "#374151",
                      border: "1px solid #4B5563",
                      borderRadius: "8px",
                      padding: "16px",
                      color: "white",
                      fontSize: "14px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = "#4B5563";
                      e.target.style.borderColor = "#8B5CF6";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = "#374151";
                      e.target.style.borderColor = "#4B5563";
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Welcome Message */}
            <div className="d-flex justify-content-center align-items-center" style={{ height: "200px" }}>
              <div style={{ textAlign: "center", color: "#9CA3AF" }}>
                <h4 style={{ fontSize: "18px", marginBottom: "8px" }}>👋 Welcome to SABA!</h4>
                <p style={{ fontSize: "14px" }}>Choose an example above or type your own message to get started.</p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`d-flex mb-4 ${
                  msg.sender === "user" ? "justify-content-end" : "justify-content-start"
                }`}
              >
                {msg.type === "text" && (
                  <div
                    className={`p-3 rounded-3 ${
                      msg.sender === "user" ? "bg-primary text-white" : "bg-white shadow-sm"
                    }`}
                    style={{
                      maxWidth: "70%",
                      backgroundColor: msg.sender === "user" ? "#8B5CF6" : "#374151",
                      color: msg.sender === "user" ? "white" : "#E5E7EB",
                      border: msg.sender === "ai" ? "1px solid #4B5563" : "none"
                    }}
                  >
                    {msg.content}
                  </div>
                )}

                {msg.type === "audio" && <audio controls src={msg.content}></audio>}

                {msg.type === "image" && (
                  <img
                    src={msg.content}
                    alt="sent"
                    className="rounded shadow-sm"
                    style={{ maxWidth: "200px" }}
                  />
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="d-flex justify-content-start mb-4">
                <div style={{
                  backgroundColor: "#374151",
                  color: "#E5E7EB",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid #4B5563"
                }}>
                  <div className="d-flex align-items-center">
                    <div className="spinner-border spinner-border-sm me-2" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    SABA is thinking...
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{
        backgroundColor: "#1a1a1a",
        padding: "24px 40px",
        borderTop: "1px solid #333"
      }}>
        <div className="d-flex align-items-center" style={{ maxWidth: "800px", margin: "0 auto" }}>
          {/* User Avatar */}
          <div style={{
            width: "40px",
            height: "40px",
            backgroundColor: "#10B981",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "12px",
            fontSize: "16px",
            fontWeight: "bold",
            color: "white"
          }}>
            U
          </div>

          {/* Text Input */}
          <input
            type="text"
            className="form-control me-3 flex-grow-1"
            style={{
              backgroundColor: "#374151",
              border: "1px solid #4B5563",
              borderRadius: "8px",
              padding: "12px 16px",
              color: "white",
              fontSize: "14px",
              outline: "none"
            }}
            placeholder="Type your message here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />

          {/* Send Button */}
          <button
            className="btn d-flex align-items-center"
            onClick={sendMessage}
            style={{
              backgroundColor: "#8B5CF6",
              border: "none",
              borderRadius: "8px",
              padding: "12px 20px",
              color: "white",
              fontSize: "14px",
              fontWeight: "500"
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chatbox;
