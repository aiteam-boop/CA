import AgentDropdown from './AgentDropdown';

export default function SectionContainer({
  title,
  description,
  agentValue,
  onAgentChange,
  searchValue,
  onSearchChange,
  filterLabel,
  filterValue,
  onFilterChange,
  filterOptions,
  filter2Label,
  filter2Value,
  onFilter2Change,
  filter2Options,
  children,
  pagination,
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-600 mt-1">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-xl border border-slate-200">
        {onAgentChange && agentValue !== undefined && (
          <AgentDropdown value={agentValue} onChange={onAgentChange} />
        )}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search..."
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        {filterOptions && onFilterChange && (
          <select
            value={filterValue}
            onChange={(e) => onFilterChange(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
          >
            <option value="">{filterLabel || 'All'}</option>
            {filterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        {filter2Options && onFilter2Change && (
          <select
            value={filter2Value}
            onChange={(e) => onFilter2Change(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
          >
            <option value="">{filter2Label || 'All'}</option>
            {filter2Options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {children}

      {pagination && (
        <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200">
          <span className="text-sm text-slate-600">{pagination.summary}</span>
          <div className="flex gap-2">
            <button
              disabled={pagination.currentPage === 1}
              onClick={pagination.onPrev}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={pagination.currentPage >= pagination.totalPages}
              onClick={pagination.onNext}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
