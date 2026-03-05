const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'potential-leads', label: 'Potential Leads', icon: '📞' },
  { id: 'mql-leads', label: 'MQL Leads', icon: '📊' },
  { id: 'sql-leads', label: 'SQL Leads', icon: '💼' },
  { id: 'follow-ups', label: 'Follow-ups', icon: '🔁' },
  { id: 'lost-leads', label: 'Lost Leads', icon: '❌' },
];

export default function Sidebar({ activeSection, onNavigate }) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white flex flex-col border-r border-slate-700/50 z-40">
      <div className="p-6 border-b border-slate-700/50">
        <h1 className="text-xl font-bold text-white">Sales AI</h1>
        <p className="text-xs text-slate-400 mt-0.5">Calling Dashboard</p>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition-all ${
              activeSection === item.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
