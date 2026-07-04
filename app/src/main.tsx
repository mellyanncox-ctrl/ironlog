import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initData } from './api';
import { installGlobalErrorHandlers, ToastHost } from './components/Toast';
import './index.css';
// sql.js WASM binary, served as a hashed asset and precached by the service worker
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { registerSW } from 'virtual:pwa-register';

installGlobalErrorHandlers();
// autoUpdate: new versions install silently and apply on next launch
registerSW({ immediate: true });

const root = createRoot(document.getElementById('root')!);

initData({ wasmUrl }).then(
  () => {
    root.render(
      <React.StrictMode>
        <App />
        <ToastHost />
      </React.StrictMode>
    );
  },
  (err) => {
    root.render(
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Ironlog couldn't start</div>
          <div style={{ fontSize: 13, color: '#8e8e96', lineHeight: 1.5 }}>
            {String(err?.message || err)}. Try closing and reopening the app.
            If this keeps happening, your browser may be blocking storage (private browsing mode?).
          </div>
        </div>
      </div>
    );
  }
);
