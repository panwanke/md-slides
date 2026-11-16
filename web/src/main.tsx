import React from 'react';
import ReactDOM from 'react-dom/client';
import Shell from './Shell';
import { ShortcutProvider } from './shortcuts';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ShortcutProvider><Shell /></ShortcutProvider>
  </React.StrictMode>
);
