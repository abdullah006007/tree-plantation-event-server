const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.kbhlw7l.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');

        // Collections
        const db = client.db('TreePlant');
        const userCollection = db.collection('users');
        const eventsCollection = db.collection('events');
        const eventJoinsCollection = db.collection('eventJoins');

        // Create User API
        app.post('/users', async (req, res) => {
            try {
                const { email, name } = req.body;
                if (!email) {
                    return res.status(400).json({ message: 'Email is required' });
                }
                const normalizedEmail = email.toLowerCase().trim();
                const userExist = await userCollection.findOne({
                    email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') },
                });
                if (userExist) {
                    return res.status(200).json({ message: 'User already exists', inserted: false });
                }
                const now = new Date().toISOString();
                const user = {
                    username: name || 'Anonymous',
                    email: normalizedEmail,
                    role: 'user',
                    created_at: now,
                    last_log_in: now,
                };
                const result = await userCollection.insertOne(user);
                res.status(201).json({ message: 'User created successfully', insertedId: result.insertedId });
            } catch (error) {
                console.error('Error inserting user:', error);
                res.status(500).json({ message: `Failed to add user: ${error.message}` });
            }
        });

        // Create Event API
        app.post('/events', async (req, res) => {
            try {
                const eventData = {
                    title: req.body.title,
                    description: req.body.description,
                    eventType: req.body.eventType,
                    thumbnail: req.body.thumbnail,
                    location: req.body.location,
                    date: new Date(req.body.date),
                    userEmail: req.body.userEmail.toLowerCase().trim(),
                    createdAt: new Date(),
                };

                // Validate required fields
                const requiredFields = ['title', 'description', 'eventType', 'thumbnail', 'location', 'date', 'userEmail'];
                for (const field of requiredFields) {
                    if (!eventData[field]) {
                        return res.status(400).json({ error: `${field} is required` });
                    }
                }

                // Validate future date
                if (eventData.date <= new Date()) {
                    return res.status(400).json({ error: 'Event date must be in the future' });
                }

                const result = await eventsCollection.insertOne(eventData);
                res.status(201).json({ message: 'Event created successfully', eventId: result.insertedId });
            } catch (error) {
                console.error('Error creating event:', error);
                res.status(500).json({ error: 'Failed to create event' });
            }
        });

        // Get Upcoming Events API
        app.get('/events/upcoming', async (req, res) => {
            try {
                const currentDate = new Date();
                const events = await eventsCollection
                    .find({ date: { $gt: currentDate } })
                    .sort({ date: 1 })
                    .toArray();
                res.status(200).json(events);
            } catch (error) {
                console.error('Error fetching upcoming events:', error);
                res.status(500).json({ error: 'Failed to fetch upcoming events' });
            }
        });




        app.get('/events/my-events', async (req, res) => {
            try {
                const userEmail = req.query.userEmail;
                console.log("Received userEmail:", userEmail);

                if (!userEmail || typeof userEmail !== "string") {
                    return res.status(400).json({ error: `userEmail is required and must be a string. Received: ${userEmail}` });
                }

                const normalizedEmail = userEmail.toLowerCase().trim();

                const events = await eventsCollection
                    .find({ userEmail: { $regex: new RegExp(`^${normalizedEmail}$`, "i") } })
                    .sort({ date: 1 })
                    .toArray();

                console.log(`✅ Found ${events.length} events for ${normalizedEmail}`);
                return res.status(200).json(events);
            } catch (error) {
                console.error("🔥 Error fetching my events:", error);
                return res.status(500).json({ error: `Failed to fetch my events: ${error.message}` });
            }
        });


        app.get('/events/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: `Invalid event ID format, received: ${req.params.id}` });
    }

    const event = await eventsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.status(200).json(event);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: `Failed to fetch event: ${error.message}` });
  }
});


        // Update Event API
        app.put('/events/:id', async (req, res) => {
            try {
                // Validate ObjectId
                if (!ObjectId.isValid(req.params.id)) {
                    console.log('Invalid event ID received for update:', req.params.id); // Debug log
                    return res.status(400).json({ error: `Invalid event ID format, received: ${req.params.id}` });
                }

                const eventId = new ObjectId(req.params.id);
                const userEmail = req.body.userEmail;

                if (!userEmail || typeof userEmail !== 'string') {
                    return res.status(400).json({ error: `userEmail is required and must be a string, received: ${userEmail}` });
                }

                // Check if event exists and belongs to the user
                const event = await eventsCollection.findOne({ _id: eventId });
                if (!event) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                if (event.userEmail !== userEmail.toLowerCase().trim()) {
                    return res.status(403).json({ error: 'You are not authorized to update this event' });
                }

                const updatedEventData = {
                    title: req.body.title,
                    description: req.body.description,
                    eventType: req.body.eventType,
                    thumbnail: req.body.thumbnail,
                    location: req.body.location,
                    date: new Date(req.body.date),
                    userEmail: userEmail.toLowerCase().trim(),
                    updatedAt: new Date(),
                };

                // Validate required fields
                const requiredFields = ['title', 'description', 'eventType', 'thumbnail', 'location', 'date', 'userEmail'];
                for (const field of requiredFields) {
                    if (!updatedEventData[field]) {
                        return res.status(400).json({ error: `${field} is required` });
                    }
                }

                // Validate future date
                if (updatedEventData.date <= new Date()) {
                    return res.status(400).json({ error: 'Event date must be in the future' });
                }

                const result = await eventsCollection.updateOne(
                    { _id: eventId },
                    { $set: updatedEventData }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'Event not found' });
                }

                res.status(200).json({ message: 'Event updated successfully' });
            } catch (error) {
                console.error('Error updating event:', error);
                res.status(500).json({ error: `Failed to update event: ${error.message}` });
            }
        });

        // Delete Event API
        app.delete('/events/:id', async (req, res) => {
            try {
                // Validate ObjectId
                if (!ObjectId.isValid(req.params.id)) {
                    console.log('Invalid event ID received for delete:', req.params.id); // Debug log
                    return res.status(400).json({ error: `Invalid event ID format, received: ${req.params.id}` });
                }

                const eventId = new ObjectId(req.params.id);
                const userEmail = req.query.userEmail;

                if (!userEmail || typeof userEmail !== 'string') {
                    return res.status(400).json({ error: `userEmail is required and must be a string, received: ${userEmail}` });
                }

                // Check if event exists and belongs to the user
                const event = await eventsCollection.findOne({ _id: eventId });
                if (!event) {
                    return res.status(404).json({ error: 'Event not found' });
                }
                if (event.userEmail !== userEmail.toLowerCase().trim()) {
                    return res.status(403).json({ error: 'You are not authorized to delete this event' });
                }

                // Delete the event
                const result = await eventsCollection.deleteOne({ _id: eventId });
                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: 'Event not found' });
                }

                // Delete associated join records
                await eventJoinsCollection.deleteMany({ eventId });

                res.status(200).json({ message: 'Event deleted successfully' });
            } catch (error) {
                console.error('Error deleting event:', error);
                res.status(500).json({ error: `Failed to delete event: ${error.message}` });
            }
        });

        // Join Event API
        app.post('/event-joins', async (req, res) => {
            try {
                const joinData = {
                    eventId: new ObjectId(req.body.eventId),
                    userEmail: req.body.userEmail.toLowerCase().trim(),
                    joinedAt: new Date(req.body.joinedAt),
                };

                // Validate required fields
                const requiredFields = ['eventId', 'userEmail', 'joinedAt'];
                for (const field of requiredFields) {
                    if (!joinData[field]) {
                        return res.status(400).json({ error: `${field} is required` });
                    }
                }

                // Validate eventId format
                if (!ObjectId.isValid(req.body.eventId)) {
                    console.log('Invalid event ID received for join:', req.body.eventId); // Debug log
                    return res.status(400).json({ error: `Invalid event ID format, received: ${req.body.eventId}` });
                }

                // Check if user has already joined
                const existingJoin = await eventJoinsCollection.findOne({
                    eventId: joinData.eventId,
                    userEmail: joinData.userEmail,
                });

                if (existingJoin) {
                    return res.status(400).json({ error: 'You have already joined this event' });
                }

                // Verify event exists
                const event = await eventsCollection.findOne({ _id: joinData.eventId });
                if (!event) {
                    return res.status(404).json({ error: 'Event not found' });
                }

                const result = await eventJoinsCollection.insertOne(joinData);
                res.status(201).json({ message: 'Successfully joined the event', joinId: result.insertedId });
            } catch (error) {
                console.error('Error joining event:', error);
                res.status(500).json({ error: `Failed to join event: ${error.message}` });
            }
        });

        // Get Joined Events API
        app.get('/event-joins/my-events', async (req, res) => {
            try {
                const userEmail = req.query.userEmail;
                console.log('Received userEmail for joined events:', userEmail); // Debug log
                if (!userEmail || typeof userEmail !== 'string') {
                    return res.status(400).json({ error: `userEmail is required and must be a string, received: ${userEmail}` });
                }

                // Find all join records for the user
                const joinRecords = await eventJoinsCollection
                    .find({ userEmail: userEmail.toLowerCase().trim() })
                    .toArray();

                // Extract event IDs
                const eventIds = joinRecords.map((join) => join.eventId);

                if (eventIds.length === 0) {
                    return res.status(200).json([]);
                }

                // Fetch events corresponding to the join records
                const events = await eventsCollection
                    .find({ _id: { $in: eventIds } })
                    .sort({ date: 1 })
                    .toArray();

                res.status(200).json(events);
            } catch (error) {
                console.error('Error fetching joined events:', error);
                res.status(500).json({ error: `Failed to fetch joined events: ${error.message}` });
            }
        });

        // Root route
        app.get('/', (req, res) => {
            res.send('Server is running successfully');
        });

        // Send a ping to confirm successful connection
        await client.db('admin').command({ ping: 1 });
        console.log('Pinged your deployment. You successfully connected to MongoDB!');
    } catch (error) {
        console.error('Error running server:', error);
        process.exit(1); // Exit on connection failure
    }
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server is running on ${port}`);
});