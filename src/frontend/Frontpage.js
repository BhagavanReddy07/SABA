import React from 'react';
import '../styles/Homepage.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Link } from 'react-router-dom';

export default function Frontpage() {
  return (
    <div className="d-flex flex-column min-vh-100">
      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container">
          <Link className="navbar-brand" to="/">MyAI Assistant</Link>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarNav"
          >
            <span className="navbar-toggler-icon"></span>
          </button>

          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav ms-auto">
              <li className="nav-item">
                <Link className="nav-link active" to="/">Home</Link>
              </li>
              <li className="nav-item">
                <Link className="nav-link" to="/login">Login</Link>
              </li>
              <li className="nav-item">
                <Link className="nav-link" to="/signup">Signup</Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section text-center p-5 flex-grow-1">
        <div className="container">
          <h1 className="display-4">Welcome to Your Personal AI Assistant</h1>
          <p className="lead mt-3">
            Intelligent context-aware assistant that understands your queries and helps manage your tasks effortlessly.
          </p>
          <Link to="/chat" className="btn btn-primary btn-lg mt-3">Get Started</Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="container my-5">
        <h2 className="text-center mb-4">Features</h2>
        <div className="row text-center">
          <div className="col-md-4">
            <div className="card p-3 mb-3">
              <div className="card-body">
                <h5 className="card-title">Context Retention</h5>
                <p className="card-text">Remembers past interactions to provide personalized responses.</p>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card p-3 mb-3">
              <div className="card-body">
                <h5 className="card-title">Entity Extraction</h5>
                <p className="card-text">Extracts all entities from any user query across multiple domains.</p>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card p-3 mb-3">
              <div className="card-body">
                <h5 className="card-title">Intent Detection</h5>
                <p className="card-text">Detects user intent to execute actions intelligently and efficiently.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary text-white text-center py-3 mt-auto">
        <p>&copy; 2025 MyAI Assistant. All rights reserved.</p>
      </footer>
    </div>
  );
}
