import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import MemoryPanel from "./MemoryPanel";

export default function Layout({ onContinueChat }) {
  const location = useLocation();
  const [memories, setMemories] = useState([]);

  useEffect(() => {
    // Load memories from localStorage
    const savedMemories = JSON.parse(localStorage.getItem("sabaMemories")) || [
      { id: 1, content: "User's birthday is October 26th." },
      { id: 2, content: "Favorite color is Teal (#008080)." },
      { id: 3, content: "Prefers communication to be formal and concise." }
    ];
    setMemories(savedMemories);
  }, []);

  // Don't show memory panel on certain pages
  const showMemoryPanel = location.pathname === "/chat";

  return (
    <div className="d-flex" style={{ height: "100vh" }}>
      {/* Left Sidebar */}
      <div style={{
        width: showMemoryPanel ? "20%" : "25%",
        minHeight: "100vh",
        backgroundColor: "#1a1a1a"
      }}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <div style={{
        width: showMemoryPanel ? "60%" : "75%",
        minHeight: "100vh",
        backgroundColor: "#0f0f0f"
      }}>
        <Outlet context={{ onContinueChat, memories, setMemories }} />
      </div>

      {/* Right Memory Panel - Only show on chat page */}
      {showMemoryPanel && (
        <div style={{
          width: "20%",
          minHeight: "100vh",
          backgroundColor: "#1a1a1a",
          borderLeft: "1px solid #333"
        }}>
          <MemoryPanel memories={memories} setMemories={setMemories} />
        </div>
      )}
    </div>
  );
}
