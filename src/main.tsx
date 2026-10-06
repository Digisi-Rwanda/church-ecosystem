import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { I18nProvider } from './i18n/I18nContext';
import { bootLocalDomainPersistence } from './data/registerLocalDomain';
import { startScheduleServerSync } from './data/scheduleServerSync';
import { startPeopleServerSync } from './services/peopleServerSync';
import { startParticipationServerSync } from './services/participationServerSync';
import './styles/app.css';

bootLocalDomainPersistence();
startScheduleServerSync();
startPeopleServerSync();
startParticipationServerSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
