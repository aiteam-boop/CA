const AGENT_OPTIONS = [
  'All Agents',
  'Anjali',
  'Amisha',
  'Sales Agent 1',
  'Sales Agent 2',
];

export default function AgentDropdown({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="agent-select" className="text-sm font-medium text-slate-700 whitespace-nowrap">
        Select Agent:
      </label>
      <select
        id="agent-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white min-w-[180px]"
      >
        {AGENT_OPTIONS.map((agent) => (
          <option key={agent} value={agent}>
            {agent}
          </option>
        ))}
      </select>
    </div>
  );
}
