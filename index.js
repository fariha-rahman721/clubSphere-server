require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const admin = require("firebase-admin");
const serviceAccount = require("./servicekey.json");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());



admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});



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
            message: "Unauthorized access. Token not found!",
        });
    }

    const token = authorization.split(" ")[1];
    try {
        const user = await admin.auth().verifyIdToken(token);
        req.user = user;
        next();
    } catch (error) {
        res.status(401).send({
            message: "Unauthorized access.",
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
        const paymentsCollection = db.collection("payments");


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


        // leave club
        app.delete("/leaveClub", async (req, res) => {
            try {
                const { clubId, userEmail } = req.body;

                if (!clubId || !userEmail) {
                    return res.status(400).send({ message: "Missing data" });
                }

                const result = await joinClubCollection.deleteOne({
                    clubId,
                    userEmail,
                });

                res.send(result);
            } catch (error) {
                console.error("Leave club error:", error);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });



        // my clubs


        app.get("/myClubs", verifyToken, async (req, res) => {
            const email = req.query.email;

            if (req.user.email !== email) {
                return res.status(403).send({ message: "Forbidden access" });
            }

            try {
                const joinRecords = await joinClubCollection.find({ userEmail: email }).toArray();


                const clubIds = joinRecords.map(j => new ObjectId(j.clubId));
                const clubs = await clubsCollection.find({ _id: { $in: clubIds } }).toArray();


                const myClubs = clubs.map(club => {
                    const joinInfo = joinRecords.find(j => j.clubId === club._id.toString());
                    return { ...club, joinInfo };
                });

                res.send(myClubs);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch joined clubs" });
            }
        });



        // GET all events a user has joined (protected)
        app.get("/joinEvents", verifyToken, async (req, res) => {
            try {
                const email = req.query.email;

                if (req.user.email !== email) {
                    return res.status(403).send({ message: "Forbidden access" });
                }

                const result = await joinEventCollection
                    .find({ userEmail: email })
                    .toArray();

                res.send(result);
            } catch (err) {
                console.error("Fetch joinEvents error:", err);
                res.status(500).send({ error: "Failed to fetch joined events" });
            }
        });

        //  Join an event (protected)
        app.post("/joinEvents", verifyToken, async (req, res) => {
            try {
                const { userEmail, eventId, joinedAt } = req.body;

                if (req.user.email !== userEmail) {
                    return res.status(403).send({ message: "Unauthorized" });
                }

                if (!eventId) {
                    return res.status(400).send({ message: "Missing eventId" });
                }

                const membership = {
                    userEmail,
                    eventId,
                    joinedAt: joinedAt || new Date(),
                };

                const result = await joinEventCollection.insertOne(membership);

                res.status(201).send({ success: true, joinResult: result });
            } catch (err) {
                console.error("Join event error:", err);
                res.status(500).send({ error: "Failed to join event" });
            }
        });


        // leave event
        // Leave event
        app.delete("/leaveEvent", async (req, res) => {
            try {
                const { eventId, userEmail } = req.body;

                if (!eventId || !userEmail) {
                    return res.status(400).send({ message: "Missing data" });
                }

                const result = await joinEventCollection.deleteOne({
                    eventId,
                    userEmail,
                });

                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: "Event not found or already left" });
                }

                res.send({ success: true, message: "Successfully left the event" });
            } catch (error) {
                console.error("Leave event error:", error);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });




        // payment club

        app.post("/payments", async (req, res) => {
            try {
                const payment = req.body;
                payment.createdAt = new Date();

                const result = await paymentsCollection.insertOne(payment);

                if (payment.type === "membership" && payment.clubId) {
                    await clubsCollection.updateOne(
                        { _id: new ObjectId(payment.clubId) },
                        {
                            $push: {
                                members: {
                                    userEmail: payment.userEmail,
                                    joinedAt: new Date(),
                                    paymentId: result.insertedId,
                                    status: "active"
                                }
                            }
                        }
                    );
                }

                if (payment.type === "event" && payment.eventId) {
                    await eventsCollection.updateOne(
                        { _id: new ObjectId(payment.eventId) },
                        {
                            $push: {
                                participants: {
                                    userEmail: payment.userEmail,
                                    registeredAt: new Date(),
                                    paymentId: result.insertedId
                                }
                            }
                        }
                    );
                }

                res.send({
                    success: true,
                    message: "Payment processed successfully",
                    paymentId: result.insertedId
                });

            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Payment failed" });
            }
        });




        // stripe
        app.post('/create-checkout-session', async (req, res) => {
            try {
                const { amount, clubId, senderEmail, clubName } = req.body;

                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: [
                        {
                            price_data: {
                                currency: 'usd',
                                unit_amount: amount * 100,
                                product_data: {
                                    name: clubName,
                                },
                            },
                            quantity: 1,
                        },
                    ],
                    mode: 'payment',
                    metadata: {
                        clubId,
                    },
                    customer_email: senderEmail,
                    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
                    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
                });

                res.send({ url: session.url });
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: 'Payment failed' });
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
