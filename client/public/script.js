document.addEventListener('DOMContentLoaded', () => {
    // Socket.io initialization
    try {
        const socket = io();
        socket.on('call_completed', () => {
            console.log('Call completed event received, auto-refreshing dashboard...');
            fetchExecutions();
        });
    } catch (err) {
        console.warn('Socket.io failed to initialize:', err);
    }

    const refreshBtn = document.getElementById('refreshBtn');

    // Analytics Elements
    const statTotalExecutions = document.getElementById('statTotalExecutions');
    const statAvgDuration = document.getElementById('statAvgDuration');
    const statTotalCost = document.getElementById('statTotalCost');

    // Filter Elements
    const searchId = document.getElementById('searchId');
    const filterStatus = document.getElementById('filterStatus');
    const filterType = document.getElementById('filterType');
    const filterProvider = document.getElementById('filterProvider');

    // Table Elements
    const tableBody = document.getElementById('tableBody');
    const tableLoader = document.getElementById('tableLoader');
    const noDataMessage = document.getElementById('noDataMessage');

    let allExecutions = [];

    // --- Execution Data Logic ---
    const formatDuration = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0s';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        const d = new Date(isoString);
        return d.toLocaleString();
    };

    const fetchExecutions = async () => {
        tableLoader.classList.remove('hidden');
        let url = '/api/executions';

        try {
            const response = await fetch(url);
            const resData = await response.json();

            console.log('--- FRONTEND RECEIVED API DATA ---');
            console.log(resData);

            if (response.ok && resData.success) {
                // Determine format of execution data
                if (Array.isArray(resData.data)) {
                    allExecutions = resData.data;
                } else if (resData.data && Array.isArray(resData.data.data)) {
                    // bolna paginated response might wrap in { data: [...] } inside main { data }
                    allExecutions = resData.data.data;
                } else if (resData.data && resData.data.executions && Array.isArray(resData.data.executions)) {
                    // Another common pagination wrap
                    allExecutions = resData.data.executions;
                } else if (Array.isArray(resData.data.executions)) {
                    allExecutions = resData.data.executions;
                } else {
                    console.warn("Unexpected API structure, checking keys:", Object.keys(resData.data || {}));
                    allExecutions = [];
                }

                updateAnalytics();
                renderTable();
            } else {
                console.error("Failed to fetch executions", resData);
            }
        } catch (error) {
            console.error("Error fetching executions:", error);
        } finally {
            tableLoader.classList.add('hidden');
        }
    };

    const updateAnalytics = () => {
        if (!Array.isArray(allExecutions)) return;

        statTotalExecutions.textContent = allExecutions.length;

        let completed = 0;
        let noAnswer = 0;
        let busy = 0;
        let failed = 0;
        let totalDuration = 0;
        let totalCost = 0;

        allExecutions.forEach(exec => {
            const status = (exec.status || exec.smart_status || exec.call_status || '').toLowerCase();
            if (status.includes('completed')) completed++;
            else if (status.includes('no-answer') || status.includes('no answer') || status === 'unanswered' || status.includes('timeout')) noAnswer++;
            else if (status.includes('busy')) busy++;
            else if (status.includes('failed') || status.includes('error')) failed++;

            if (exec.duration || exec.telephony_data?.duration) {
                totalDuration += parseFloat(exec.telephony_data?.duration || exec.duration || 0);
            }
            if (exec.cost) {
                totalCost += parseFloat(exec.cost);
            }
        });

        document.getElementById('statCompleted').textContent = `Completed: ${completed}`;
        document.getElementById('statNoAnswer').textContent = `No Answer: ${noAnswer}`;
        document.getElementById('statBusy').textContent = `Busy: ${busy}`;
        document.getElementById('statFailed').textContent = `Failed: ${failed}`;

        // Convert USD cost assuming ₹83 per USD as requested
        if (statTotalCost) statTotalCost.textContent = `₹${(totalCost * 83).toFixed(2)}`;

        const avgDur = allExecutions.length ? (totalDuration / allExecutions.length) : 0;
        if (statAvgDuration) statAvgDuration.textContent = formatDuration(avgDur);
    };

    const renderTable = () => {
        // Filter logic
        const sQuery = searchId.value.toLowerCase().trim();
        const fStatus = filterStatus.value.toLowerCase();
        const fType = filterType.value.toLowerCase();
        const fProvider = filterProvider.value.toLowerCase();

        const filtered = allExecutions.filter(exec => {
            const execId = (exec.id || '').toLowerCase();
            const number = (exec.user_number || '').toLowerCase();
            const leadName = (exec.lead_name || '').toLowerCase();
            const leadCode = (exec.lead_code || '').toLowerCase();
            const status = (exec.status || '').toLowerCase();
            const type = (exec.conversation_type || '').toLowerCase();

            const matchesSearch = execId.includes(sQuery) ||
                number.includes(sQuery) ||
                leadName.includes(sQuery) ||
                leadCode.includes(sQuery);
            const matchesStatus = !fStatus || status === fStatus || (fStatus === 'in-progress' && status === 'queued');
            const matchesType = !fType || type.includes(fType);
            const matchesProvider = !fProvider || provider.includes(fProvider);

            return matchesSearch && matchesStatus && matchesType && matchesProvider;
        });

        tableBody.innerHTML = '';

        if (filtered.length === 0) {
            noDataMessage.classList.remove('hidden');
        } else {
            noDataMessage.classList.add('hidden');

            filtered.forEach(ex => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors';

                const created = ex.created_at || ex.timestamp;
                const statusStr = (ex.status || ex.call_status || 'Unknown').replace('_', ' ');
                const statusColor = statusStr.includes('completed') ? 'text-emerald-600 bg-emerald-50' :
                    statusStr.includes('failed') ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50';

                // We safely access items considering varying bolna API versions
                tr.innerHTML = `
                    <td class="px-6 py-4">
                        <div class="font-medium text-slate-900">${(ex.id || 'N/A').substring(0, 15)}...</div>
                        <div class="text-xs text-slate-500 mt-1">${formatDate(created)}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-[11px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded inline-block mb-1">${ex.lead_code || 'N/A'}</div>
                        <div class="text-xs font-semibold text-slate-700 mt-0.5 flex items-center gap-1">📞 ${ex.user_number || 'N/A'}</div>
                        <div class="text-xs text-slate-500 mt-1 font-medium truncate max-w-[150px]">${ex.lead_name || 'N/A'}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="uppercase text-xs font-semibold text-slate-500 tracking-wider">
                            ${ex.conversation_type || ex.call_type || 'OUTBOUND'}
                        </div>
                        <div class="text-xs font-medium text-slate-500 mt-1 capitalize p-1 bg-slate-100 rounded inline-block">
                            ${ex.lead_status || 'Status Unknown'}
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-sm font-semibold text-slate-800 flex items-center gap-1">
                            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            ${ex.telephony_data?.duration || ex.conversation_duration || ex.duration || '0.0'}
                        </div>
                    </td>
                    <td class="px-6 py-4 text-sm font-medium text-slate-600 capitalize">
                        ${ex.telephony_data?.hangup_by || ex.hangup_by || 'Unknown'}
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-sm font-semibold text-slate-900 mb-1">
                            ₹${(parseFloat(ex.cost || 0.00) * 83).toFixed(2)}
                        </div>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${statusColor}">
                            ${statusStr}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right text-sm space-y-1">
                        ${(ex.recording_url) ? `<a href="${ex.recording_url}" target="_blank" class="block text-blue-600 hover:underline">🔊 Audio</a>` : '<span class="block text-slate-300">No Audio</span>'}
                        ${ex.has_transcript ? `<button class="block ml-auto text-blue-600 hover:underline text-left mt-1 font-medium" onclick="window.showTranscript('${ex.id || ex.execution_id}')">📄 Transcript</button>` : ''}
                        ${(ex.extracted_data && Object.keys(ex.extracted_data).length > 0) ? `<button class="block ml-auto text-purple-600 hover:underline text-left mt-1 font-medium" onclick="window.showAnalytics('${ex.id || ex.execution_id}')">📊 Analytics</button>` : ''}
                        <button class="block ml-auto text-slate-400 hover:text-slate-800 text-left mt-1 text-xs" onclick="console.log(${JSON.stringify(ex).replace(/"/g, '&quot;')}); alert('Check Developer Console For Raw JSON')">Raw JSON</button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        }
    };

    // Event Listeners for Filters
    searchId.addEventListener('input', renderTable);
    filterStatus.addEventListener('change', renderTable);
    filterType.addEventListener('change', renderTable);
    filterProvider.addEventListener('change', renderTable);

    // Refresh Button Event Area
    if (refreshBtn) {
        // Setup a styled refresh transition
        // I won't do a full refresh text rotation on dom load for simplicity but I'll add the spin explicitly
        const refreshIcon = refreshBtn.querySelector('svg');
        refreshBtn.addEventListener('click', async () => {
            refreshIcon.classList.add('animate-spin');
            refreshBtn.classList.add('opacity-50', 'pointer-events-none');
            await fetchExecutions();
            refreshIcon.classList.remove('animate-spin');
            refreshBtn.classList.remove('opacity-50', 'pointer-events-none');
        });
    }

    // --- Global Modal Handlers setup ---
    window.showTranscript = async (id) => {
        const row = allExecutions.find(e => (e.id === id || e.execution_id === id));
        if (row && row.has_transcript) {
            const transcriptContent = document.getElementById('transcriptContent');
            transcriptContent.textContent = 'Loading transcript...';
            document.getElementById('transcriptModal').classList.remove('hidden');

            try {
                const res = await fetch(`/api/transcript/${id}`);
                const data = await res.json();
                if (data.success) {
                    transcriptContent.textContent = data.transcript;
                } else {
                    transcriptContent.textContent = data.error || 'Failed to load transcript.';
                }
            } catch (err) {
                transcriptContent.textContent = 'Error loading transcript.';
            }
        }
    };

    window.showAnalytics = (id) => {
        const row = allExecutions.find(e => (e.id === id || e.execution_id === id));
        if (row && row.extracted_data) {
            document.getElementById('analyticsContent').textContent = JSON.stringify(row.extracted_data, null, 2);
            document.getElementById('analyticsModal').classList.remove('hidden');
        }
    };

    // Initial load
    fetchExecutions();
});
