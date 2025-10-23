import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaComments, FaTasks, FaSignOutAlt, FaPlus } from "react-icons/fa";
import "../../styles/Sidebar.css";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [chatHistory, setChatHistory] = useState([]);

  useEffect(() => {
    const savedHistory = JSON.parse(localStorage.getItem("chatHistory")) || [];
    setChatHistory(savedHistory);
  }, []);

  const links = [
    { path: "/chat", name: "Chat", icon: <FaComments /> },
    { path: "/tasks", name: "Tasks", icon: <FaTasks /> },
  ];

  const handleSignOut = () => {
    localStorage.removeItem("authToken");
    navigate("/login");
  };

  const handleNewChat = () => {
    navigate("/chat");
  };

  const handleContinueChat = (chat) => {
    // Pass the chat data to the parent component
    if (window.continueChatCallback) {
      window.continueChatCallback(chat);
    }
    navigate("/chat");
  };

  const truncateTitle = (title, maxLength = 25) => {
    return title.length > maxLength ? title.slice(0, maxLength) + "..." : title;
  };

  return (
    <div className="sidebar d-flex flex-column vh-100 p-3" style={{ backgroundColor: "#1a1a1a", color: "white" }}>
      {/* SABA Logo */}
      <div className="d-flex align-items-center mb-4">
        <div style={{
          width: "40px",
          height: "40px",
          backgroundColor: "#8B5CF6",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: "12px",
          fontSize: "20px",
          fontWeight: "bold",
          color: "white"
        }}>
          S
        </div>
        <h4 style={{ margin: 0, color: "white", fontSize: "24px", fontWeight: "600" }}>SABA</h4>
      </div>

      {/* New Chat Button */}
      <button
        onClick={handleNewChat}
        className="btn mb-3 d-flex align-items-center"
        style={{
          backgroundColor: "#10B981",
          border: "none",
          color: "white",
          padding: "12px 16px",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: "500"
        }}
      >
        <FaPlus className="me-2" />
        New Chat
      </button>

      {/* Main Navigation */}
      <div className="mb-4">
        <h6 style={{ color: "#9CA3AF", fontSize: "12px", textTransform: "uppercase", marginBottom: "12px" }}>
          Menu
        </h6>
        <ul className="nav flex-column">
          {links.map((link) => (
            <li key={link.path} className="nav-item mb-1">
              <Link
                to={link.path}
                className={`nav-link d-flex align-items-center ${
                  location.pathname === link.path ? "active" : ""
                }`}
                style={{
                  color: location.pathname === link.path ? "#10B981" : "#D1D5DB",
                  backgroundColor: location.pathname === link.path ? "#064E3B" : "transparent",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  textDecoration: "none",
                  fontSize: "14px"
                }}
              >
                <span className="me-3">{link.icon}</span>
                {link.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Chat History */}
      <div className="flex-grow-1">
        <h6 style={{ color: "#9CA3AF", fontSize: "12px", textTransform: "uppercase", marginBottom: "12px" }}>
          Recent Chats
        </h6>
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {chatHistory.length > 0 ? (
            chatHistory.slice(0, 10).map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleContinueChat(chat)}
                style={{
                  padding: "8px 12px",
                  marginBottom: "4px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  backgroundColor: "transparent",
                  border: "1px solid #374151",
                  fontSize: "13px",
                  color: "#D1D5DB",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#374151";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "transparent";
                }}
              >
                {truncateTitle(chat.title || "Untitled Chat")}
              </div>
            ))
          ) : (
            <div style={{ color: "#6B7280", fontSize: "13px", fontStyle: "italic" }}>
              No recent chats
            </div>
          )}
        </div>
      </div>

      {/* Sign Out button pinned at bottom */}
      <button
        onClick={handleSignOut}
        className="btn d-flex align-items-center mt-4"
        style={{
          backgroundColor: "transparent",
          border: "1px solid #EF4444",
          color: "#EF4444",
          padding: "8px 12px",
          borderRadius: "6px",
          fontSize: "14px"
        }}
      >
        <FaSignOutAlt className="me-2" />
        Sign Out
      </button>
    </div>
  );
}
