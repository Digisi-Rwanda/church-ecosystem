import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { bootLocalDomainPersistence } from './data/registerLocalDomain';
import { startScheduleServerSync } from './data/scheduleServerSync';
import { startPeopleServerSync } from './services/peopleServerSync';
import './styles/app.css';

bootLocalDomainPersistence();
startScheduleServerSync();
startPeopleServerSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
