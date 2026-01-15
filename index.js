require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const admin = require("firebase-admin");
const serviceAccount = require("./servicekey.json");
const { Transaction } = require('firebase-admin/firestore');
require("dotenv").config();

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
        const userCollection = db.collection("user");
        const memberRequestsCollection = db.collection("memberRequest");
        const faqsCollection = db.collection("Faqs");
        const blogsCollection = db.collection("blogs");



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
                // 1. Free joined clubs
                const joinRecords = await joinClubCollection.find({ userEmail: email }).toArray();

                // 2. Paid memberships
                const paidRecords = await paymentsCollection
                    .find({ Member: req.user })
                    .toArray();

                // Combine club IDs
                const allClubIds = [
                    ...joinRecords.map(j => new ObjectId(j.clubId)),
                    ...paidRecords.map(p => new ObjectId(p.clubId)),
                ];

                // Remove duplicates
                const uniqueClubIds = [...new Set(allClubIds.map(id => id.toString()))].map(id => new ObjectId(id));

                // Fetch all club details
                const clubs = await clubsCollection.find({ _id: { $in: uniqueClubIds } }).toArray();

                // Merge join info
                const myClubs = clubs.map(club => {
                    const freeJoin = joinRecords.find(j => j.clubId === club._id.toString());
                    const paidJoin = paidRecords.find(p => p.clubId === club._id.toString());
                    return {
                        ...club,
                        joinInfo: freeJoin || paidJoin || {},
                        membershipType: paidJoin ? "paid" : "free"
                    };
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
                    .find({ Member: req.user })
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

        app.get("/myEvents", verifyToken, async (req, res) => {
            const email = req.query.email;

            if (req.user.email !== email) {
                return res.status(403).send({ message: "Forbidden access" });
            }

            try {
                // Free joined events
                const freeJoins = await joinEventCollection
                    .find({ Member: req.user })
                    .toArray();

                // Paid joined events
                const paidJoins = await paymentsCollection
                    .find({ userEmail: email, type: "event" })
                    .toArray();

                // Collect all event IDs
                const eventIds = [
                    ...freeJoins.map(j => new ObjectId(j.eventId)),
                    ...paidJoins.map(p => new ObjectId(p.eventId)),
                ];

                // Remove duplicates
                const uniqueEventIds = [
                    ...new Set(eventIds.map(id => id.toString()))
                ].map(id => new ObjectId(id));

                // Fetch event details
                const events = await eventsCollection
                    .find({ _id: { $in: uniqueEventIds } })
                    .toArray();

                // Attach join type
                const myEvents = events.map(event => {
                    const paid = paidJoins.find(p => p.eventId === event._id.toString());
                    return {
                        ...event,
                        joinType: paid ? "paid" : "free",
                    };
                });

                res.send(myEvents);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch events" });
            }
        });



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


        // faqs 
        app.get("/faqs", async (req, res) => {
            try {
                const faqs = await faqsCollection.find().toArray();
                res.send(faqs);
            } catch (error) {
                console.error("Fetch FAQs error:", error);
                res.status(500).send({ message: "Failed to fetch FAQs", error });
            }
        });

        // GET all blogs
        app.get("/blogs", async (req, res) => {
            try {
                const blogs = await blogsCollection.find().sort({ date: -1 }).toArray();
                res.send(blogs);
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to fetch blogs" });
            }
        });

        // GET single blog by ID
        app.get("/blogs/:id", async (req, res) => {
            try {
                const id = req.params.id;

                // ✅ SAFETY CHECK (THIS IS THE MISSING PIECE)
                if (!ObjectId.isValid(id)) {
                    return res.status(400).json({ message: "Invalid blog ID" });
                }

                const blog = await blogsCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!blog) {
                    return res.status(404).json({ message: "Blog not found" });
                }

                res.json(blog);
            } catch (error) {
                console.error("Blog fetch error:", error);
                res.status(500).json({ message: "Server error" });
            }
        });




        // payment club

        app.get("/payments", verifyToken, async (req, res) => {
            try {
                const payments = await paymentsCollection.find().sort({ createdAt: -1 }).toArray();

                const uniquePayments = [...new Map(payments.map(p => [p.transactionId, p])).values()];


                const finalPayments = uniquePayments.map(p => ({
                    ...p,
                    displayName: p.clubName || p.eventName || "Unknown"
                }));

                res.send(finalPayments);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch payments", error: err });
            }
        });


        app.post("/payments", verifyToken, async (req, res) => {
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
                                    clubName: payment.clubName,
                                    joinedAt: new Date(),
                                    paymentId: result.insertedId,
                                    status: "active",
                                    transactionId: payment.transactionId
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
                                    paymentId: result.insertedId,
                                    clubName: payment.clubName,

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
            const cursor = paymentsCollection.find(query).sort({ createdAt: -1 })
        });



        // payment related api
        app.post('/payment-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.amount) * 100;

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            unit_amount: amount,
                            product_data: {
                                name: `Please pay for: ${paymentInfo.clubName || paymentInfo.eventName}`
                            }
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                metadata: {
                    type: paymentInfo.type,
                    clubId: paymentInfo.clubId || "",
                    eventId: paymentInfo.eventId || "",
                    clubName: paymentInfo.clubName || "",
                    eventName: paymentInfo.eventName || "",
                },
                customer_email: paymentInfo.senderEmail,
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
            });

            res.send({ url: session.url });
        });



        app.post("/confirm-payment", async (req, res) => {
            try {
                const { sessionId } = req.body;

                const session = await stripe.checkout.sessions.retrieve(sessionId);

                if (!session || !session.payment_intent) {
                    return res.status(400).send({ success: false, message: "Invalid session" });
                }

                // Prevent duplicate payments
                const existingPayment = await paymentsCollection.findOne({
                    transactionId: session.payment_intent
                });

                if (existingPayment) {
                    return res.send({ success: true, message: "Payment already recorded" });
                }


                // Metadata
                const metadata = session.metadata || {};
                const type = metadata.type || "membership";
                const clubId = metadata.clubId || null;
                const eventId = metadata.eventId || null;
                const clubName = metadata.clubName || "";
                const eventName = metadata.eventName || "";

                // Insert payment
                const paymentDoc = {
                    stripeSessionId: session.id,
                    transactionId: session.payment_intent,
                    userEmail: session.customer_email,
                    clubId,
                    eventId,
                    clubName,
                    eventName,
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    status: "paid",
                    createdAt: new Date(),
                    type
                };


                await paymentsCollection.insertOne(paymentDoc);


                if (type === "membership" && clubId) {
                    await joinClubCollection.updateOne(
                        { userEmail: session.customer_email, clubId },
                        { $set: { joinedAt: new Date(), status: "active", clubName } },
                        { upsert: true }
                    );

                } else if (type === "event" && eventId) {
                    await joinEventCollection.updateOne(
                        { userEmail: session.customer_email, eventId },
                        { $set: { joinedAt: new Date(), status: "active", eventName: metadata.eventName || "" } },
                        { upsert: true }
                    );
                }


                res.send({ success: true });
            } catch (error) {
                console.error("Confirm payment error:", error);
                res.status(500).send({ success: false, message: "Server error" });
            }
        });



        function generateTrackingId() {
            return 'TRK-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        }


        // stripe
        // app.post('/create-checkout-session', async (req, res) => {
        //     try {
        //         const { amount, clubId, senderEmail, clubName } = req.body;

        //         const session = await stripe.checkout.sessions.create({
        //             payment_method_types: ['card'],
        //             line_items: [
        //                 {
        //                     price_data: {
        //                         currency: 'usd',
        //                         unit_amount: amount * 100,
        //                         product_data: {
        //                             name: clubName,
        //                         },
        //                     },
        //                     quantity: 1,
        //                 },
        //             ],
        //             mode: 'payment',
        //             metadata: {
        //                 clubId,
        //             },
        //             customer_email: senderEmail,
        //             success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
        //             cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
        //         });

        //         res.send({ url: session.url });
        //     } catch (error) {
        //         console.error(error);
        //         res.status(500).send({ error: 'Payment failed' });
        //     }
        // });



        // GET all users 
        app.get('/user', verifyToken, async (req, res) => {
            try {
                const users = await userCollection.find().toArray()
                res.send(users)
            } catch (error) {
                res.status(500).send({ message: 'Failed to fetch users' })
            }
        })


        // save or update user in db
        app.post('/user', async (req, res) => {
            try {
                const userData = req.body;

                const query = { email: userData.email };
                const alreadyExists = await userCollection.findOne(query);

                if (alreadyExists) {
                    const result = await userCollection.updateOne(query, {
                        $set: {
                            last_loggedIn: new Date().toISOString(),
                        },
                    });
                    return res.send(result);
                }

                // new user
                userData.created_at = new Date().toISOString();
                userData.last_loggedIn = new Date().toISOString();
                userData.role = 'Member';

                const result = await userCollection.insertOne(userData);
                res.send(result);

            } catch (error) {
                console.error("User save error:", error);
                res.status(500).send({ message: "User save failed" });
            }
        });

        // get a user role

        app.get('/user/role/:email', verifyToken, async (req, res) => {
            try {
                const email = req.params.email;

                const result = await userCollection.findOne({ email });

                if (!result) {
                    return res.send({ role: "Member" }); // default role
                }

                res.send({ role: result.role });
            } catch (error) {
                console.error("Error fetching role:", error);
                res.status(500).send({ role: "Member", message: "Server error" });
            }
        });


        // become a member
        app.post('/memberRequest', verifyToken, async (req, res) => {
            try {
                const email = req.user?.email;

                if (!email) {
                    return res.status(400).send({ message: 'Email not found in token' });
                }

                // get user info from users collection
                const userData = await userCollection.findOne({ email });

                if (!userData) {
                    return res.status(404).send({ message: 'User not found' });
                }

                const alreadyExists = await memberRequestsCollection.findOne({ email });
                if (alreadyExists) {
                    return res.status(409).send({ message: 'Already requested, wait koro.' });
                }

                const requestDoc = {
                    email: userData.email,
                    name: userData.name || userData.displayName || "N/A",
                    role: userData.role,
                    requestedAt: new Date(),
                };

                const result = await memberRequestsCollection.insertOne(requestDoc);
                res.send(result);

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });



        // get all member request for admin
        app.get('/allMemberRequest', verifyToken, async (req, res) => {
            try {
                const adminUser = await userCollection.findOne({ email: req.user.email });

                if (adminUser?.role !== 'Admin') {
                    return res.status(403).send({ message: 'Forbidden access' });
                }

                const result = await memberRequestsCollection.find().toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to fetch member requests' });
            }
        });


        // update users role
        app.patch('/update-role', verifyToken, async (req, res) => {
            const { email, role } = req.body
            const result = await userCollection.updateOne(
                { email },
                { $set: { role } }
            )
            await memberRequestsCollection.deleteOne({ email })

            res.send(result)
        })




        app.get("/", (req, res) => {
            res.send("Hello, World!");
        });

        // await client.db("admin").command({ ping: 1 });
        console.log("Connected to MongoDB successfully!");
    } catch (err) {
        console.log("DB connection error:", err);
    }
}

run();

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
