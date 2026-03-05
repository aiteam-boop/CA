import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api';

async function fetchDebugInfo() {
  try {
    const r = await fetch(`${API_BASE}/leads/debug`);
    return await r.json();
  } catch {
    return null;
  }
}

function formatDate(val) {
  if (!val) return '—';
  const raw = typeof val === 'object' && val.$date ? val.$date : val;
  const d = new Date(raw);
  if (isNaN(d)) return String(val);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const FIELD_LABELS = {
  _id: 'Document ID',
  'Enquiry Code': 'Enquiry Code',
  Client_Company_Name: 'Company Name',
  Client_Person_Name: 'Contact Person',
  Client_Number: 'Phone Number',
  Client_Email: 'Email',
  Product: 'Product',
  Quantity: 'Quantity',
  Location: 'Location',
  Lead_Source: 'Lead Source',
  Lead_Owner: 'Lead Owner',
  Status: 'Status',
  Date: 'Created Date',
  SRF_MQL_Date: 'MQL Date',
  SQL_Date: 'SQL Date',
  Follow_Up_Date: 'Last Follow-up',
  Follow_Up_Date_1: 'Next Follow-up',
  Follow_Up_Remarks: 'Follow-up Remarks',
  MQL_Status: 'MQL Status',
  Requirement_Details: 'Requirement Details',
  Remarks: 'Remarks',
};

function formatFieldValue(key, val) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'object' && val.$date) return formatDate(val);
  if (typeof val === 'object' && val.$oid) return String(val.$oid);
  if (typeof val === 'object') {
    try { return JSON.stringify(val); } catch { return String(val); }
  }
  if (key.toLowerCase().includes('date') || key === 'Date') return formatDate(val);
  return String(val);
}

// Column definitions per status — keys are lowercase versions of the status prop
const COLUMNS = {
  potential: [
    { key: 'Enquiry Code',         label: 'Enquiry Code' },
    { key: 'Client_Company_Name',  label: 'Company' },
    { key: 'Client_Person_Name',   label: 'Contact' },
    { key: 'Client_Number',        label: 'Phone', phone: true },
    { key: 'Product',              label: 'Product' },
    { key: 'Quantity',             label: 'Quantity' },
    { key: 'Location',             label: 'Location' },
    { key: 'Date',                 label: 'Date', date: true },
    { key: 'Status',               label: 'Status', statusBadge: true },
    { key: 'Lead_Owner',           label: 'Lead Owner', badge: true },
  ],
  'srf/mql': [
    { key: 'Enquiry Code',         label: 'Enquiry Code' },
    { key: 'Client_Company_Name',  label: 'Company' },
    { key: 'Client_Person_Name',   label: 'Contact' },
    { key: 'Client_Number',        label: 'Phone', phone: true },
    { key: 'Product',              label: 'Product' },
    { key: 'Quantity',             label: 'Quantity' },
    { key: 'Location',             label: 'Location' },
    { key: 'SRF_MQL_Date',         label: 'MQL Date', date: true },
    { key: 'Status',               label: 'Status', statusBadge: true },
    { key: 'Lead_Owner',           label: 'Lead Owner', badge: true },
  ],
  sql: [
    { key: 'Enquiry Code',         label: 'Enquiry Code' },
    { key: 'Client_Company_Name',  label: 'Company' },
    { key: 'Client_Person_Name',   label: 'Contact' },
    { key: 'Client_Number',        label: 'Phone', phone: true },
    { key: 'Product',              label: 'Product' },
    { key: 'Quantity',             label: 'Quantity' },
    { key: 'Location',             label: 'Location' },
    { key: 'SQL_Date',             label: 'SQL Date', date: true },
    { key: 'Status',               label: 'Status', statusBadge: true },
    { key: 'Lead_Owner',           label: 'Lead Owner', badge: true },
  ],
  followup: [
    { key: 'Enquiry Code',         label: 'Enquiry Code' },
    { key: 'Client_Company_Name',  label: 'Company' },
    { key: 'Client_Person_Name',   label: 'Contact' },
    { key: 'Client_Number',        label: 'Phone', phone: true },
    { key: 'Product',              label: 'Product' },
    { key: 'Quantity',             label: 'Quantity' },
    { key: 'Location',             label: 'Location' },
    { key: 'Follow_Up_Date',       label: 'Last Follow-up', date: true },
    { key: 'Status',               label: 'Status', statusBadge: true },
    { key: 'Lead_Owner',           label: 'Lead Owner', badge: true },
  ],
  lost: [
    { key: 'Enquiry Code',         label: 'Enquiry Code' },
    { key: 'Client_Company_Name',  label: 'Company' },
    { key: 'Client_Person_Name',   label: 'Contact' },
    { key: 'Client_Number',        label: 'Phone', phone: true },
    { key: 'Product',              label: 'Product' },
    { key: 'Quantity',             label: 'Quantity' },
    { key: 'Location',             label: 'Location' },
    { key: 'Date',                 label: 'Date', date: true },
    { key: 'Status',               label: 'Status', statusBadge: true },
    { key: 'Lead_Owner',           label: 'Lead Owner', badge: true },
  ],
};

