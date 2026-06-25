const express = require('express');
const cors = require('cors');

const app = express();
const port = 5000;
require('dotenv').config();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGO_DB_URI;
if (!uri) {
  console.error('Missing environment variable: MONGO_DB_URI');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
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

app.post('/startups', async (req, res) => {
  try {
    const body = req.body;
    const startup = {
      startup_name: body.startup_name,
      logo: body.logo || '',
      industry: body.industry,
      description: body.description,
      funding_stage: body.funding_stage,
      founder_email: body.founder_email,
      status: 'Active',
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
    if (startupId) {
      if (!ObjectId.isValid(startupId)) return res.status(400).json({ message: 'Invalid startupId' });
      const opps = await db.collection('opportunities')
        .find({ startup_id: new ObjectId(startupId), status: { $ne: 'Deleted' } })
        .sort({ updated_at: -1 })
        .toArray();
      return res.json({ opportunities: opps });
    }
    const opps = await db.collection('opportunities')
      .find({ status: 'Open' })
      .sort({ updated_at: -1 })
      .toArray();
    return res.json({ opportunities: opps });
  } catch (err) {
    console.error('GET /opportunities error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/opportunities', async (req, res) => {
  try {
    const body = req.body;
    const opp = {
      startup_id: new ObjectId(body.startup_id),
      role_title: body.role_title || body.title,
      required_skills: body.required_skills || '',
      work_type: body.work_type || '',
      commitment_level: body.commitment_level || '',
      deadline: body.deadline || null,
      status: 'Open',
      created_at: new Date(),
      updated_at: new Date(),
    };
    if (!opp.startup_id || !opp.role_title) return res.status(400).json({ message: 'Missing required fields' });
    const result = await db.collection('opportunities').insertOne(opp);
    return res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error('POST /opportunities error:', err);
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
      ];
      const apps = await db.collection('applications').aggregate(pipeline).toArray();
      return res.json({ applications: apps });
    }

    if (applicantEmail) {
      const pipeline = [
        { $match: { Applicant_email: String(applicantEmail).trim().toLowerCase() } },
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
            _id: 1,
            Opportunity_id: 1,
            Applicant_email: 1,
            Portfolio_link: 1,
            Motivation: 1,
            Status: 1,
            applied_at: 1,
            role_title: '$opportunity.role_title',
            startup_name: '$startup.startup_name',
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
        {
          $project: {
            _id: 1,
            Opportunity_id: 1,
            Applicant_email: 1,
            Portfolio_link: 1,
            Motivation: 1,
            Status: 1,
            applied_at: 1,
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
    const body = req.body;
    const opportunityId = body.Opportunity_id || body.opportunity_id || body.opportunityId;
    if (!opportunityId || !ObjectId.isValid(opportunityId)) {
      return res.status(400).json({ message: 'Invalid opportunity_id' });
    }

    const app = {
      Opportunity_id: new ObjectId(opportunityId),
      Applicant_email: String(body.Applicant_email || body.applicant_email || '').trim().toLowerCase(),
      Portfolio_link: body.Portfolio_link || body.portfolio_link || '',
      Motivation: body.Motivation || body.motivation || '',
      Status: 'Pending',
      applied_at: new Date().toISOString(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (!app.Applicant_email) return res.status(400).json({ message: 'Applicant email is required' });

    const existing = await db.collection('applications').findOne({
      Opportunity_id: app.Opportunity_id,
      Applicant_email: app.Applicant_email,
    });
    if (existing) return res.status(409).json({ message: 'Already applied' });

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



initMongo().catch((err) => {
  console.error('Mongo initialization failed:', err);
  process.exit(1);
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
