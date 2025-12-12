require('dotenv').config(); 

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.fh8zolv.mongodb.net/?appName=Cluster0`

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
       

        const db = client.db("clubSphereDB");
        const clubsCollection = db.collection("clubsCollection");
        const wingsCollection = db.collection("wings");
        const eventsCollection = db.collection("events");

       
        app.get('/clubsCollection', async (req, res) => {
            try {
                const result = await clubsCollection.find().toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Database error", error });
            }
        });

        // wings
        app.get('/wings', async (req, res) => {
            try {
                const result = await wingsCollection.find().toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Database error", error });
            }
        });

        // events
        app.get('/events', async (req, res) => {
            try {
                const result = await eventsCollection.find().toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Database error", error });
            }
        });

        app.get("/", (req, res) => {
            res.send("Hello, World!");
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Connected to MongoDB successfully!");
    } catch (err) {
        console.log("DB connection error:", err);
    }
}

run();

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
