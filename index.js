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

const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGO_DB_URI;
if (!uri) {
  console.error('Missing environment variable: MONGO_DB_URI');
  process.exit(1);
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let opportunityCollection;

async function initMongo() {
  await client.connect();
  await client.db('admin').command({ ping: 1 });

  const database = client.db('startup_forge_db');
  opportunityCollection = database.collection('opportunities');

  console.log('Pinged your deployment. You successfully connected to MongoDB!');
}

app.post('/opportunities', async (req, res) => {
  try {
    if (!opportunityCollection) {
      return res.status(503).json({
        message: 'MongoDB not initialized yet. Try again shortly.',
      });
    }

    const opportunity = req.body;
    const result = await opportunityCollection.insertOne(opportunity);

    return res.status(201).json({
      insertedId: result.insertedId,
      acknowledged: result.acknowledged,
    });
  } catch (err) {
    console.error('Failed to insert opportunity:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

initMongo().catch((err) => {
  console.error('Mongo initialization failed:', err);
  process.exit(1);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
