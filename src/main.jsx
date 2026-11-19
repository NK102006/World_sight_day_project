import React from 'react';
import { createRoot } from 'react-dom/client';
import StudioGate from './StudioGate';
import './index.css';

// The studio asks for a user sign-in first (see StudioGate.jsx)
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StudioGate />
  </React.StrictMode>
);
