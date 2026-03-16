import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

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
    { key: 'Enquiry Code', label: 'Enquiry Code' },
    { key: 'Client_Company_Name', label: 'Company' },
    { key: 'Client_Person_Name', label: 'Contact' },
    { key: 'Client_Number', label: 'Phone', phone: true },
    { key: 'Product', label: 'Product' },
    { key: 'Quantity', label: 'Quantity' },
    { key: 'Location', label: 'Location' },
    { key: 'Date', label: 'Date', date: true },
    { key: 'Status', label: 'Status', statusBadge: true },
    { key: 'Lead_Owner', label: 'Lead Owner', badge: true },
  ],
  'srf/mql': [
    { key: 'Enquiry Code', label: 'Enquiry Code' },
    { key: 'Client_Company_Name', label: 'Company' },
    { key: 'Client_Person_Name', label: 'Contact' },
    { key: 'Client_Number', label: 'Phone', phone: true },
    { key: 'Product', label: 'Product' },
    { key: 'Quantity', label: 'Quantity' },
    { key: 'Location', label: 'Location' },
    { key: 'SRF_MQL_Date', label: 'MQL Date', date: true },
    { key: 'Status', label: 'Status', statusBadge: true },
    { key: 'Lead_Owner', label: 'Lead Owner', badge: true },
  ],
  sql: [
    { key: 'Enquiry Code', label: 'Enquiry Code' },
    { key: 'Client_Company_Name', label: 'Company' },
    { key: 'Client_Person_Name', label: 'Contact' },
    { key: 'Client_Number', label: 'Phone', phone: true },
    { key: 'Product', label: 'Product' },
    { key: 'Quantity', label: 'Quantity' },
    { key: 'Location', label: 'Location' },
    { key: 'SQL_Date', label: 'SQL Date', date: true },
    { key: 'Status', label: 'Status', statusBadge: true },
    { key: 'Lead_Owner', label: 'Lead Owner', badge: true },
  ],
  followup: [
    { key: 'Enquiry Code', label: 'Enquiry Code' },
    { key: 'Client_Company_Name', label: 'Company' },
    { key: 'Client_Person_Name', label: 'Contact' },
    { key: 'Client_Number', label: 'Phone', phone: true },
    { key: 'Product', label: 'Product' },
    { key: 'Quantity', label: 'Quantity' },
    { key: 'Location', label: 'Location' },
    { key: 'Follow_Up_Date', label: 'Last Follow-up', date: true },
    { key: 'Status', label: 'Status', statusBadge: true },
    { key: 'Lead_Owner', label: 'Lead Owner', badge: true },
  ],
  lost: [
    { key: 'Enquiry Code', label: 'Enquiry Code' },
    { key: 'Client_Company_Name', label: 'Company' },
    { key: 'Client_Person_Name', label: 'Contact' },
    { key: 'Client_Number', label: 'Phone', phone: true },
    { key: 'Product', label: 'Product' },
    { key: 'Quantity', label: 'Quantity' },
    { key: 'Location', label: 'Location' },
    { key: 'Date', label: 'Date', date: true },
    { key: 'Status', label: 'Status', statusBadge: true },
    { key: 'Lead_Owner', label: 'Lead Owner', badge: true },
  ],
};

const STATUS_COLORS = {
  potential: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'srf/mql': 'bg-amber-50 text-amber-700 border-amber-200',
  sql: 'bg-purple-50 text-purple-700 border-purple-200',
  followup: 'bg-sky-50 text-sky-700 border-sky-200',
  'follow up': 'bg-sky-50 text-sky-700 border-sky-200',
  lost: 'bg-red-50 text-red-700 border-red-200',
  po: 'bg-green-50 text-green-700 border-green-200',
};

