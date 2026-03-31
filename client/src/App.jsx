import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './sections/Dashboard';
import PotentialLeads from './sections/FreshCalls';
import MQLLeads from './sections/MQLLeads';
import SQLLeads from './sections/SQLLeads';
import FollowUps from './sections/FollowUps';
import LostLeads from './sections/LostLeads';
import LoginPage from './components/LoginPage';

const SECTIONS = {
  'dashboard': { component: Dashboard, title: 'Dashboard' },
  'potential-leads': { component: PotentialLeads, title: 'Potential Leads' },
  'mql-leads': { component: MQLLeads, title: 'MQL Leads' },
  'sql-leads': { component: SQLLeads, title: 'SQL Leads' },
  'follow-ups': { component: FollowUps, title: 'Follow-ups' },
  'lost-leads': { component: LostLeads, title: 'Lost Leads' },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const authStatus = localStorage.getItem('isLoggedIn');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoaded(true);
  }, []);

  const handleLogin = () => {
    localStorage.setItem('isLoggedIn', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    setIsAuthenticated(false);
  };

  if (!isLoaded) return null;

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const { component: SectionComponent, title } = SECTIONS[activeSection];

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar activeSection={activeSection} onNavigate={setActiveSection} />
      <main className="ml-64 min-h-screen flex flex-col">
        <Topbar title={title} onLogout={handleLogout} />
        <div className="flex-1 p-6">
          <SectionComponent />
        </div>
      </main>
    </div>
  );
}
