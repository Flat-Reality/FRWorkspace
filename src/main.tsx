import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SeasonalTheme } from './SeasonalTheme';
import './styles.css';
import './halloween.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SeasonalTheme><App /></SeasonalTheme>
  </React.StrictMode>,
);
