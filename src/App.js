import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Frontpage from "./frontend/Frontpage";
import Login from "./frontend/Login";
import Signup from "./frontend/Signup";
import Chatbox from "./frontend/Chatbox";
import Tasks from "./frontend/Tasks";
import History from "./frontend/History";
import MyCalendar from "./frontend/Calendar";
import Settings from "./frontend/Settings";
import Layout from "./frontend/components/Layout";
import { ThemeProvider } from "./frontend/components/ThemeContext";

function App() {
  const [currentChat, setCurrentChat] = useState(null);

  const handleContinueChat = (chat) => {
    setCurrentChat(chat);
  };

  // Make the callback available globally for the sidebar
  useEffect(() => {
    window.continueChatCallback = handleContinueChat;
    return () => {
      delete window.continueChatCallback;
    };
  }, []);

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          {/* Pages without sidebar */}
          <Route path="/" element={<Frontpage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Pages with sidebar */}
          <Route element={<Layout onContinueChat={handleContinueChat} />}>
            <Route path="/chat" element={<Chatbox chat={currentChat} />} />
            <Route path="/history" element={<History />} />
            <Route path="/tasks" element={<Tasks />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
