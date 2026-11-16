import React from 'react';
import ReactDOM from 'react-dom/client';
import WorkspaceStudio from './ui/WorkspaceStudio';
import { ShortcutProvider } from './shortcuts';

// Use the browser renderer and local file pickers on static hosts.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ShortcutProvider><WorkspaceStudio /></ShortcutProvider>
  </React.StrictMode>,
);
