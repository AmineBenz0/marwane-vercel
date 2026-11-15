import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App.jsx'
import { recoverFailedChunk } from './utils/chunkRecovery'
import theme from './theme'
import './index.css'

// Vite emits this event when a lazy-loaded page cannot be fetched (often
// because the staging alias moved to a new deployment while a tab was open).
// Recover once per entry bundle. Let other failures reach the normal boundary.
window.addEventListener('vite:preloadError', (event) => {
  if (recoverFailedChunk(event.payload)) event.preventDefault();
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found!');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}

