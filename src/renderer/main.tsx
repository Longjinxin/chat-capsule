import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import CapsuleTooltip from './components/CapsuleTooltip';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

const tooltipMode = new URLSearchParams(window.location.search).get('tooltip') === '1';

createRoot(root).render(
  <React.StrictMode>{tooltipMode ? <CapsuleTooltip /> : <App />}</React.StrictMode>,
);
