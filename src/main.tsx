import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PosApp } from './app/PosApp';
import './styles/tokens.css';
import './styles/global.css';
import './styles/pos-app.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Required application root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <PosApp />
  </StrictMode>,
);
