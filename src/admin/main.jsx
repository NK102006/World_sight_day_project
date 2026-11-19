// Entry point for the admin page (admin/index.html, served at /admin/ behind the admin password).
import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp';
import '../index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
