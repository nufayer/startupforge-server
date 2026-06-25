const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');

require('dotenv').config();

const app = express();
const port = 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json());

const uri = process.env.MONGO_DB_URI;
if (!uri) {
  console.error('Missing environment variable: MONGO_DB_URI');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

let db;

async function initMongo() {
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  db = client.db('startup_forge_db');
  console.log('Connected to MongoDB!');
}

// ==================== STARTUPS ====================

app.get('/startups', async (req, res) => {
  try {
    const founderEmail = req.query.founderEmail;
    const query = founderEmail
      ? { founder_email: String(founderEmail).trim().toLowerCase() }
      : { status: { $ne: 'Deleted' } };
    const startups = await db.collection('startups').find(query).sort({ updated_at: -1 }).toArray();
    return res.json({ startups });
  } catch (err) {
    console.error('GET /startups error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/startups/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const startup = await db.collection('startups').findOne({ _id: new ObjectId(req.params.id) });
    if (!startup || startup.status === 'Deleted') return res.status(404).json({ message: 'Startup not found' });
    return res.json({ startup });
  } catch (err) {
    console.error('GET /startups/:id error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/startups', async (req, res) => {
  try {
    const founderEmail = req.headers['x-user-email'];
    if (!founderEmail) return res.status(401).json({ message: 'Unauthorized' });

    const body = req.body;
    const startup = {
      startup_name: body.startup_name,
      logo: body.logo || '',
      industry: body.industry,
      description: body.description,
      funding_stage: body.funding_stage,
      founder_email: body.founder_email || founderEmail,
      status: body.status ?? 'Active',
      created_at: new Date(),
      updated_at: new Date(),
    };
    if (!startup.startup_name || !startup.industry || !startup.description || !startup.funding_stage) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const result = await db.collection('startups').insertOne(startup);
    return res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error('POST /startups error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/startups/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const id = new ObjectId(req.params.id);
    const existing = await db.collection('startups').findOne({ _id: id });
    if (!existing) return res.status(404).json({ message: 'Startup not found' });

    const body = req.body;
    const update = {
      startup_name: body.startup_name ?? existing.startup_name,
      logo: body.logo ?? existing.logo,
      industry: body.industry ?? existing.industry,
      description: body.description ?? existing.description,
      funding_stage: body.funding_stage ?? existing.funding_stage,
      updated_at: new Date(),
    };
    await db.collection('startups').updateOne({ _id: id }, { $set: update });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /startups/:id error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/startups/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const id = new ObjectId(req.params.id);
    const existing = await db.collection('startups').findOne({ _id: id });
    if (!existing) return res.status(404).json({ message: 'Startup not found' });
    await db.collection('startups').updateOne({ _id: id }, { $set: { status: 'Deleted', updated_at: new Date() } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /startups/:id error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ==================== OPPORTUNITIES ====================

app.get('/opportunities', async (req, res) => {
  try {
    const startupId = req.query.startupId || req.query.startup_id;
    const founderView = req.query.founderView === 'true';
    const founderEmail = req.headers['x-user-email'];

    if (!startupId) {
      const pipeline = [
        { $match: { status: 'Open' } },
        {
          $lookup: {
            from: 'startups',
            localField: 'startup_id',
            foreignField: '_id',
            as: 'startup',
          },
        },
        { $unwind: { path: '$startup', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            industry: '$startup.industry',
            startup_name: '$startup.startup_name',
          },
        },
        { $sort: { updated_at: -1 } },
      ];
      const opportunities = await db.collection('opportunities').aggregate(pipeline).toArray();
      return res.json({ opportunities });
    }

    if (!ObjectId.isValid(startupId)) return res.status(400).json({ message: 'Invalid startupId' });

    if (founderView) {
      if (!founderEmail) return res.status(401).json({ message: 'Unauthorized' });
      const pipeline = [
        { $match: { startup_id: new ObjectId(startupId), status: { $ne: 'Deleted' } } },
        {
          $lookup: {
            from: 'startups',
            localField: 'startup_id',
            foreignField: '_id',
            as: 'startup',
          },
        },
        { $unwind: '$startup' },
        { $match: { 'startup.founder_email': String(founderEmail).trim().toLowerCase() } },
      ];
      const opportunities = await db.collection('opportunities').aggregate(pipeline).toArray();
      return res.json({ opportunities });
    }

    const opportunities = await db.collection('opportunities')
      .find({ startup_id: new ObjectId(startupId), status: 'Open' })
      .sort({ updated_at: -1 })
      .toArray();
    return res.json({ opportunities });
  } catch (err) {
    console.error('GET /opportunities error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/opportunities/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const opp = await db.collection('opportunities').findOne({ _id: new ObjectId(req.params.id) });
    if (!opp || opp.status === 'Deleted') return res.status(404).json({ message: 'Opportunity not found' });
    const startup = await db.collection('startups').findOne({ _id: opp.startup_id });
    return res.json({ opportunity: { ...opp, startup } });
  } catch (err) {
    console.error('GET /opportunities/:id error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/opportunities', async (req, res) => {
  try {
    const founderEmail = req.headers['x-user-email'];
    if (!founderEmail) return res.status(401).json({ message: 'Unauthorized' });

    const body = req.body;
    const startup_id = body.startup_id;
    const role_title = body.role_title || body.title;
    if (!startup_id || !role_title) return res.status(400).json({ message: 'Missing required fields' });
    if (!ObjectId.isValid(startup_id)) return res.status(400).json({ message: 'Invalid startup_id' });

    const startup = await db.collection('startups').findOne({ _id: new ObjectId(startup_id) });
    if (!startup) return res.status(400).json({ message: 'Invalid startup_id' });
    if (String(startup.founder_email).trim().toLowerCase() !== String(founderEmail).trim().toLowerCase()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const opp = {
      startup_id: new ObjectId(startup_id),
      role_title,
      required_skills: body.required_skills || '',
      work_type: body.work_type || '',
      commitment_level: body.commitment_level || '',
      deadline: body.deadline || null,
      status: 'Open',
      created_at: new Date(),
      updated_at: new Date(),
    };
    const result = await db.collection('opportunities').insertOne(opp);
    return res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error('POST /opportunities error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/opportunities/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const id = new ObjectId(req.params.id);
    const existing = await db.collection('opportunities').findOne({ _id: id });
    if (!existing) return res.status(404).json({ message: 'Opportunity not found' });

    const body = req.body;
    const update = {
      role_title: body.role_title ?? body.title ?? existing.role_title,
      required_skills: body.required_skills ?? existing.required_skills,
      work_type: body.work_type ?? existing.work_type,
      commitment_level: body.commitment_level ?? existing.commitment_level,
      deadline: body.deadline ?? existing.deadline,
      status: body.status ?? existing.status,
      updated_at: new Date(),
    };
    await db.collection('opportunities').updateOne({ _id: id }, { $set: update });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /opportunities/:id error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/opportunities/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const id = new ObjectId(req.params.id);
    const existing = await db.collection('opportunities').findOne({ _id: id });
    if (!existing) return res.status(404).json({ message: 'Opportunity not found' });
    await db.collection('opportunities').updateOne({ _id: id }, { $set: { status: 'Deleted', updated_at: new Date() } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /opportunities/:id error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ==================== APPLICATIONS ====================

app.get('/applications', async (req, res) => {
  try {
    const { applicantEmail, opportunityId, startupId } = req.query;
    const userEmail = req.headers['x-user-email'];
    const userRole = req.headers['x-user-role'];

    if (opportunityId) {
      if (!ObjectId.isValid(opportunityId)) return res.status(400).json({ message: 'Invalid opportunityId' });
      const pipeline = [
        { $match: { Opportunity_id: new ObjectId(opportunityId) } },
        {
          $lookup: {
            from: 'opportunities',
            localField: 'Opportunity_id',
            foreignField: '_id',
            as: 'opportunity',
          },
        },
        { $unwind: '$opportunity' },
        {
          $lookup: {
            from: 'startups',
            localField: 'opportunity.startup_id',
            foreignField: '_id',
            as: 'startup',
          },
        },
        { $unwind: '$startup' },
        { $match: { 'startup.founder_email': String(userEmail).trim().toLowerCase() } },
        {
          $project: {
            _id: 1, Opportunity_id: 1, Applicant_email: 1, Portfolio_link: 1,
            Motivation: 1, Status: 1, applied_at: 1,
            opportunity: { role_title: '$opportunity.role_title' },
            startup: { startup_name: '$startup.startup_name' },
          },
        },
        { $sort: { applied_at: -1 } },
      ];
      const apps = await db.collection('applications').aggregate(pipeline).toArray();
      return res.json({ applications: apps });
    }

    if (applicantEmail) {
      const safeApplicant = String(applicantEmail).trim().toLowerCase();
      const pipeline = [
        { $match: { Applicant_email: safeApplicant } },
        {
          $lookup: {
            from: 'opportunities',
            localField: 'Opportunity_id',
            foreignField: '_id',
            as: 'opportunity',
          },
        },
        { $unwind: { path: '$opportunity', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'startups',
            localField: 'opportunity.startup_id',
            foreignField: '_id',
            as: 'startup',
          },
        },
        { $unwind: { path: '$startup', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1, Opportunity_id: 1, Applicant_email: 1, Portfolio_link: 1,
            Motivation: 1, Status: 1, applied_at: 1, created_at: 1, updated_at: 1,
            role_title: '$opportunity.role_title',
            startup_name: '$startup.startup_name',
            startup_logo: '$startup.logo',
          },
        },
        { $sort: { applied_at: -1 } },
      ];
      const apps = await db.collection('applications').aggregate(pipeline).toArray();
      return res.json({ applications: apps });
    }

    if (startupId) {
      if (!ObjectId.isValid(startupId)) return res.status(400).json({ message: 'Invalid startupId' });
      const pipeline = [
        {
          $lookup: {
            from: 'opportunities',
            localField: 'Opportunity_id',
            foreignField: '_id',
            as: 'opportunity',
          },
        },
        { $unwind: '$opportunity' },
        { $match: { 'opportunity.startup_id': new ObjectId(startupId) } },
        {
          $lookup: {
            from: 'startups',
            localField: 'opportunity.startup_id',
            foreignField: '_id',
            as: 'startup',
          },
        },
        { $unwind: '$startup' },
        { $match: { 'startup.founder_email': String(userEmail).trim().toLowerCase() } },
        {
          $project: {
            _id: 1, Opportunity_id: 1, Applicant_email: 1, Portfolio_link: 1,
            Motivation: 1, Status: 1, applied_at: 1,
            opportunity: { role_title: '$opportunity.role_title' },
            startup: { startup_name: '$startup.startup_name' },
          },
        },
        { $sort: { applied_at: -1 } },
      ];
      const apps = await db.collection('applications').aggregate(pipeline).toArray();
      return res.json({ applications: apps });
    }

    return res.status(400).json({ message: 'Provide applicantEmail, opportunityId, or startupId' });
  } catch (err) {
    console.error('GET /applications error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/applications', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!userEmail) return res.status(401).json({ message: 'Unauthorized' });

    const body = req.body;
    const opportunityId = body.Opportunity_id || body.opportunity_id || body.opportunityId;
    if (!opportunityId || !ObjectId.isValid(opportunityId)) {
      return res.status(400).json({ message: 'Invalid opportunity_id' });
    }

    const safeEmail = String(userEmail).trim().toLowerCase();

    const opportunity = await db.collection('opportunities').findOne({ _id: new ObjectId(opportunityId) });
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found' });

    const existing = await db.collection('applications').findOne({
      Opportunity_id: new ObjectId(opportunityId),
      Applicant_email: safeEmail,
    });
    if (existing) return res.status(409).json({ message: 'Already applied for this opportunity' });

    const app = {
      Opportunity_id: new ObjectId(opportunityId),
      Applicant_email: safeEmail,
      Portfolio_link: body.Portfolio_link || body.portfolio_link || '',
      Motivation: body.Motivation || body.motivation || '',
      Status: 'Pending',
      applied_at: new Date().toISOString(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    const result = await db.collection('applications').insertOne(app);
    return res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error('POST /applications error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/applications/:id/status', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const id = new ObjectId(req.params.id);
    const newStatus = req.body.Status || req.body.status;
    if (!['Accepted', 'Rejected', 'Pending'].includes(newStatus)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const existing = await db.collection('applications').findOne({ _id: id });
    if (!existing) return res.status(404).json({ message: 'Application not found' });
    await db.collection('applications').updateOne({ _id: id }, { $set: { Status: newStatus, updated_at: new Date() } });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /applications/:id/status error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ==================== ADMIN ====================

app.get('/admin/stats', async (req, res) => {
  try {
    const [totalUsers, totalStartups, totalOpportunities] = await Promise.all([
      db.collection('user').countDocuments({}),
      db.collection('startups').countDocuments({ status: { $ne: 'Deleted' } }),
      db.collection('opportunities').countDocuments({}),
    ]);

    let totalRevenue = 0;
    try {
      const payments = await stripe.charges.list({ limit: 100 });
      totalRevenue = payments.data
        .filter((c) => c.paid && c.amount_received)
        .reduce((sum, c) => sum + c.amount_received, 0);
    } catch { totalRevenue = 0; }

    return res.json({ totalUsers, totalStartups, totalOpportunities, totalRevenue });
  } catch (err) {
    console.error('GET /admin/stats error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/admin/users', async (req, res) => {
  try {
    const users = await db.collection('user')
      .find({}, { projection: { name: 1, email: 1, role: 1, plan: 1, banned: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json({ users });
  } catch (err) {
    console.error('GET /admin/users error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/admin/users/:id/block', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid user ID' });
    const { banned } = req.body;
    const result = await db.collection('user').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { banned: !!banned } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: 'User not found' });
    return res.json({ ok: true, banned: !!banned });
  } catch (err) {
    console.error('PUT /admin/users/:id/block error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/admin/startups', async (req, res) => {
  try {
    const startups = await db.collection('startups')
      .find({ status: { $ne: 'Deleted' } })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json({ startups });
  } catch (err) {
    console.error('GET /admin/startups error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/admin/startups/:id/status', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid startup ID' });
    const { status } = req.body;
    if (!['Approved', 'Rejected', 'Deleted'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const result = await db.collection('startups').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: 'Startup not found' });
    return res.json({ ok: true, status });
  } catch (err) {
    console.error('PUT /admin/startups/:id/status error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/admin/transactions', async (req, res) => {
  try {
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    const transactions = sessions.data.map((s) => ({
      id: s.id,
      user: s.customer_details?.email || s.metadata?.email || 'Unknown',
      amount: (s.amount_total || 0) / 100,
      currency: (s.currency || 'usd').toUpperCase(),
      date: new Date(s.created * 1000).toISOString(),
      payment_status: s.payment_status === 'paid' ? 'Paid' : s.payment_status,
      status: s.status,
    }));
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.json({ transactions });
  } catch (err) {
    console.error('GET /admin/transactions error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ==================== UPLOAD IMAGE (imgBB) ====================

app.post('/upload-image', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ message: 'No image data provided' });

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) return res.status(500).json({ message: 'ImgBB API key not configured' });

    const imgBBForm = new FormData();
    imgBBForm.append('image', image);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: imgBBForm,
    });
    const data = await response.json();
    if (!data.success) return res.status(500).json({ message: data.error?.message || 'ImgBB upload failed' });

    return res.json({ url: data.data.url, delete_url: data.data.delete_url });
  } catch (err) {
    console.error('POST /upload-image error:', err);
    return res.status(500).json({ message: err?.message || 'Upload failed' });
  }
});

// ==================== STRIPE CHECKOUT ====================

app.post('/checkout_sessions', async (req, res) => {
  try {
    const origin = req.headers.origin || 'http://localhost:3000';
    const { email } = req.body || {};

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      customer_email: email || undefined,
      metadata: { email: email || '' },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('POST /checkout_sessions error:', err);
    return res.status(500).json({ message: err.message });
  }
});

app.post('/verify-payment', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    if (!userEmail) return res.status(401).json({ message: 'Unauthorized' });

    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ message: 'Missing session_id' });

    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
    if (checkoutSession.payment_status !== 'paid') {
      return res.status(400).json({ message: 'Payment not completed' });
    }

    await db.collection('user').updateOne(
      { email: userEmail },
      { $set: { plan: 'Premium' } }
    );

    return res.json({ ok: true, plan: 'Premium' });
  } catch (err) {
    console.error('POST /verify-payment error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ==================== START ====================

initMongo().catch((err) => {
  console.error('Mongo initialization failed:', err);
  process.exit(1);
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>StartupForge Server</title></head>
    <body style="background:#000;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
      <div style="text-align:center">
        <h1 style="font-size:2rem">StartupForge Server</h1>
        <p style="color:#a1a1aa;font-size:1.2rem">Server is running on port ${port}</p>
      </div>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