const STATUS_COLORS = {
  potential:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  new:          'bg-emerald-50 text-emerald-700 border-emerald-200',
  'srf/mql':    'bg-amber-50 text-amber-700 border-amber-200',
  sql:          'bg-purple-50 text-purple-700 border-purple-200',
  followup:     'bg-sky-50 text-sky-700 border-sky-200',
  'follow up':  'bg-sky-50 text-sky-700 border-sky-200',
  lost:         'bg-red-50 text-red-700 border-red-200',
  po:           'bg-green-50 text-green-700 border-green-200',
};

function CellValue({ col, value }) {
  if (col.date)        return <span className="whitespace-nowrap">{formatDate(value)}</span>;
  if (col.phone)       return value
    ? <a href={`tel:${value}`} className="text-blue-600 hover:underline font-medium whitespace-nowrap">{value}</a>
    : <span className="text-slate-400">—</span>;
  if (col.statusBadge) {
    const colorClass = STATUS_COLORS[String(value).toLowerCase()] || 'bg-slate-50 text-slate-600 border-slate-200';
    return value
      ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${colorClass}`}>{value}</span>
      : <span className="text-slate-400">—</span>;
  }
  if (col.badge)       return value
    ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">{value}</span>
    : <span className="text-slate-400">—</span>;
  if (col.truncate)    return (
    <span className="block truncate max-w-[200px] text-xs" title={value || ''}>
      {value || '—'}
    </span>
  );
  return <span>{value ?? '—'}</span>;
}

function LeadDetailModal({ lead, onClose, onCall }) {
  if (!lead) return null;

  const skipKeys = new Set(['__v']);
  const entries = Object.entries(lead).filter(([k]) => !skipKeys.has(k));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {lead['Client_Company_Name'] || 'Lead Details'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {lead['Enquiry Code'] || 'No enquiry code'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500 hover:text-slate-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {entries.map(([key, val]) => (
              <div key={key} className="py-2 border-b border-slate-100">
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {FIELD_LABELS[key] || key.replace(/_/g, ' ')}
                </dt>
                <dd className="mt-0.5 text-sm text-slate-800 break-words">
                  {key === 'Client_Number' && val ? (
                    <a href={`tel:${val}`} className="text-blue-600 hover:underline">{formatFieldValue(key, val)}</a>
                  ) : (
                    formatFieldValue(key, val)
                  )}
                </dd>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          {lead['Client_Number'] && onCall && (
            <button
              onClick={() => { onCall(lead); onClose(); }}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              AI Call
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LeadSection({ status, sectionName, agentId, title, description, emptyMessage }) {
  const [agents, setAgents]               = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('All Agents');
  const [search, setSearch]               = useState('');
  const [leads, setLeads]                 = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [page, setPage]                   = useState(1);
  const [debugInfo, setDebugInfo]         = useState(null);
  const [viewLead, setViewLead]           = useState(null);
  const [callingId, setCallingId]         = useState(null);
  const [callResult, setCallResult]       = useState(null);
  const perPage = 10;

  const handleCall = async (lead) => {
    const phone = lead['Client_Number'];
    if (!phone) return;
    if (!agentId) {
      setCallResult({ id: lead._id, ok: false, msg: 'No AI agent configured for this section.' });
      return;
    }

    setCallingId(lead._id);
    setCallResult(null);
    try {
      const res = await fetch(`${API_BASE}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_phone_number: String(phone),
          agent_id: agentId,
          section_name: sectionName || title,
          lead_data: {
            enquiry_code:    lead['Enquiry Code']         || '',
            company_name:    lead['Client_Company_Name']  || '',
            contact_name:    lead['Client_Person_Name']   || '',
            phone_number:    String(phone),
            product_name:    lead['Product']               || '',
            quantity:        lead['Quantity']               || '',
            location:        lead['Location']               || '',
            lead_owner:      lead['Lead_Owner']             || '',
            status:          lead['Status']                 || '',
            requirement_details: lead['Requirement_Details'] || '',
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCallResult({ id: lead._id, ok: true, msg: 'Call initiated!' });
      } else {
        setCallResult({ id: lead._id, ok: false, msg: data.error || 'Call failed.' });
      }
    } catch {
      setCallResult({ id: lead._id, ok: false, msg: 'Could not reach the server.' });
    } finally {
      setCallingId(null);
    }
  };

  const searchTimer = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/leads/agents?status=${encodeURIComponent(status)}`)
      .then((r) => r.json())
      .then((res) => { if (res.success) setAgents(res.data); })
      .catch(() => {});
  }, [status]);

  const fetchLeads = useCallback(async (agentArg, searchArg) => {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      const params = new URLSearchParams({ status });
      if (agentArg && agentArg !== 'All Agents') params.set('agent', agentArg);
      if (searchArg && searchArg.trim()) params.set('search', searchArg.trim());

      const res  = await fetch(`${API_BASE}/leads?${params}`);
      const data = await res.json();

      if (data.success) {
        setLeads(data.data);
      } else {
        setError(data.error || 'Failed to load leads.');
        setLeads([]);
      }
    } catch {
      setError('Could not reach the server. Make sure the backend is running (npm run dev).');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchLeads(selectedAgent, search);
  }, [selectedAgent]); // eslint-disable-line

  useEffect(() => {
    fetchLeads('All Agents', '');
  }, [fetchLeads]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchLeads(selectedAgent, val), 400);
  };

  const cols       = COLUMNS[status.toLowerCase()] || COLUMNS.potential;
  const totalPages = Math.max(1, Math.ceil(leads.length / perPage));
  const paginated  = leads.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 mt-1 text-sm">{description}</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-white rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Agent Owner:</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[160px]"
          >
            <option value="All Agents">All Agents</option>
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <input
          type="text"
          placeholder="Search company, contact, phone, code..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />

        <button
          onClick={() => fetchLeads(selectedAgent, search)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 shrink-0"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>

        {!loading && (
          <span className="text-xs text-slate-400 ml-auto shrink-0">
            {leads.length} lead{leads.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center min-h-[220px] bg-white rounded-xl border border-slate-200">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm font-medium">Loading leads...</span>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && leads.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[260px] bg-white rounded-xl border border-slate-200 text-center px-6 py-10">
          <svg className="w-12 h-12 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-base font-semibold text-slate-700">
            {selectedAgent !== 'All Agents'
              ? `No leads found for ${selectedAgent}.`
              : (emptyMessage || 'No leads found.')}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            This section queries <code className="text-xs bg-slate-100 px-1 rounded">Status = "{status}"</code> from leads_master.
          </p>
          {!debugInfo && (
            <button
              onClick={async () => { const d = await fetchDebugInfo(); setDebugInfo(d); }}
              className="mt-4 px-4 py-2 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Check database status values
            </button>
          )}
          {debugInfo && debugInfo.success && (
            <div className="mt-4 w-full max-w-md text-left bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
              <p className="font-semibold text-slate-700 mb-2">
                leads_master has {debugInfo.totalDocuments} total documents.
              </p>
              <p className="text-slate-500 mb-1 font-medium">Status values found in DB:</p>
              <div className="space-y-1">
                {debugInfo.statusBreakdown.length === 0 && (
                  <p className="text-red-500">No documents found in leads_master collection.</p>
                )}
                {debugInfo.statusBreakdown.map((s) => (
                  <div key={String(s.status)} className="flex items-center justify-between gap-4">
                    <code className={`px-2 py-0.5 rounded font-mono ${
                      String(s.status).toLowerCase() === status.toLowerCase()
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {String(s.status ?? '(null)')}
                    </code>
                    <span className="text-slate-400">{s.count} lead{s.count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
              {debugInfo.statusBreakdown.every(
                (s) => String(s.status).toLowerCase() !== status.toLowerCase()
              ) && (
                <p className="mt-3 text-amber-600 font-medium">
                  No documents with status "{status}" found in the database.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && leads.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-500 uppercase tracking-wider text-xs font-semibold">
                  {cols.map((col) => (
                    <th key={col.key} className="px-5 py-4 whitespace-nowrap">{col.label}</th>
                  ))}
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((lead, i) => (
                  <tr key={String(lead._id ?? i)} className="hover:bg-slate-50/60 transition-colors">
                    {cols.map((col) => (
                      <td key={col.key} className="px-5 py-4 text-slate-700">
                        <CellValue col={col} value={lead[col.key]} />
                      </td>
                    ))}
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        <button
                          onClick={() => handleCall(lead)}
                          disabled={callingId === String(lead._id)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100 disabled:opacity-50"
                        >
                          {callingId === String(lead._id) ? 'Calling...' : 'Call'}
                        </button>
                        <button
                          onClick={() => setViewLead(lead)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          View
                        </button>
                        {callResult && String(callResult.id) === String(lead._id) && (
                          <span className={`text-xs ml-1 ${callResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                            {callResult.msg}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200">
            <span className="text-sm text-slate-600">
              Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, leads.length)} of {leads.length} leads
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Lead Detail Modal */}
      {viewLead && <LeadDetailModal lead={viewLead} onClose={() => setViewLead(null)} onCall={agentId ? handleCall : null} />}
    </div>
  );
}
