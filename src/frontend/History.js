import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import { Modal, Button } from "react-bootstrap";

function History({ onContinueChat }) {
  const [history, setHistory] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const savedHistory = JSON.parse(localStorage.getItem("chatHistory")) || [];
    setHistory(savedHistory);
  }, []);

  const deleteChat = (id) => {
    const updatedHistory = history.filter((session) => session.id !== id);
    setHistory(updatedHistory);
    localStorage.setItem("chatHistory", JSON.stringify(updatedHistory));
    setShowModal(false);

    if (selectedChat?.id === id) {
      setSelectedChat(null);
    }
  };

  const handleChatClick = (chat) => {
    setSelectedChat(chat);
    setShowModal(true);
  };

  const continueChat = () => {
    if (onContinueChat && selectedChat) {
      onContinueChat(selectedChat);
      navigate("/chat");
    }
    setShowModal(false);
  };

  return (
    <div className="container-fluid vh-100">
      <div className="row h-100">
        {/* Sidebar */}
        <div className="col-3 col-md-2 bg-light border-end p-0">
          <div className="list-group list-group-flush">
            <div className="p-3 border-bottom bg-white fw-bold">Chat History</div>
            {history.length > 0 ? (
              history.map((session) => (
                <button
                  key={session.id}
                  className="list-group-item list-group-item-action text-start"
                  onClick={() => handleChatClick(session)}
                >
                  {session.title.length > 25
                    ? session.title.slice(0, 25) + "..."
                    : session.title}
                </button>
              ))
            ) : (
              <div className="p-3 text-muted small">No history yet</div>
            )}
          </div>
        </div>

        {/* Main Chat Display */}
        <div className="col-9 col-md-10 d-flex flex-column">
          <div className="p-3 border-bottom bg-white fw-bold">
            {selectedChat ? selectedChat.title : "Select a chat"}
          </div>

          <div
            className="flex-grow-1 p-3 overflow-auto"
            style={{ background: "#f8f9fa" }}
          >
            {selectedChat ? (
              selectedChat.messages.map((msg, i) => (
                <div
                  key={i}
                  className={`d-flex mb-2 ${
                    msg.sender === "user"
                      ? "justify-content-end"
                      : "justify-content-start"
                  }`}
                >
                  <div
                    className={`p-2 px-3 rounded-3 shadow-sm ${
                      msg.sender === "user"
                        ? "bg-primary text-white"
                        : "bg-white"
                    }`}
                    style={{ maxWidth: "70%" }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            ) : (
              <div className="h-100 d-flex align-items-center justify-content-center text-muted">
                <p className="text-center">
                  👈 Select a chat from the left to view messages
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bootstrap Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{selectedChat?.title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Do you want to continue this chat or delete it from history?</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => deleteChat(selectedChat.id)}>
            Delete
          </Button>
          <Button variant="success" onClick={continueChat}>
            Continue Chat
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default History;
