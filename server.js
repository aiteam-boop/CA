const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());
app.use(cors());

const BOLNA_API_KEY = process.env.BOLNA_API_KEY;
const BOLNA_API_URL = 'https://api.bolna.dev/call';

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
    potential:    { Date: -1 },
    new:          { Date: -1 },
    'srf/mql':    { SRF_MQL_Date: -1 },
    sql:          { SQL_Date: -1 },
    followup:     { Follow_Up_Date: -1 },
    'follow up':  { Follow_Up_Date: -1 },
    lost:         { Date: -1 },
    po:           { Date: -1 },
};

// Statuses with multiple spellings.  Keys are lowercase.
const STATUS_REGEX_MAP = {
    followup:     'follow[\\s_-]?up',
    'follow up':  'follow[\\s_-]?up',
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

// ── Call endpoints ────────────────────────────────────────────────────────────

app.post('/api/call', async (req, res) => {
    const { recipient_phone_number, lead_data, section_name } = req.body;

    if (!recipient_phone_number) {
        return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const agent_id = req.body.agent_id || process.env.AGENT_ID;

    if (!agent_id) {
        return res.status(400).json({ success: false, error: 'Agent ID is required (set AGENT_ID in .env or pass it).' });
    }

    try {
        const bolnaPayload = {
            agent_id,
            recipient_phone_number,
        };

        if (lead_data && typeof lead_data === 'object') {
            bolnaPayload.user_data = lead_data;
        }

        console.log(`\n=== INITIATING CALL ===`);
        console.log(`Section: ${section_name || 'unknown'}`);
        console.log(`Agent:   ${agent_id}`);
        console.log(`Phone:   ${recipient_phone_number}`);
        if (lead_data) console.log(`Lead:    ${lead_data.enquiry_code} – ${lead_data.company_name}`);
        console.log(`========================\n`);

        const response = await fetch(BOLNA_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${BOLNA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bolnaPayload),
        });

        const data = await response.json();

        try {
            const database = await connectDB();
            await database.collection('call_logs').insertOne({
                call_time:          new Date(),
                lead_enquiry_code:  lead_data?.enquiry_code || null,
                agent_id,
                section_name:       section_name || null,
                recipient_phone:    recipient_phone_number,
                lead_data:          lead_data || null,
                call_status:        response.ok ? 'initiated' : 'failed',
                bolna_response:     data,
            });
        } catch (logErr) {
            console.error('Failed to write call log:', logErr.message);
        }

        if (!response.ok) {
            console.error('Bolna API Error:', data);
            return res.status(response.status).json({ success: false, error: data.message || 'Call failed' });
        }

        res.json({ success: true, message: 'Call initiated successfully!', data });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error while reaching Bolna.' });
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
            phone:        'Client_Number',
            email:        'Client_Mail_ID',
            product:      'Product',
            location:     'Location',
            lead_type:    'Lead_Type',
            industry:     'Industry',
            quantity:     'Quantity',
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
        const { enquiry_code, call_summary, stage } = req.body;

        if (!enquiry_code) {
            return res.status(400).json({ success: false, error: 'enquiry_code is required.' });
        }

        const database = await connectDB();
        const result = await database.collection('leads_master').updateOne(
            { 'Enquiry Code': enquiry_code },
            {
                $push: {
                    'follow_up_control.entries': {
                        date:   new Date(),
                        remark: call_summary || '',
                        source: 'ai_call_agent',
                        stage:  stage || null,
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

// ── Bolna executions ─────────────────────────────────────────────────────────

const COST_KEYS = new Set(['cost', 'total_cost', 'avgCost', 'callCost', 'totalCost']);

function stripCostFromObject(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripCostFromObject);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (COST_KEYS.has(k)) continue;
        out[k] = stripCostFromObject(v);
    }
    return out;
}

app.get('/api/executions', async (req, res) => {
    const agent_id = req.query.agent_id || process.env.AGENT_ID;

    if (!agent_id) {
        return res.status(400).json({ success: false, error: 'Agent ID is required (set AGENT_ID in .env or pass it).' });
    }

    try {
        const response = await fetch(`https://api.bolna.dev/v2/agent/${agent_id}/executions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${BOLNA_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        console.log(`\n=== BOLNA API RAW DATA (Agent: ${agent_id}) ===`);
        console.log(JSON.stringify(data, null, 2));
        console.log(`=============================================\n`);

        if (!response.ok) {
            console.error('Bolna API Error:', data);
            return res.status(response.status).json({ success: false, error: data.message || 'Failed to fetch executions' });
        }

        res.json({ success: true, data: stripCostFromObject(data) });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ success: false, error: 'Internal server error while fetching from Bolna.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
