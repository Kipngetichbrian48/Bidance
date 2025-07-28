import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import App from './App';

if (process.env.NODE_ENV === 'development') {
  const originalAddEventListener = window.addEventListener;
  window.addEventListener = (event, handler, options) => {
    if (event === 'DOMNodeInsertedIntoDocument') {
      console.warn('Ignoring deprecated DOMNodeInsertedIntoDocument event');
      return;
    }
    originalAddEventListener(event, handler, options);
  };
}

const root = createRoot(document.getElementById('root'));
root.render( <App />);