function CellValue({ col, value }) {
  if (col.date) return <span className="whitespace-nowrap">{formatDate(value)}</span>;
  if (col.phone) return value
    ? <a href={`tel:${value}`} className="text-blue-600 hover:underline font-medium whitespace-nowrap">{value}</a>
    : <span className="text-slate-400">—</span>;
  if (col.statusBadge) {
    const colorClass = STATUS_COLORS[String(value).toLowerCase()] || 'bg-slate-50 text-slate-600 border-slate-200';
    return value
      ? <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${colorClass}`}>{value}</span>
      : <span className="text-slate-400">—</span>;
  }
  if (col.badge) return value
    ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">{value}</span>
    : <span className="text-slate-400">—</span>;
  if (col.truncate) return (
    <span className="block truncate max-w-[200px] text-xs" title={value || ''}>
      {value || '—'}
    </span>
  );
  return <span>{value ?? '—'}</span>;
}


// ── Follow-up History Panel in Lead Detail Modal ─────────────────────────────

function FollowUpHistory({ entries }) {
  if (!entries || entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Follow-up History
      </h3>
      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
        {sorted.map((entry, i) => (
          <div key={i} className="relative pl-6 pb-3 border-l-2 border-blue-200 last:border-transparent">
            <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
            <div className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-700">
                  {entry.source === 'AI Call' || entry.source === 'ai_call_agent' ? '🤖 AI Call – Follow Up' : entry.source || 'Follow Up'}
                </span>
                <span className="text-xs text-slate-500 ml-auto flex items-center gap-1">
                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDate(entry.date)}
                </span>
              </div>

              <div className="text-xs font-medium text-slate-500 mb-1 tracking-wide uppercase">Summary</div>
              <p className="text-sm text-slate-800 whitespace-pre-line mb-3 leading-relaxed">{entry.remark || '—'}</p>

              {entry.transcript && (
                <details className="mt-2 mb-2 group">
                  <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800 font-medium list-none flex items-center gap-1 select-none">
                    Transcript <span className="text-[10px] group-open:hidden">▼</span><span className="text-[10px] hidden group-open:inline">▲</span>
                    <span className="text-slate-400 font-normal ml-1"> (Expand to view)</span>
                  </summary>
                  <pre className="mt-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-3 max-h-[150px] overflow-y-auto whitespace-pre-wrap">
                    {entry.transcript}
                  </pre>
                </details>
              )}

              {entry.recording_url && (
                <div className="mt-3 flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 w-fit">
                  <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Audio
                  </span>
                  <audio src={entry.recording_url} controls className="h-8 min-w-[200px] outline-none" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Requirement Change History ────────────────────────────────────────────────

function RequirementChangeHistory({ changes }) {
  if (!changes || changes.length === 0) return null;

  const sorted = [...changes].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
        Requirement Changes
      </h3>
      <div className="space-y-2">
        {sorted.map((change, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <div className="shrink-0 w-2 h-2 rounded-full bg-amber-500" />
            <div className="flex-1">
              {change.old_product && (
                <p className="text-amber-800">
                  <span className="font-medium">Product:</span>{' '}
                  <span className="line-through text-amber-600">{change.old_product}</span>
                  {' → '}
                  <span className="font-semibold text-amber-900">{change.new_product}</span>
                </p>
              )}
              {change.old_size && (
                <p className="text-amber-800">
                  <span className="font-medium">Size:</span>{' '}
                  <span className="line-through text-amber-600">{change.old_size}</span>
                  {' → '}
                  <span className="font-semibold text-amber-900">{change.new_size}</span>
                </p>
              )}
            </div>
            <span className="text-xs text-amber-500 whitespace-nowrap">{formatDate(change.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Call Transcripts ──────────────────────────────────────────────────────

// AI Call Transcripts has been merged with FollowUpHistory

function LeadDetailModal({ lead, onClose, onCall }) {
  if (!lead) return null;

  const skipKeys = new Set(['__v', 'follow_up_control', 'ai_call_logs', 'requirement_change_history', 'ai_calls', 'followup_history', 'last_transcript']);
  const entries = Object.entries(lead).filter(([k]) => !skipKeys.has(k) && !!lead[k]);

  const sortedCalls = [...(lead.ai_calls || lead.ai_call_logs || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  const manualFollowUps = (lead.followup_history || []);
  const requirementChanges = lead.requirement_change_history || [];

  const lastCallFormatted = sortedCalls.length > 0 ? formatDate(sortedCalls[0].date) : 'No recent calls';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Lead Profile
            </h2>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left side: Basic info */}
            <div>
              <div className="mb-6 p-5 bg-slate-50 border border-slate-200 rounded-xl relative shadow-sm">
                <span className="absolute top-5 right-5 text-xs font-semibold px-2 py-1 bg-emerald-100 text-emerald-800 rounded">{lead['Status'] || 'Unknown'}</span>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📞</span> <span className="text-lg font-bold text-slate-900">{lead['Client_Number'] || 'N/A'}</span>
                </div>
                <h3 className="text-base font-medium text-slate-800">{lead['Client_Company_Name'] || 'Lead Details'}</h3>
                <div className="text-xs text-slate-500 mt-2 font-mono bg-slate-200 px-2 py-0.5 rounded inline-block">{lead['Enquiry Code'] || 'No enquiry code'}</div>

                <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col gap-1">
                  <div className="text-sm">
                    <span className="text-slate-500 font-medium tracking-wide">Lead Type:</span> <span className="text-slate-900 font-semibold ml-1">{lead['Lead_Type'] || 'Follow Up'}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-slate-500 font-medium tracking-wide">Last Call:</span> <span className="text-slate-900 font-semibold ml-1">{lastCallFormatted}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-6">
                {entries.map(([key, val]) => (
                  <div key={key} className="py-2 border-b border-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      {FIELD_LABELS[key] || key.replace(/_/g, ' ')}
                    </dt>
                    <dd className="text-sm font-medium text-slate-800 break-words">
                      {key === 'Client_Number' && val ? (
                        <a href={`tel:${val}`} className="text-blue-600 hover:underline">{formatFieldValue(key, val)}</a>
                      ) : (
                        formatFieldValue(key, val)
                      )}
                    </dd>
                  </div>
                ))}
              </div>

              <RequirementChangeHistory changes={requirementChanges} />
              <FollowUpHistory entries={manualFollowUps} />
            </div>

            {/* Right side: Call History */}
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Recent Calls
                </span>
                <span className="bg-blue-100 text-blue-800 text-xs py-0.5 px-2 rounded-full">{sortedCalls.length}</span>
              </h3>

              <div className="space-y-4 pr-1 max-h-[60vh] overflow-y-auto">
                {sortedCalls.map((c, i) => {
                  const statusLower = String(c.call_status).toLowerCase();
                  const statusColor = statusLower.includes('completed') ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                    statusLower.includes('no answer') || statusLower.includes('no-answer') ? 'bg-amber-100 text-amber-800 border-amber-200' :
                      statusLower.includes('failed') ? 'bg-red-100 text-red-800 border-red-200' :
                        'bg-slate-100 text-slate-800 border-slate-200';

                  return (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow transition-shadow relative overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 opacity-80"></div>
                      <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border w-max ${statusColor}`}>
                            {c.call_status || 'Unknown'}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">{formatDate(c.date)}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded inline-block">{c.duration || 0}s</div>
                        </div>
                      </div>

                      <div className="space-y-3 mt-3">
                        {c.recording_url && (
                          <details className="group">
                            <summary className="text-xs text-blue-600 font-semibold cursor-pointer flex items-center gap-1.5 select-none bg-blue-50 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors">
                              🎧 Audio Recording <span className="text-[10px] group-open:-rotate-180 transition-transform ml-auto text-blue-400">▼</span>
                            </summary>
                            <div className="mt-2 px-2">
                              <audio src={c.recording_url} controls className="h-10 w-full outline-none" />
                            </div>
                          </details>
                        )}
                        {c.transcript && (
                          <details className="group">
                            <summary className="text-xs text-sky-600 font-semibold cursor-pointer flex items-center gap-1.5 select-none bg-sky-50 px-3 py-2 rounded-lg hover:bg-sky-100 transition-colors">
                              📝 Transcript <span className="text-[10px] group-open:-rotate-180 transition-transform ml-auto text-sky-400">▼</span>
                            </summary>
                            <div className="mt-2 px-2">
                              <div className="text-[13px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-[250px] overflow-y-auto whitespace-pre-wrap font-serif leading-relaxed">
                                {c.transcript}
                              </div>
                            </div>
                          </details>
                        )}
                        {c.summary && (
                          <details className="group">
                            <summary className="text-xs text-purple-600 font-semibold cursor-pointer flex items-center gap-1.5 select-none bg-purple-50 px-3 py-2 rounded-lg hover:bg-purple-100 transition-colors">
                              📊 Call Analytics <span className="text-[10px] group-open:-rotate-180 transition-transform ml-auto text-purple-400">▼</span>
                            </summary>
                            <div className="mt-2 px-2">
                              <div className="text-[13px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-4 whitespace-pre-line leading-relaxed">
                                {c.summary}
                              </div>
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  )
                })}
                {sortedCalls.length === 0 && (
                  <div className="text-sm text-slate-500 italic bg-slate-50 p-6 rounded-xl border border-dashed border-slate-300 text-center">
                    No AI calls recorded yet.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-white shrink-0">
          {lead['Client_Number'] && onCall && (
            <button
              onClick={() => { onCall(lead); onClose(); }}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow-md rounded-xl transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              AI Call Now
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main LeadSection Component ──────────────────────────────────────────────

export default function LeadSection({ status, sectionName, agentId, title, description, emptyMessage }) {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('All Agents');
  const [search, setSearch] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [debugInfo, setDebugInfo] = useState(null);
  const [viewLead, setViewLead] = useState(null);
  const [callingId, setCallingId] = useState(null);
  const [callResult, setCallResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeCalls, setActiveCalls] = useState(new Set());
  const [callResults, setCallResults] = useState({});
  const perPage = 10;

  const selectedAgentRef = useRef(selectedAgent);
  const searchRef = useRef(search);
  const viewLeadRef = useRef(viewLead);

  useEffect(() => {
    selectedAgentRef.current = selectedAgent;
    searchRef.current = search;
    viewLeadRef.current = viewLead;
  }, [selectedAgent, search, viewLead]);

  const handleCall = async (lead) => {
    const phone = lead['Client_Number'];
    if (!phone) return;

    setActiveCalls(prev => new Set(prev).add(lead._id));
    setCallResults(prev => ({ ...prev, [lead._id]: null }));

    try {
      const res = await fetch(`${API_BASE}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_phone_number: String(phone),
          agent_id: agentId,
          section_name: sectionName || title,
          lead_data: {
            enquiry_code: lead['Enquiry Code'] || '',
            company_name: lead['Client_Company_Name'] || '',
            contact_name: lead['Client_Person_Name'] || '',
            phone_number: String(phone),
            product_name: lead['Product'] || '',
            quantity: lead['Quantity'] || '',
            location: lead['Location'] || '',
            lead_owner: lead['Lead_Owner'] || '',
            status: lead['Status'] || '',
            industry: lead['Industry'] || '',
            lead_type: lead['Lead_Type'] || '',
            remarks: lead['Remarks'] || '',
            requirement_details: lead['Requirement_Details'] || '',
          },
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setCallResults(prev => ({ ...prev, [lead._id]: { ok: false, msg: data.error || 'Call failed' } }));
        setActiveCalls(prev => { const n = new Set(prev); n.delete(lead._id); return n; });
        setTimeout(() => setCallResults(prev => ({ ...prev, [lead._id]: null })), 5000);
      } else {
        const typeLabel = (data.call_type || '').toUpperCase();
        setCallResults(prev => ({ ...prev, [lead._id]: { ok: true, msg: `${typeLabel} call started` } }));
        // Deselect if it was selected so they don't call again accidentally
        setSelectedIds(prev => { const n = new Set(prev); n.delete(lead._id); return n; });

        if (data.execution_id) {
          pollExecution(lead['Enquiry Code'], data.execution_id, lead._id);
        } else {
          setActiveCalls(prev => { const n = new Set(prev); n.delete(lead._id); return n; });
          setTimeout(() => setCallResults(prev => ({ ...prev, [lead._id]: null })), 5000);
        }
      }
    } catch (err) {
      setCallResults(prev => ({ ...prev, [lead._id]: { ok: false, msg: 'Network Error' } }));
      setActiveCalls(prev => { const n = new Set(prev); n.delete(lead._id); return n; });
      setTimeout(() => setCallResults(prev => ({ ...prev, [lead._id]: null })), 5000);
    }
  };

  const pollExecution = async (enquiryCode, executionId, leadId) => {
    const MAX_POLLS = 60; // Max 5 mins
    const POLL_INTERVAL = 5000;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      try {
        const res = await fetch(`${API_BASE}/execution/${executionId}`);
        const result = await res.json();
        if (result.success && result.data) {
          const s = (result.data.status || '').toLowerCase();
          if (['completed', 'ended', 'finished', 'done', 'failed', 'error'].includes(s)) {
            setCallResults(prev => ({ ...prev, [leadId]: { ok: true, msg: 'Processing call...' } }));
            await completeCallFlow(enquiryCode, executionId, leadId);
            return;
          }
        }
      } catch (err) { }
    }
    setActiveCalls(prev => { const n = new Set(prev); n.delete(leadId); return n; });
    setCallResults(prev => ({ ...prev, [leadId]: { ok: false, msg: 'Time limit exceeded' } }));
    setTimeout(() => setCallResults(prev => ({ ...prev, [leadId]: null })), 5000);
  };

  const completeCallFlow = async (enquiryCode, executionId, leadId) => {
    try {
      const res = await fetch(`${API_BASE}/call/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enquiry_code: enquiryCode, execution_id: executionId }),
      });
      const result = await res.json();
      if (result.success) {
        setCallResults(prev => ({ ...prev, [leadId]: { ok: true, msg: 'Stored! Refreshing...' } }));
        fetchLeads(selectedAgentRef.current, searchRef.current);
        if (viewLeadRef.current && String(viewLeadRef.current._id) === String(leadId)) {
          fetch(`${API_BASE}/leads/${encodeURIComponent(enquiryCode)}`)
            .then(r => r.json())
            .then(d => { if (d.success) setViewLead(d.data) });
        }
      } else {
        setCallResults(prev => ({ ...prev, [leadId]: { ok: false, msg: 'Failed to process' } }));
      }
    } catch (err) {
      setCallResults(prev => ({ ...prev, [leadId]: { ok: false, msg: 'Processing Error' } }));
    } finally {
      setActiveCalls(prev => { const n = new Set(prev); n.delete(leadId); return n; });
      setTimeout(() => setCallResults(prev => ({ ...prev, [leadId]: null })), 5000);
    }
  };

  const handleBulkCall = async () => {
    if (selectedIds.size === 0) return;
    const leadsToCall = leads.filter(l => selectedIds.has(l._id));
    for (const lead of leadsToCall) {
      handleCall(lead); // Fire non-blocking
    }
  };

  const searchTimer = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/leads/agents?status=${encodeURIComponent(status)}`)
      .then((r) => r.json())
      .then((res) => { if (res.success) setAgents(res.data); })
      .catch(() => { });
  }, [status]);

  const fetchLeads = useCallback(async (agentArg, searchArg) => {
    setLoading(true);
    setError(null);
    setPage(1);
    try {
      const params = new URLSearchParams({ status });
      if (agentArg && agentArg !== 'All Agents') params.set('agent', agentArg);
      if (searchArg && searchArg.trim()) params.set('search', searchArg.trim());

      const res = await fetch(`${API_BASE}/leads?${params}`);
      const data = await res.json();

      if (data.success) {
        setLeads(data.data);
        setSelectedIds(prev => {
          const validLeads = new Set(data.data.map(l => l._id));
          const newSet = new Set();
          for (let id of prev) { if (validLeads.has(id)) newSet.add(id); }
          return newSet;
        });
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

  // Socket.io for Real-time Refresh
  useEffect(() => {
    const socket = io();
    socket.on('call_completed', (data) => {
      // Re-fetch standard leads list quietly
      fetchLeads(selectedAgentRef.current, searchRef.current);
      // Re-fetch detailed view if current lead was updated
      if (data && data.enquiry_code && viewLeadRef.current && viewLeadRef.current['Enquiry Code'] === data.enquiry_code) {
        fetch(`${API_BASE}/leads/${encodeURIComponent(data.enquiry_code)}`)
          .then(r => r.json())
          .then(d => { if (d.success) setViewLead(d.data); });
      }
    });

    return () => socket.disconnect();
  }, [fetchLeads]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchLeads(selectedAgent, val), 400);
  };


  const cols = COLUMNS[status.toLowerCase()] || COLUMNS.potential;
  const totalPages = Math.max(1, Math.ceil(leads.length / perPage));
  const paginated = leads.slice((page - 1) * perPage, page * perPage);

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

        {!loading && leads.length > 0 && selectedIds.size > 0 && (
          <button
            onClick={handleBulkCall}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shrink-0 shadow-sm"
          >
            Bulk Call ({selectedIds.size})
          </button>
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
                    <code className={`px-2 py-0.5 rounded font-mono ${String(s.status).toLowerCase() === status.toLowerCase()
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
                  <th className="px-5 py-4 w-12 text-center">
                    <input
                      type="checkbox"
                      className="rounded text-blue-600 cursor-pointer w-4 h-4 outline-none"
                      checked={paginated.length > 0 && paginated.every(l => selectedIds.has(l._id))}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setSelectedIds(prev => {
                          const newSet = new Set(prev);
                          paginated.forEach(l => isChecked ? newSet.add(l._id) : newSet.delete(l._id));
                          return newSet;
                        });
                      }}
                    />
                  </th>
                  {cols.map((col) => (
                    <th key={col.key} className="px-5 py-4 whitespace-nowrap">{col.label}</th>
                  ))}
                  <th className="px-5 py-4 text-right min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((lead, i) => {
                  const isActive = activeCalls.has(lead._id);
                  const result = callResults[lead._id];

                  return (
                    <tr key={String(lead._id ?? i)} className={`transition-colors ${selectedIds.has(lead._id) ? 'bg-blue-50/40' : 'hover:bg-slate-50/60'}`}>
                      <td className="px-5 py-4 text-center">
                        <input
                          type="checkbox"
                          className="rounded text-blue-600 cursor-pointer w-4 h-4 outline-none"
                          checked={selectedIds.has(lead._id)}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setSelectedIds(prev => {
                              const newSet = new Set(prev);
                              isChecked ? newSet.add(lead._id) : newSet.delete(lead._id);
                              return newSet;
                            });
                          }}
                        />
                      </td>
                      {cols.map((col) => (
                        <td key={col.key} className="px-5 py-4 text-slate-700">
                          <CellValue col={col} value={lead[col.key]} />
                        </td>
                      ))}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        {isActive ? (
                          <span className="text-xs font-medium text-blue-500 flex items-center gap-1 justify-end animate-pulse">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Calling...
                          </span>
                        ) : (
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => handleCall(lead)}
                              className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
                            >
                              Call
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const r = await fetch(`${API_BASE}/leads/${encodeURIComponent(lead['Enquiry Code'])}`);
                                  const d = await r.json();
                                  setViewLead(d.success ? d.data : lead);
                                } catch {
                                  setViewLead(lead);
                                }
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              View
                            </button>
                          </div>
                        )}
                        {result && !isActive && (
                          <div className={`text-[10px] mt-1 pr-1 font-medium ${result.ok ? 'text-green-600' : 'text-red-500'}`}>
                            {result.msg}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
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
