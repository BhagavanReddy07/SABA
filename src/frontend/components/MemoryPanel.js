import React, { useState } from "react";
import { FaPlus, FaEdit, FaTrash, FaSave } from "react-icons/fa";

export default function MemoryPanel({ memories, setMemories }) {
  const [newMemory, setNewMemory] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState("");

  const handleAddMemory = () => {
    if (newMemory.trim()) {
      const memory = {
        id: Date.now(),
        content: newMemory.trim()
      };
      const updatedMemories = [...memories, memory];
      setMemories(updatedMemories);
      localStorage.setItem("sabaMemories", JSON.stringify(updatedMemories));
      setNewMemory("");
    }
  };

  const handleEditMemory = (id, content) => {
    setEditingId(id);
    setEditingContent(content);
  };

  const handleSaveEdit = () => {
    if (editingContent.trim()) {
      const updatedMemories = memories.map(memory =>
        memory.id === editingId
          ? { ...memory, content: editingContent.trim() }
          : memory
      );
      setMemories(updatedMemories);
      localStorage.setItem("sabaMemories", JSON.stringify(updatedMemories));
      setEditingId(null);
      setEditingContent("");
    }
  };

  const handleDeleteMemory = (id) => {
    const updatedMemories = memories.filter(memory => memory.id !== id);
    setMemories(updatedMemories);
    localStorage.setItem("sabaMemories", JSON.stringify(updatedMemories));
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleAddMemory();
    }
  };

  return (
    <div style={{ padding: "20px", height: "100vh", overflowY: "auto" }}>
      {/* Header */}
      <div className="d-flex align-items-center mb-4">
        <div style={{
          width: "32px",
          height: "32px",
          backgroundColor: "#8B5CF6",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: "10px",
          fontSize: "16px",
          fontWeight: "bold",
          color: "white"
        }}>
          S
        </div>
        <div>
          <h6 style={{ margin: 0, color: "white", fontSize: "16px", fontWeight: "600" }}>
            Memory
          </h6>
          <p style={{ margin: 0, color: "#9CA3AF", fontSize: "12px" }}>
            Manage SABA's memories.
          </p>
        </div>
      </div>

      {/* Add New Memory */}
      <div className="mb-4">
        <div style={{
          position: "relative",
          marginBottom: "8px"
        }}>
          <input
            type="text"
            value={newMemory}
            onChange={(e) => setNewMemory(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add a new memory"
            style={{
              width: "100%",
              padding: "10px 40px 10px 12px",
              backgroundColor: "#374151",
              border: "1px solid #4B5563",
              borderRadius: "6px",
              color: "white",
              fontSize: "13px",
              outline: "none"
            }}
          />
          <button
            onClick={handleAddMemory}
            style={{
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              backgroundColor: "#8B5CF6",
              border: "none",
              borderRadius: "4px",
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              cursor: "pointer"
            }}
          >
            <FaPlus size={12} />
          </button>
        </div>
        <div style={{ color: "#9CA3AF", fontSize: "11px" }}>
          e.g., My favorite food is pizza
        </div>
      </div>

      {/* Memories List */}
      <div>
        {memories.map((memory) => (
          <div key={memory.id} style={{
            backgroundColor: "#374151",
            borderRadius: "6px",
            padding: "12px",
            marginBottom: "8px",
            border: "1px solid #4B5563"
          }}>
            {editingId === memory.id ? (
              <div>
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: "60px",
                    backgroundColor: "#1F2937",
                    border: "1px solid #4B5563",
                    borderRadius: "4px",
                    color: "white",
                    padding: "8px",
                    fontSize: "13px",
                    resize: "vertical",
                    outline: "none"
                  }}
                />
                <div style={{ marginTop: "8px", display: "flex", gap: "4px" }}>
                  <button
                    onClick={handleSaveEdit}
                    style={{
                      backgroundColor: "#10B981",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      color: "white",
                      fontSize: "11px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <FaSave size={10} />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    style={{
                      backgroundColor: "#6B7280",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      color: "white",
                      fontSize: "11px",
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ color: "white", fontSize: "13px", lineHeight: "1.4", marginBottom: "8px" }}>
                  {memory.content}
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    onClick={() => handleEditMemory(memory.id, memory.content)}
                    style={{
                      backgroundColor: "transparent",
                      border: "none",
                      color: "#9CA3AF",
                      cursor: "pointer",
                      padding: "2px",
                      borderRadius: "2px"
                    }}
                    title="Edit"
                  >
                    <FaEdit size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteMemory(memory.id)}
                    style={{
                      backgroundColor: "transparent",
                      border: "none",
                      color: "#EF4444",
                      cursor: "pointer",
                      padding: "2px",
                      borderRadius: "2px"
                    }}
                    title="Delete"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
