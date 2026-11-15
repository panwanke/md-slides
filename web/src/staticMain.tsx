import React from 'react';
import ReactDOM from 'react-dom/client';
import StaticStudio from './ui/StaticStudio';

// Static mode (A) entry. Deliberately does not import Shell, App or any store:
// this build must never touch /api/doctor, /api/document, /ws or the account UI.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StaticStudio />
  </React.StrictMode>,
);
