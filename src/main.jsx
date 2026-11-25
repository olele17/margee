import React from 'react';
import ReactDOM from 'react-dom/client';
// Capte l'événement d'installation avant l'affichage de React
import './pwa/installState';
// Lien de parrainage (?ref=CODE) gardé pour l'inscription
import { captureReferral } from './utils/referral';
captureReferral();
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
