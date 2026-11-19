// Entry point for the landing page (index.html, the site front page). The studio keeps its own entry (studio/index.html -> src/main.jsx).
import React from 'react';
import { createRoot } from 'react-dom/client';
import LandingApp from './LandingApp';
import './landing.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LandingApp />
  </React.StrictMode>,
);
