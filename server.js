const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');

// Set up socket.io
const http = require('http');
const { Server } = require('socket.io');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));
app.use(express.json());
app.use(cors());

const BOLNA_API_KEY = process.env.BOLNA_API_KEY;
const BOLNA_API_URL = process.env.BOLNA_API_URL || 'https://api.bolna.ai/call';
const BOLNA_FROM_NUMBER = process.env.BOLNA_FROM_NUMBER || null;

const MONGODB_URI = process.env.MONGODB_URI;
let db = null;

async function connectDB() {
    if (db) return db;
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db();
        console.log('Connected to MongoDB');
        return db;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

// ── Lead Master endpoints ─────────────────────────────────────────────────────

const SORT_BY_STATUS = {
    potential: { Date: -1 },
    new: { Date: -1 },
    'srf/mql': { SRF_MQL_Date: -1 },
    sql: { SQL_Date: -1 },
    followup: { Follow_Up_Date: -1 },
    'follow up': { Follow_Up_Date: -1 },
    lost: { Date: -1 },
    po: { Date: -1 },
};

// Statuses with multiple spellings.  Keys are lowercase.
const STATUS_REGEX_MAP = {
    followup: 'follow[\\s_-]?up',
    'follow up': 'follow[\\s_-]?up',
};

function buildStatusRegex(statusValue) {
    const key = statusValue.toLowerCase();
    const pattern = STATUS_REGEX_MAP[key] || statusValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: `^${pattern}$`, $options: 'i' };
}

// GET /api/leads?status=Potential|SRF/MQL|SQL|Followup|Lost&agent=<Lead_Owner>&search=<text>
app.get('/api/leads', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('leads_master');

        const { status, agent, search } = req.query;

        if (!status) {
            return res.status(400).json({ success: false, error: 'status query param is required.' });
        }

        // Query the 'Status' field (capital S) — the primary CRM field
        const query = { Status: buildStatusRegex(status) };

        if (agent && agent !== 'All Agents') {
            query['Lead_Owner'] = { $regex: `^${agent}$`, $options: 'i' };
        }

        if (search && search.trim()) {
            const regex = { $regex: search.trim(), $options: 'i' };
            query['$or'] = [
                { 'Client_Company_Name': regex },
                { 'Client_Person_Name': regex },
                { 'Client_Number': regex },
                { 'Enquiry Code': regex },
                { 'Lead_Owner': regex },
            ];
        }

        const sortOrder = SORT_BY_STATUS[status.toLowerCase()] || { _id: -1 };

        const leads = await collection
            .find(query)
            .sort(sortOrder)
            .toArray();

        res.json({ success: true, data: leads, count: leads.length });
    } catch (error) {
        console.error('Error fetching leads:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch leads.' });
    }
});

// GET /api/leads/agents – distinct Lead_Owner values, optionally scoped to a Status
app.get('/api/leads/agents', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('leads_master');

        const filter = { Lead_Owner: { $exists: true, $ne: null, $ne: '' } };

        if (req.query.status) {
            filter.Status = buildStatusRegex(req.query.status);
        }

        const agents = await collection.distinct('Lead_Owner', filter);

        res.json({ success: true, data: agents.filter(Boolean).sort() });
    } catch (error) {
        console.error('Error fetching agents:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch agents.' });
    }
});

