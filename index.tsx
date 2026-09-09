
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { PopupProvider } from './components/PopupContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const mountApp = async () => {
  // 1. Wait for all resources (CSS, Tailwind, JS, Images) to fully load
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => window.addEventListener('load', resolve));
  }

  // 2. Ensure fonts are loaded to prevent layout shifts
  try {
    await document.fonts.ready;
  } catch (e) {
    console.warn("Font loading wait skipped due to error", e);
  }

  // 3. Render the App
  const root = ReactDOM.createRoot(rootElement);
  
  // We use a small timeout to allow the browser to paint the final frame 
  // ensuring the JS bundle is parsed before we fade out the loader.
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <PopupProvider>
          <App />
        </PopupProvider>
      </BrowserRouter>
    </React.StrictMode>
  );

  // 4. Fade out and remove the loader
  const loader = document.getElementById('initial-loader');
  if (loader) {
    // Add a slight delay to ensure React has painted the initial tree
    setTimeout(() => {
        loader.style.opacity = '0';
        // Remove from DOM after transition finishes (0.4s matched in CSS)
        setTimeout(() => {
            loader.remove();
        }, 400);
    }, 100);
  }
};

mountApp();

// Register Progressive Web App (PWA) Service Worker for installability
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('[PWA] Service Worker registered:', reg.scope))
      .catch((err) => console.error('[PWA] Service Worker registration failed:', err));
  });
}

