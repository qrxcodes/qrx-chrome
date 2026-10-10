import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Options } from './options/Options';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Options />
  </StrictMode>
);
