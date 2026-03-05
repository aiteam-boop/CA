document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const callButton = document.getElementById('callButton');
    const phoneInput = document.getElementById('phone');
    const agentIdInput = document.getElementById('agentId');
    const btnText = document.querySelector('.btn-text');
    const callLoader = document.getElementById('callLoader');
    const statusMessage = document.getElementById('statusMessage');
    const refreshBtn = document.getElementById('refreshBtn');

    // Analytics Elements
    const statTotalExecutions = document.getElementById('statTotalExecutions');
    const statCompleted = document.getElementById('statCompleted');
    const statInProgress = document.getElementById('statInProgress');
    const statTotalDuration = document.getElementById('statTotalDuration');
    const statAvgDuration = document.getElementById('statAvgDuration');

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

    // --- Initiation Call Logic ---
    const showStatus = (message, type) => {
        statusMessage.textContent = message;
        statusMessage.className = `p-4 rounded-xl text-sm font-medium text-center ${type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
            }`;
        statusMessage.classList.remove('hidden');

        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 5000);
    };

    const setLoading = (isLoading) => {
        if (isLoading) {
            callButton.disabled = true;
            callButton.classList.add('opacity-75', 'cursor-not-allowed');
            btnText.classList.add('hidden');
            callLoader.classList.remove('hidden');
        } else {
            callButton.disabled = false;
            callButton.classList.remove('opacity-75', 'cursor-not-allowed');
            btnText.classList.remove('hidden');
            callLoader.classList.add('hidden');
        }
    };

    callButton.addEventListener('click', async () => {
        const phoneNumber = phoneInput.value.trim();
        const agentId = agentIdInput.value.trim();

        if (!phoneNumber) {
            showStatus('Please enter a valid phone number.', 'error');
            phoneInput.focus();
            return;
        }

        setLoading(true);
        statusMessage.classList.add('hidden');

        try {
            const response = await fetch('/api/call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient_phone_number: phoneNumber,
                    agent_id: agentId || undefined
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showStatus('Call initiated successfully! Your phone should ring soon.', 'success');
                // Auto refresh executions after a brief delay
                setTimeout(fetchExecutions, 2000);
            } else {
                showStatus(`Failed to initiate call: ${data.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error('Error triggering call:', error);
            showStatus('Network error. Please try again later.', 'error');
        } finally {
            setLoading(false);
        }
    });

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
        const agentId = agentIdInput.value.trim();
        let url = '/api/executions';
        if (agentId) url += `?agent_id=${agentId}`;

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
        let inProgress = 0;
        let totalDuration = 0;

        allExecutions.forEach(exec => {
            const status = (exec.status || exec.smart_status || exec.call_status || '').toLowerCase();
            if (status === 'completed') completed++;
            else if (status === 'in_progress' || status === 'in-progress' || status === 'queued' || status === 'busy') inProgress++;

            if (exec.conversation_duration) {
                totalDuration += parseFloat(exec.conversation_duration);
            } else if (exec.conversation_time || exec.duration) {
                totalDuration += parseFloat(exec.conversation_time || exec.duration);
            }
        });

        statCompleted.textContent = `Completed: ${completed}`;
        statInProgress.textContent = `In Progress: ${inProgress}`;

        statTotalDuration.textContent = formatDuration(totalDuration);
        const avgDur = allExecutions.length ? (totalDuration / allExecutions.length) : 0;
        statAvgDuration.textContent = formatDuration(avgDur);
    };

    const renderTable = () => {
        // Filter logic
        const sQuery = searchId.value.toLowerCase().trim();
        const fStatus = filterStatus.value.toLowerCase();
        const fType = filterType.value.toLowerCase();
        const fProvider = filterProvider.value.toLowerCase();

        const filtered = allExecutions.filter(exec => {
            const execId = (exec.id || exec.execution_id || '').toLowerCase();
            const number = (exec.user_number || exec.recipient_phone_number || '').toLowerCase();
            const status = (exec.status || exec.call_status || '').toLowerCase();
            const type = (exec.conversation_type || exec.call_type || '').toLowerCase();
            const provider = (exec.provider || '').toLowerCase();

            const matchesSearch = execId.includes(sQuery) || number.includes(sQuery);
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
                        <div class="font-medium text-slate-900">${(ex.id || ex.execution_id || 'N/A').substring(0, 15)}...</div>
                        <div class="text-xs text-slate-500 mt-1">${formatDate(created)}</div>
                    </td>
                    <td class="px-6 py-4 font-medium">${ex.user_number || ex.recipient_phone_number || 'N/A'}</td>
                    <td class="px-6 py-4">
                        <div class="uppercase text-xs font-semibold text-slate-500 tracking-wider">
                            ${ex.conversation_type || ex.call_type || 'OUTBOUND'}
                        </div>
                        <div class="text-xs text-slate-400 mt-1 capitalize">
                            ${ex.provider || 'unknown provider'}
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor}">
                            ${statusStr}
                        </span>
                        <div class="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            ${formatDuration(ex.conversation_duration || ex.conversation_time || ex.duration || ex.telephony_data?.duration)}
                        </div>
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-600 capitalize">
                        ${ex.telephony_data?.hangup_by || ex.hangup_by || 'Unknown'}
                    </td>
                    <td class="px-6 py-4 text-right text-sm space-y-1">
                        ${(ex.telephony_data?.recording_url || ex.recording_url) ? `<a href="${ex.telephony_data?.recording_url || ex.recording_url}" target="_blank" class="block text-blue-600 hover:underline">🔊 Audio</a>` : '<span class="block text-slate-300">No Audio</span>'}
                        ${ex.transcript ? `<button class="block ml-auto text-blue-600 hover:underline text-left mt-1 font-medium" onclick="window.showTranscript('${ex.id || ex.execution_id}')">📄 Transcript</button>` : ''}
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
    window.showTranscript = (id) => {
        const row = allExecutions.find(e => (e.id === id || e.execution_id === id));
        if (row && row.transcript) {
            document.getElementById('transcriptContent').textContent = row.transcript;
            document.getElementById('transcriptModal').classList.remove('hidden');
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
