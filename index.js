require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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

const verifyToken = async (req, res, next) => {

    const authorization = req.headers.authorization;


    if (!authorization) {
        return res.status(401).send({
            message: "unauthorized access. Token not found!",
        });
    }

    const token = authorization.split(" ")[1];
    try {

        const user = await admin.auth().verifyIdToken(token);
        req.user = user;

        next();
    } catch (error) {
        res.status(405).send({
            message: "unauthorized access.",
        });
    }
};

async function run() {
    try {


        const db = client.db("clubSphereDB");
        const clubsCollection = db.collection("clubsCollection");
        const wingsCollection = db.collection("wings");
        const eventsCollection = db.collection("events");
        const joinClubCollection = db.collection("joinClubs");
        const joinEventCollection = db.collection("joinEvents");


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

        app.get("/events/:id", async (req, res) => {
            try {
                const eventId = req.params.id;
                const event = await eventsCollection.findOne({ _id: new ObjectId(eventId) });

                if (!event) {
                    return res.status(404).send({ message: "Event not found" });
                }

                res.send(event);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error" });
            }
        });

        // jon clubs

        app.get("/joinClubs", verifyToken, async (req, res) => {
            const email = req.query.email;

            if (req.user.email !== email) {
                return res.status(403).send({ message: "Forbidden access" });
            }

            const result = await joinClubCollection
                .find({ userEmail: email })
                .toArray();

            res.send(result);
        });


        app.post("/joinClubs", async (req, res) => {
            try {
                const membership = req.body; // contains userEmail, clubId, etc.
                console.log("Received membership:", membership);

                // TODO: Save to database
                const result = await joinClubCollection.insertOne(membership);

                res.status(201).send({ success: true, joinResult: result });
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Something went wrong" });
            }
        });




        // join events
        app.post('/joinEvents/:id', verifyToken, async (req, res) => {
            try {
                const registration = req.body;
                registration.registeredAt = new Date();
                registration.status = "registered";


                const result = await joinEventCollection.insertOne(registration);


                const filter = { _id: new ObjectId(req.params.id) };
                const update = { $inc: { participants: 1 } };
                const participantsCount = await eventsCollection.updateOne(filter, update);

                res.send({
                    joinResult: result,
                    participantsUpdate: participantsCount
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: 'Something went wrong!' });
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