// GET /api/leads/debug – shows all distinct Status values + counts
app.get('/api/leads/debug', async (req, res) => {
    try {
        const database = await connectDB();
        const collection = database.collection('leads_master');

        const [statusAgg, total, sample] = await Promise.all([
            collection.aggregate([
                { $group: { _id: '$Status', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]).toArray(),
            collection.countDocuments(),
            collection.findOne(),
        ]);

        res.json({
            success: true,
            totalDocuments: total,
            statusBreakdown: statusAgg.map((s) => ({ status: s._id, count: s.count })),
            sampleFieldNames: sample ? Object.keys(sample) : [],
        });
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Call prompt routing ───────────────────────────────────────────────────────

const STAGE_AGENT_MAP = {
    fresh: process.env.FRESH_CALL_AGENT_ID || process.env.AGENT_ID,
    mql: process.env.MQL_CALL_AGENT_ID || process.env.AGENT_ID,
    sql: process.env.SQL_CALL_AGENT_ID || process.env.AGENT_ID,
    followup: process.env.FOLLOWUP_CALL_AGENT_ID || process.env.AGENT_ID,
    potential: process.env.Potential_CALL || process.env.AGENT_ID,
};

function resolveCallType(status) {
    if (!status) return 'fresh';
    const s = status.toLowerCase().replace(/[\s_\-/]+/g, '');
    if (s === 'potential') return 'potential';
    if (s === 'srfmql' || s === 'mql') return 'mql';
    if (s === 'sql') return 'sql';
    if (s.startsWith('follow')) return 'followup';
    return 'fresh';
}

/**
 * Select the correct agent ID based on lead status.
 * Maps: "Follow Up" → FOLLOWUP_AGENT_ID, "SRF/MQL" → MQL_AGENT_ID,
 *        "SQL" → MQL_AGENT_ID, else → FRESH_AGENT_ID
 */
function getAgentIdByStatus(status) {
    if (!status) return STAGE_AGENT_MAP.fresh;
    const s = status.toLowerCase().replace(/[\s_\-/]+/g, '');
    if (s === 'potential') return STAGE_AGENT_MAP.potential;
    if (s.startsWith('follow')) return STAGE_AGENT_MAP.followup;
    if (s === 'srfmql' || s === 'mql') return STAGE_AGENT_MAP.mql;
    if (s === 'sql') return STAGE_AGENT_MAP.sql;
    return STAGE_AGENT_MAP.fresh;
}

function resolveAgentId(callType, clientAgentId) {
    return STAGE_AGENT_MAP[callType] || clientAgentId || process.env.AGENT_ID;
}

function buildLeadContext(lead) {
    return {
        company_name: lead.Client_Company_Name || '',
        contact_name: lead.Client_Person_Name || '',
        phone_number: lead.Client_Number || '',
        email: lead.Client_Mail_ID || '',
        product: lead.Product || '',
        location: lead.Location || '',
        quantity: lead.Quantity ?? '',
        industry: lead.Industry || '',
        lead_type: lead.Lead_Type || '',
        remarks: lead.Remarks || '',
        lead_owner: lead.Lead_Owner || '',
        enquiry_code: lead['Enquiry Code'] || '',
        status: lead.Status || '',
    };
}

/**
 * Transform raw CRM remarks into a natural context briefing
 * that the AI agent can use conversationally.
 * The agent should use this as background knowledge, NOT read it aloud.
 */
function buildCallContext(leadContext) {
    const parts = [];

    if (leadContext.contact_name) {
        parts.push(`You are calling ${leadContext.contact_name}`);
        if (leadContext.company_name) parts[0] += ` from ${leadContext.company_name}`;
        parts[0] += '.';
    }

    // Summarize what the client is interested in
    const interests = [];
    if (leadContext.product) interests.push(leadContext.product);
    if (leadContext.quantity) interests.push(`quantity: ${leadContext.quantity}`);
    if (leadContext.location) interests.push(`location: ${leadContext.location}`);

    if (interests.length > 0) {
        parts.push(`The client has previously shown interest in ${interests.join(', ')}.`);
    }

    if (leadContext.remarks) {
        parts.push(`Previous notes: ${leadContext.remarks}`);
    }

    return parts.join(' ');
}

function normalizePhone(raw) {
    let phone = String(raw).replace(/[\s\-()]/g, '');
    if (/^\d{10}$/.test(phone)) phone = '+91' + phone;
    else if (/^91\d{10}$/.test(phone)) phone = '+' + phone;
    return phone;
}

// ── Call endpoints ────────────────────────────────────────────────────────────

app.post('/api/call', async (req, res) => {
    let { recipient_phone_number, lead_data, section_name } = req.body;

    if (!recipient_phone_number) {
        return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    recipient_phone_number = normalizePhone(recipient_phone_number);

    try {
        const database = await connectDB();
        const collection = database.collection('leads_master');

        // Step 1: Fetch the real lead from MongoDB for accurate status + fields
        const enquiryCode = lead_data?.enquiry_code || null;
        let dbLead = null;
        if (enquiryCode) {
            dbLead = await collection.findOne({ 'Enquiry Code': enquiryCode });
        }

        // Step 2: Determine call type & agent from the DB lead's actual Status
        const leadStatus = dbLead?.Status || lead_data?.status || '';
        const callType = resolveCallType(leadStatus);
        const agent_id = getAgentIdByStatus(leadStatus);

        if (!agent_id) {
            return res.status(400).json({ success: false, error: 'No agent ID resolved for this call type.' });
        }

        // Step 3: Build enriched context from DB lead (falls back to client data)
        const leadContext = dbLead ? buildLeadContext(dbLead) : (lead_data || {});

        // Step 4: Build Bolna payload with CRM variables injected via user_data
        // These variables are referenced in the agent prompt as {name}, {company_name}, etc.
        // IMPORTANT: remarks are transformed into a call_context so the agent doesn't read them verbatim
        const callContext = buildCallContext(leadContext);

        const bolnaPayload = {
            agent_id,
            recipient_phone_number,
            phone_number: recipient_phone_number, // Added for newer .ai API support
            user_data: {
                // Primary CRM variables the agent prompt references
                name: leadContext.contact_name || '',
                company_name: leadContext.company_name || '',
                product: leadContext.product || '',
                location: leadContext.location || '',
                quantity: leadContext.quantity || '',
                // Natural context briefing (NOT raw remarks)
                call_context: callContext,
                // Additional context
                call_type: callType,
                enquiry_code: leadContext.enquiry_code || '',
            },
        };

        // Use the purchased caller number if configured
        if (BOLNA_FROM_NUMBER) {
            bolnaPayload.from_phone_number = BOLNA_FROM_NUMBER;
        }

        console.log(`\n=== INITIATING CALL ===`);
        console.log(`Section:   ${section_name || 'unknown'}`);
        console.log(`Call Type: ${callType.toUpperCase()}`);
        console.log(`Agent:     ${agent_id}`);
        console.log(`Phone:     ${recipient_phone_number}`);
        console.log(`From:      ${BOLNA_FROM_NUMBER || 'Bolna default'}`);
        console.log(`Lead:      ${leadContext.enquiry_code} – ${leadContext.company_name}`);
        console.log(`Status:    ${leadStatus}`);
        console.log(`Variables: name=${leadContext.contact_name}, company_name=${leadContext.company_name}, product=${leadContext.product}, location=${leadContext.location}`);
        console.log(`Context:   ${callContext}`);
        console.log(`========================\n`);

        // Record initiation in lead document history immediately
        if (dbLead) {
            await collection.updateOne(
                { 'Enquiry Code': enquiryCode },
                {
                    $push: {
                        ai_calls: {
                            date: new Date(),
                            call_type: callType.toUpperCase(),
                            call_status: 'Initiated',
                            summary: 'AI Call initiated by system...',
                            recording_url: null,
                            transcript: null
                        }
                    }
                }
            ).catch(err => console.error('Failed to log initiation to lead:', err.message));
        }

        const url = BOLNA_API_URL;
        let response = null;
        let data = null;
        let lastErrorMsg = '';

        // Added Retry Logic for 502 / 504 Gateway errors
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // Implementing abort controller for timeout control (30 seconds)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${BOLNA_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(bolnaPayload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                const rawText = await response.text();
                lastErrorMsg = rawText;

                // Check for HTML Gateway error replies before JSON parsing
                if (rawText.trim().toLowerCase().startsWith('<!doctype') || rawText.trim().toLowerCase().startsWith('<html')) {
                    console.error(`Bolna Gateway Error (Attempt ${attempt}): Received HTML instead of JSON:`, rawText.substring(0, 100));
                    throw new Error("Received HTML error from Bolna gateway");
                }

                try {
                    data = JSON.parse(rawText);
                } catch {
                    throw new Error(`Invalid JSON format from Bolna: ${rawText.substring(0, 100)}`);
                }

                // If response is OK, break the retry loop early
                if (response.ok) {
                    break;
                } else if (response.status >= 500) {
                    // Force retry on 50x errors
                    throw new Error(`Bolna Server Error: ${response.status}`);
                } else {
                    // 4xx client errors shouldn't be retried
                    break;
                }

            } catch (err) {
                console.log(`[Bolna Call] Try ${attempt} Failed: ${err.message}`);
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 2000)); // wait 2 seconds before retry
                }
            }
        }

        // If 'data' is still null, it completely failed all retries
        if (!data) {
            data = { message: `Bolna failed after retries. Last error: ${lastErrorMsg.substring(0, 50)}...` };
        }

        try {
            await database.collection('call_logs').insertOne({
                call_time: new Date(),
                lead_enquiry_code: enquiryCode,
                agent_id,
                call_type: callType,
                section_name: section_name || null,
                recipient_phone: recipient_phone_number,
                lead_context: leadContext,
                variables_sent: bolnaPayload.user_data,
                call_status: (response && response.ok) ? 'initiated' : 'failed',
                bolna_response: data,
            });
        } catch (logErr) {
            console.error('Failed to write call log:', logErr.message);
        }

        if (!response || !response.ok) {
            console.error('Bolna API Error finalized as failed:', data);
            return res.status(response ? response.status : 502).json({ success: false, error: data.message || 'Call failed due to Bolna gateway error' });
        }

        res.json({
            success: true,
            message: 'Call initiated successfully!',
            call_type: callType,
            agent_id,
            execution_id: data.execution_id || data.id || null,
            data,
        });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error while reaching Bolna.' });
    }
});

// ── Get execution details (transcript) from Bolna ────────────────────────────

app.get('/api/execution/:executionId', async (req, res) => {
    const { executionId } = req.params;

    if (!executionId) {
        return res.status(400).json({ success: false, error: 'execution ID is required.' });
    }

    try {
        const response = await fetch(`https://api.bolna.ai/executions/${executionId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${BOLNA_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        let data;
        const rawText = await response.text();
        try {
            data = JSON.parse(rawText);
        } catch {
            console.error('Bolna execution detail returned non-JSON:', rawText.substring(0, 300));
            data = { message: rawText || 'Invalid response' };
        }

        if (!response.ok) {
            return res.status(response.status).json({ success: false, error: data.message || 'Failed to fetch execution' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('Execution fetch error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch execution details.' });
    }
});

// ── Fetch transcript from Bolna with retry ──────────────────────────────────
// Helper: tries to get the transcript from Bolna with retries (it may not be
// available immediately after the call ends).

async function fetchTranscriptFromBolna(executionId, retries = 12, delayMs = 5000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Try single execution detail endpoint first
            const execResponse = await fetch(`https://api.bolna.ai/executions/${executionId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${BOLNA_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!execResponse.ok) {
                console.error(`[Bolna Fetch] Attempt ${attempt}: API returned ${execResponse.status}`);
                if (attempt < retries) await new Promise(r => setTimeout(r, delayMs));
                continue;
            }

            const rawText = await execResponse.text();
            let bolna;
            try { bolna = JSON.parse(rawText); } catch { continue; }

            if (!bolna) continue;

            // Log response structure for debugging
            console.log(`[Bolna Fetch] Attempt ${attempt} – top keys: ${Object.keys(bolna).join(', ')}`);

            // The Bolna response structure may vary:
            // Direct: { transcript, summary, recording_url, ... }
            // Wrapped: { data: { transcript, summary, ... } }
            // Or the execution list: { data: [ { id, transcript, ... } ] }
            const entry = bolna.data && !Array.isArray(bolna.data) ? bolna.data : bolna;

            // Try many possible field paths for transcript
            let raw = entry.transcript
                || entry.conversation_transcript
                || entry.transcription
                || entry.conversation
                || entry.messages
                || entry.call_transcript
                || entry.context?.transcript
                || entry.call_details?.transcript
                || '';

            // Handle array of messages
            let transcript = '';
            if (Array.isArray(raw)) {
                transcript = raw
                    .map(msg => {
                        const role = msg.role || msg.speaker || msg.agent || 'unknown';
                        const text = msg.content || msg.text || msg.message || '';
                        return `${role}: ${text}`;
                    })
                    .join('\n');
            } else if (typeof raw === 'string') {
                transcript = raw;
            } else if (typeof raw === 'object' && raw !== null) {
                transcript = JSON.stringify(raw);
            }

            // Summary (Bolna generates this automatically)
            const summary = entry.summary || entry.call_summary || '';

            // Recording URL
            const recordingUrl = entry.recording_url
                || entry.recordingUrl
                || entry.recording
                || entry.call_details?.recording_url
                || null;

            const duration = entry.conversation_duration || entry.duration || entry.conversation_time || entry.telephony_data?.duration || 0;
            const status = entry.status || entry.call_status || entry.smart_status || 'completed';
            const callType = entry.conversation_type || entry.call_type || 'OUTBOUND';
            const hangupBy = entry.telephony_data?.hangup_by || entry.hangup_by || 'Unknown';
            const cost = entry.cost || entry.total_cost || entry.callCost || 0.00;

            console.log(`[Bolna Fetch] Attempt ${attempt}: transcript ${transcript.length} chars, summary ${summary.length} chars, recording: ${recordingUrl ? 'yes' : 'no'}`);

            if (transcript.length >= 20) {
                return { transcript, summary, recordingUrl, duration, status, callType, hangupBy, cost };
            }

            // Transcript too short — log raw response and retry
            console.log(`[Bolna Fetch] Attempt ${attempt}: short transcript. Raw (first 800): ${rawText.substring(0, 800)}`);
            if (attempt < retries) {
                console.log(`[Bolna Fetch] Retrying in ${delayMs}ms...`);
                await new Promise(r => setTimeout(r, delayMs));
            }
        } catch (err) {
            console.error(`[Bolna Fetch] Attempt ${attempt} error: ${err.message}`);
            if (attempt < retries) await new Promise(r => setTimeout(r, delayMs));
        }
    }
    return { transcript: '', summary: '', recordingUrl: null, duration: 0, status: 'failed', callType: 'OUTBOUND', hangupBy: 'Unknown', cost: 0.00 };
}

// ── Call Complete: Retrieve transcript → Extract → Update lead ────────────────
// This is a fallback for when the webhook didn't fire — it pulls the transcript
// from Bolna and runs the same pipeline.

app.post('/api/call/complete', async (req, res) => {
    const { enquiry_code, execution_id } = req.body;

    if (!enquiry_code) {
        return res.status(400).json({ success: false, error: 'enquiry_code is required.' });
    }

    try {
        const database = await connectDB();
        const collection = database.collection('leads_master');

        const lead = await collection.findOne({ 'Enquiry Code': enquiry_code });
        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead not found.' });
        }
        // Retrieve transcript from Bolna with retry logic
        let transcript = '';
        let recordingUrl = null;
        let bolnaSummary = '';
        let duration = 0;
        let status = 'completed';
        let callType = 'OUTBOUND';
        let hangupBy = 'Unknown';
        let cost = 0.00;

        if (execution_id) {
            console.log(`[Call Complete] Fetching transcript for execution ${execution_id} (with retries)...`);
            const result = await fetchTranscriptFromBolna(execution_id, 12, 5000);
            transcript = result.transcript;
            recordingUrl = result.recordingUrl;
            bolnaSummary = result.summary || '';
            duration = result.duration || 0;
            status = result.status || 'completed';
            callType = result.callType || 'OUTBOUND';
            hangupBy = result.hangupBy || 'Unknown';
            cost = result.cost || 0.00;
        }

        console.log(`[Call Complete] ${enquiry_code}: transcript retrieved (${transcript.length} chars)`);

        if (!transcript || transcript.length < 20) {
            // No meaningful transcript — store minimal entries in new fields
            const minimalAiCall = {
                date: new Date(),
                call_type: callType,
                duration: duration,
                transcript: '',
                summary: 'AI call completed – no transcript available.',
                recording_url: recordingUrl,
                call_status: status,
                hangup_by: hangupBy,
                cost: cost,
            };
            const minimalFollowup = {
                date: new Date(),
                source: 'AI Call',
                stage: lead.Status || 'Follow Up',
                remark: 'AI call completed – no transcript available.',
                transcript: '',
                recording_url: recordingUrl,
            };

            await collection.updateOne(
                { 'Enquiry Code': enquiry_code },
                {
                    $push: {
                        ai_calls: minimalAiCall,
                        followup_history: minimalFollowup,
                    },
                },
            );

            const updatedLead = await collection.findOne({ 'Enquiry Code': enquiry_code });

            // Emit socket event to update frontend dashboards without page reload
            io.emit('call_completed', { enquiry_code });

            return res.json({
                success: true,
                message: 'Call completed – no transcript to process.',
                ai_extracted: {},
                fields_updated: [],
                summary: minimalAiCall.summary,
                requirement_changes: [],
                updated_lead: updatedLead,
            });
        }

        // Run the full extraction → change detection → update pipeline
        const result = await processTranscriptAndUpdateLead(lead, transcript, database, recordingUrl, bolnaSummary, { duration, status, callType, hangupBy, cost });
        const updatedLead = await collection.findOne({ 'Enquiry Code': enquiry_code });

        // Emit socket event to update frontend dashboards without page reload
        io.emit('call_completed', { enquiry_code });

        res.json({
            success: true,
            message: 'Call completed. Transcript processed and lead updated.',
            ai_extracted: result.aiExtracted,
            fields_updated: result.fieldsUpdated,
            summary: result.summary,
            requirement_changes: result.requirementChanges,
            ai_call_entry: result.aiCallEntry,
            followup_entry: result.followupEntry,
            updated_lead: updatedLead,
        });
    } catch (error) {
        console.error('Call complete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Fast rule-based transcript parser.
 * Uses only JavaScript string matching and regex — NO external AI/LLM APIs.
 * Target execution: < 5ms.
 */
function extractLeadData(transcript) {
    const result = {};
    const text = transcript.toLowerCase();

    // ── Product Detection ────────────────────────────────────────────────────
    if (text.includes('cold storage')) result.Product = 'Cold Storage';
    else if (text.includes('cold room')) result.Product = 'Cold Room';
    else if (text.includes('reefer')) result.Product = 'Reefer Container';
    else if (text.includes('dry')) result.Product = 'Dry Container';

    // ── Size Detection ───────────────────────────────────────────────────────
    if (/20\s*ft/i.test(text)) result.Size = '20 FT';
    else if (/40\s*ft/i.test(text)) result.Size = '40 FT';

    // ── Quantity Detection ───────────────────────────────────────────────────
    const qtyMatch = text.match(/\b(\d+)\b/);
    if (qtyMatch) {
        const qty = parseInt(qtyMatch[1], 10);
        if (!(qty === 20 && result.Size === '20 FT') && !(qty === 40 && result.Size === '40 FT')) {
            result.Quantity = qty;
        } else {
            const remainingText = text.slice(text.indexOf(qtyMatch[0]) + qtyMatch[0].length);
            const nextQty = remainingText.match(/\b(\d+)\b/);
            if (nextQty) result.Quantity = parseInt(nextQty[1], 10);
        }
    }

    // ── Location Detection (city list) ───────────────────────────────────────
    const cities = [
        'mumbai', 'pune', 'chennai', 'delhi', 'kochi', 'bangalore',
        'hyderabad', 'kolkata', 'ahmedabad', 'jaipur', 'lucknow',
        'surat', 'nagpur', 'indore', 'bhopal', 'visakhapatnam',
        'patna', 'vadodara', 'goa', 'chandigarh', 'coimbatore',
        'thiruvananthapuram', 'guwahati', 'noida', 'gurugram',
        'navi mumbai', 'thane', 'ludhiana', 'mangalore', 'mysore',
    ];
    for (const city of cities) {
        if (text.includes(city)) {
            result.Location = city.replace(/\b\w/g, c => c.toUpperCase());
            break;
        }
    }

    // ── Timeline Detection ───────────────────────────────────────────────────
    const timeMatch = text.match(/(?:within|in|by|before|next|after)\s+(\d+\s*(?:day|week|month|year)s?)/i)
        || text.match(/(?:by|before|in)\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i)
        || text.match(/(urgent|immediate|asap|immediately)/i);
    if (timeMatch) result.Timeline = timeMatch[0].trim();

    return result;
}

/**
 * Build a human-readable summary from extracted data and changes.
 */
function generateSummary(extracted, changes, lead) {
    const parts = [];

    if (changes.length > 0) {
        parts.push('Client confirmed updated requirement.');
        for (const c of changes) {
            if (c.field === 'Product' && c.oldValue) {
                parts.push(`${c.newValue} instead of ${c.oldValue}.`);
            } else if (c.field === 'Product') {
                parts.push(`Product: ${c.newValue}.`);
            } else if (c.field === 'Quantity') {
                parts.push(`Quantity: ${c.newValue}.`);
            } else if (c.field === 'Location') {
                parts.push(`Location: ${c.newValue}.`);
            } else if (c.field === 'Size') {
                parts.push(`Size: ${c.newValue}.`);
            } else if (c.field === 'Timeline') {
                parts.push(`Timeline: ${c.newValue}.`);
            }
        }
    } else {
        // No changes, build summary from what was detected
        const items = [];
        if (extracted.Product) items.push(`Product: ${extracted.Product}`);
        if (extracted.Quantity) items.push(`Quantity: ${extracted.Quantity}`);
        if (extracted.Location) items.push(`Location: ${extracted.Location}`);
        if (extracted.Size) items.push(`Size: ${extracted.Size}`);
        if (extracted.Timeline) items.push(`Timeline: ${extracted.Timeline}`);

        if (items.length > 0) {
            parts.push('AI call completed.', items.join('. ') + '.');
        } else {
            parts.push('AI call completed – no field changes detected.');
        }
    }

    return parts.join('\n');
}

/**
 * Shared pipeline: Extract data from transcript → detect changes → update MongoDB.
 * Writes to: last_transcript, ai_calls[], followup_history[]
 * Used by both the Bolna webhook and the /api/call/complete endpoint.
 */
async function processTranscriptAndUpdateLead(lead, transcript, database, recordingUrl, bolnaSummary, extraInfo = {}) {
    const collection = database.collection('leads_master');
    const enquiryCode = lead['Enquiry Code'];

    // Step 1: Fast rule-based extraction (no external API calls)
    const startTime = Date.now();
    const aiExtracted = extractLeadData(transcript);
    const extractionMs = Date.now() - startTime;
    console.log(`[Transcript Parser] Extraction completed in ${extractionMs}ms`);

    // Step 2: Detect field changes
    const fieldMap = {
        Product: 'Product',
        Size: 'Size',
        Quantity: 'Quantity',
        Location: 'Location',
        Timeline: 'Timeline',
    };

    const $set = {};
    const changes = [];

    for (const [extractKey, dbField] of Object.entries(fieldMap)) {
        const newVal = aiExtracted[extractKey];
        if (newVal !== undefined && newVal !== null && newVal !== '') {
            const oldVal = lead[dbField];
            if (String(newVal) !== String(oldVal || '')) {
                $set[dbField] = newVal;
                changes.push({ field: dbField, oldValue: oldVal || null, newValue: newVal });
            }
        }
    }

    // Step 3: Requirement change tracking (product and size)
    const requirementChanges = [];
    if ($set.Product && lead.Product && $set.Product !== lead.Product) {
        requirementChanges.push({ old_product: lead.Product, new_product: $set.Product, date: new Date() });
    }
    if ($set.Size && lead.Size && $set.Size !== lead.Size) {
        requirementChanges.push({ old_size: lead.Size, new_size: $set.Size, date: new Date() });
    }

    // Step 4: Generate summary — prefer Bolna's auto-generated summary if available
    const ruleSummary = generateSummary(aiExtracted, changes, lead);
    const summary = bolnaSummary || ruleSummary;
    const stage = lead.Status || 'Follow Up';

    console.log(`[Transcript Pipeline] Using ${bolnaSummary ? 'Bolna' : 'rule-based'} summary (${summary.length} chars)`);

    // Step 5: Build ai_calls entry
    const aiCallEntry = {
        date: new Date(),
        call_type: extraInfo.callType || 'OUTBOUND',
        duration: extraInfo.duration || 0,
        transcript,
        summary,
        recording_url: recordingUrl || null,
        call_status: extraInfo.status || 'completed',
        hangup_by: extraInfo.hangupBy || 'Unknown',
        cost: extraInfo.cost || 0.00,
    };

    // Step 6: Build followup_history entry
    const followupEntry = {
        date: new Date(),
        source: 'AI Call',
        stage,
        remark: summary,
        transcript,
        recording_url: recordingUrl || null,
    };

    // Step 7: Persist last_transcript at top level
    $set.last_transcript = transcript;

    // Step 8: Execute single atomic MongoDB update
    const updateOps = {
        $set,
        $push: {
            ai_calls: aiCallEntry,
            followup_history: followupEntry,
        },
    };

    if (requirementChanges.length > 0) {
        updateOps.$push['requirement_change_history'] = { $each: requirementChanges };
    }

    await collection.updateOne({ 'Enquiry Code': enquiryCode }, updateOps);

    const fieldsUpdated = Object.keys($set).filter(k => k !== 'last_transcript');
    console.log(`[Transcript Pipeline] ${enquiryCode}: ${fieldsUpdated.length} fields updated, ${requirementChanges.length} requirement changes tracked.`);

    return {
        aiExtracted,
        fieldsUpdated,
        summary,
        aiCallEntry,
        followupEntry,
        requirementChanges,
        changes,
    };
}

// ── Bolna Call Webhook: receive transcript when call ends → extract → update ──

app.post('/api/bolna/call-webhook', async (req, res) => {
    const { phone_number, transcript, recording_url } = req.body;

    if (!phone_number || !transcript) {
        return res.status(400).json({
            success: false,
            error: 'phone_number and transcript are required.',
        });
    }

    try {
        const database = await connectDB();
        const collection = database.collection('leads_master');

        // Normalize the incoming phone number and build search variants
        const digits = String(phone_number).replace(/\D/g, '');
        const last10 = digits.slice(-10);

        const lead = await collection.findOne({
            $or: [
                { Client_Number: phone_number },
                { Client_Number: `+91${last10}` },
                { Client_Number: `91${last10}` },
                { Client_Number: last10 },
                { Client_Number: { $regex: `${last10}$` } },
            ],
        });

        if (!lead) {
            console.warn(`[Bolna Webhook] No lead found for phone: ${phone_number}`);
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }

        console.log(`[Bolna Webhook] Lead matched: ${lead['Enquiry Code']} – ${lead.Client_Company_Name}`);

        const extraOptions = {
            duration: req.body.duration || req.body.conversation_duration || 0,
            status: req.body.status || req.body.call_status || 'completed',
            callType: req.body.call_type || req.body.conversation_type || 'OUTBOUND',
            hangupBy: req.body.hangup_by || req.body.telephony_data?.hangup_by || 'Unknown',
            cost: req.body.cost || req.body.total_cost || 0.00
        };

        const result = await processTranscriptAndUpdateLead(lead, transcript, database, recording_url || null, null, extraOptions);
        const updatedLead = await collection.findOne({ 'Enquiry Code': lead['Enquiry Code'] });

        // Emit socket event for frontend Dashboard update
        io.emit('call_completed', { enquiry_code: lead['Enquiry Code'] });

        res.json({
            success: true,
            message: 'Transcript processed and lead updated.',
            enquiry_code: lead['Enquiry Code'],
            ai_extracted: result.aiExtracted,
            fields_updated: result.fieldsUpdated,
            summary: result.summary,
            requirement_changes: result.requirementChanges,
            ai_call_entry: result.aiCallEntry,
            followup_entry: result.followupEntry,
            updated_lead: updatedLead,
        });
    } catch (error) {
        console.error('[Bolna Webhook] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── AI Webhook: update lead with extracted data ──────────────────────────────

app.post('/api/leads/update-from-ai', async (req, res) => {
    try {
        const { enquiry_code, ...fields } = req.body;

        if (!enquiry_code) {
            return res.status(400).json({ success: false, error: 'enquiry_code is required.' });
        }

        const fieldMap = {
            company_name: 'Client_Company_Name',
            contact_name: 'Client_Person_Name',
            phone: 'Client_Number',
            email: 'Client_Mail_ID',
            product: 'Product',
            location: 'Location',
            lead_type: 'Lead_Type',
            industry: 'Industry',
            quantity: 'Quantity',
        };

        const $set = {};
        for (const [aiKey, dbField] of Object.entries(fieldMap)) {
            if (fields[aiKey] !== undefined && fields[aiKey] !== null && fields[aiKey] !== '') {
                $set[dbField] = fields[aiKey];
            }
        }

        if (Object.keys($set).length === 0) {
            return res.json({ success: true, message: 'No fields to update.' });
        }

        const database = await connectDB();
        const result = await database.collection('leads_master').updateOne(
            { 'Enquiry Code': enquiry_code },
            { $set },
        );

        console.log(`[AI Update] ${enquiry_code}: updated ${Object.keys($set).length} fields`);
        res.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
    } catch (error) {
        console.error('AI update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── AI Webhook: add follow-up remark after a call ────────────────────────────

app.post('/api/leads/add-followup', async (req, res) => {
    try {
        const { enquiry_code, call_summary, stage, transcript } = req.body;

        if (!enquiry_code) {
            return res.status(400).json({ success: false, error: 'enquiry_code is required.' });
        }

        const database = await connectDB();
        const result = await database.collection('leads_master').updateOne(
            { 'Enquiry Code': enquiry_code },
            {
                $push: {
                    'follow_up_control.entries': {
                        date: new Date(),
                        remark: call_summary || '',
                        source: 'ai_call_agent',
                        stage: stage || null,
                        transcript: transcript || '',
                    },
                },
            },
        );

        console.log(`[AI Follow-up] ${enquiry_code}: remark added`);
        res.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
    } catch (error) {
        console.error('Follow-up error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Get single lead with follow-up entries ───────────────────────────────────

app.get('/api/leads/:enquiryCode', async (req, res) => {
    try {
        const database = await connectDB();
        const lead = await database.collection('leads_master').findOne({
            'Enquiry Code': req.params.enquiryCode,
        });

        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead not found.' });
        }

        res.json({ success: true, data: lead });
    } catch (error) {
        console.error('Lead fetch error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

let cacheExecutions = { data: null, timestamp: 0 };

app.get('/api/executions', async (req, res) => {
    try {
        const database = await connectDB();

        if (cacheExecutions.data && Date.now() - cacheExecutions.timestamp < 10000 && !req.query.forceRefresh) {
            return res.json({ success: true, data: cacheExecutions.data });
        }

        const limit = parseInt(req.query.limit, 10) || 50;

        const pipeline = [
            { $sort: { call_time: -1 } },
            { $limit: limit },
            {
                $lookup: {
                    from: "leads_master",
                    localField: "lead_enquiry_code",
                    foreignField: "Enquiry Code",
                    as: "lead_info"
                }
            },
            { $unwind: { path: "$lead_info", preserveNullAndEmptyArrays: true } }
        ];

        const results = await database.collection('call_logs').aggregate(pipeline).toArray();

        const mappedResults = results.map(r => {
            let aiCall = null;
            if (r.lead_info && r.lead_info.ai_calls) {
                const logTime = new Date(r.call_time).getTime();
                // Find nearest ai_call within 15 mins after call initiation
                aiCall = r.lead_info.ai_calls.find(c => {
                    const cTime = new Date(c.date).getTime();
                    return cTime >= logTime - 60000 && cTime <= logTime + 15 * 60000;
                });
            }

            const status = aiCall ? aiCall.call_status : (r.call_status || 'Initiated');
            // Provide a composite ID so transcript fetcher can look it up correctly
            const compositeId = `${r.lead_enquiry_code}::${aiCall ? new Date(aiCall.date).toISOString() : new Date(r.call_time).toISOString()}`;

            return {
                id: compositeId,
                status: status || 'Completed',
                user_number: r.recipient_phone || 'N/A',
                conversation_type: r.call_type || 'OUTBOUND',
                created_at: r.call_time,
                duration: aiCall ? aiCall.duration : 0,
                recording_url: aiCall ? aiCall.recording_url : null,
                telephony_data: {
                    hangup_by: aiCall ? aiCall.hangup_by : 'Unknown',
                    duration: aiCall ? aiCall.duration : 0,
                },
                cost: aiCall ? (aiCall.cost || 0.00) : 0.00,
                has_transcript: !!(aiCall && aiCall.transcript && aiCall.transcript.length > 20),
                extracted_data: (aiCall && aiCall.summary) ? { summary: aiCall.summary } : {},
                lead_code: r.lead_enquiry_code,
                lead_status: r.lead_info ? r.lead_info.Status : 'Unknown',
                lead_name: r.lead_context ? r.lead_context.company_name : 'Unknown'
            };
        });

        cacheExecutions = { data: mappedResults, timestamp: Date.now() };
        res.json({ success: true, data: mappedResults });
    } catch (error) {
        console.error('Executions fetch error:', error);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// Lazy load transcript
app.get('/api/transcript/:id', async (req, res) => {
    try {
        const [leadCode, dateStr] = req.params.id.split('::');
        if (!leadCode || !dateStr) return res.status(400).json({ error: 'Invalid ID' });

        const database = await connectDB();
        const lead = await database.collection('leads_master').findOne({ 'Enquiry Code': leadCode });
        if (!lead || !lead.ai_calls) return res.status(404).json({ error: 'Not found' });

        // Find the matching AI call by date
        const call = lead.ai_calls.find(c => String(c.date) === dateStr || new Date(c.date).toISOString() === dateStr || Math.abs(new Date(c.date).getTime() - new Date(dateStr).getTime()) < 60000);
        if (!call || !call.transcript) return res.status(404).json({ error: 'Call or transcript not found' });

        res.json({ success: true, transcript: call.transcript || '' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
