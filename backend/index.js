const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session'); 
const MongoStore = require('connect-mongo');
const app = express();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const DB_URI = 'mongodb+srv://:Mehul293645@techmartiiith.47mlw.mongodb.net/?retryWrites=true&w=majority&appName=TechMartIIITh';
const API_KEY = "AIzaSyCN0BByLHITqEzt3EQ-BLawAVaN7CQ-x1U";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const xml2js = require('xml2js');
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: DB_URI,
        ttl: 24 * 60 * 60
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(express.json());
app.use(cors({
    origin: ['http://localhost:3001'],
    credentials: true
}));

// const RECAPTCHA_SECRET_KEY = '6LeL8boqAAAAADYNo6XHBvxhryPouo5HcPNMivab';

mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    age: { type: Number, required: true },
    contactNumber: { type: String, required: true },
    password: { type: String, required: true },
    reviews: [{ type: String, required: true }],
});

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
});
const cartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId,ref:'Product', required: true },
    quantity: { type: Number, required: true, min: 1 }
});
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quantity: { type: Number, required: true },
    otp: { type: String, required: true },
    isDelivered: { type: Boolean, default: false },
    orderDate: { type: Date, default: Date.now }
});
const CAS_URL = 'https://login.iiit.ac.in/cas';
const SERVICE_URL = 'http://localhost:3000/api/cas/validate';

const Order = mongoose.model('Order', orderSchema);
const Cart = mongoose.model('Cart', cartSchema);
const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);

const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ message: 'Please log in to continue' });
    }
};

/**
 * Generate a response from the AI model
 * @param {string} prompt - User query or message
 * @param {string[]} sessionHistory - Previous chat history of the session
 * @returns {Promise<string>} - AI's response text
 */
const getAIResponse = async (prompt, sessionHistory) => {
    try {
        const fullPrompt = sessionHistory.join("\n") + `\nUser: ${prompt}\nAI:`;
        const result = await model.generateContent(fullPrompt);
        return result.response.text();
    } catch (error) {
        console.error("Error generating AI response:", error);
        return "I'm sorry, I couldn't process your request. Please try again later.";
    }
};

app.post("/api/chat", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required." });
    }
    if (!req.session.chatHistory) {
        req.session.chatHistory = [];
    }
    try {
        const response = await getAIResponse(prompt, req.session.chatHistory);
        req.session.chatHistory.push(`User: ${prompt}`);
        req.session.chatHistory.push(`AI: ${response}`);
        res.json({ response });
    } catch (error) {
        console.error("Error handling chat request:", error);
        res.status(500).json({ error: "Failed to process chat request." });
    }
});

app.post("/api/chat/reset", (req, res) => {
    if (req.session) {
        req.session.chatHistory = [];
    }
    res.json({ message: "Chat history reset successfully." });
});


app.post('/signup', async (req, res) => {
    const { firstName, lastName, email, age, contactNumber, password, recaptchaToken } = req.body;
    try {
        const recaptchaResponse = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify?secret=6Lc5z7oqAAAAAIsvrCUo0yB4f316Hou_7iIj-Ty-&response=${recaptchaToken}`
        );
        if (!recaptchaResponse.data.success) {
            return res.status(400).json({ message: 'Invalid reCAPTCHA' });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email is already registered.' });
        }
        req.session.pendingEmail = email;
        req.session.pendingUser = { firstName, lastName, email, age, contactNumber, password };
        const serviceURL = encodeURIComponent('http://localhost:3000/api/Signup/cas/validate');
        return res.json({ redirectUrl: `https://login.iiit.ac.in/cas/login?service=${serviceURL}` });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({
            message: 'An error occurred during signup. Please try again.',
            details: error.message
        });
    }
});
app.get('/api/Signup/cas/validate', async (req, res) => {
    const ticket = req.query.ticket;
    const serviceURL = 'http://localhost:3000/api/Signup/cas/validate';
    if (!ticket) {
        return res.redirect('/');
    }
    try {
        const validateURL = `https://login.iiit.ac.in/cas/serviceValidate?ticket=${ticket}&service=${encodeURIComponent(serviceURL)}`;
        const response = await axios.get(validateURL);
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        if (result['cas:serviceResponse']['cas:authenticationSuccess']) {
            const casUser = result['cas:serviceResponse']['cas:authenticationSuccess'][0]['cas:user'][0];
            const pendingEmail = req.session.pendingEmail;
            const pendingUser=req.session.pendingUser;
            req.session.pendingEmail = undefined;
            req.session.pendingUser = undefined;
            if (!pendingEmail) {
                return res.redirect('/');
            }
            // console.log(casUser);
            // console.log(pendingEmail);
            if (casUser === pendingEmail) {
                
                const hashedPassword = await bcrypt.hash(pendingUser.password, 10);
                const newUser = new User({
                    firstName: pendingUser.firstName,
                    lastName: pendingUser.lastName,
                    email: pendingUser.email,
                    age: pendingUser.age,
                    contactNumber: pendingUser.contactNumber,
                    password: hashedPassword
                });
                await newUser.save();
                req.session.userId = newUser._id;
                return res.redirect('/home');
            }
        }
        return res.redirect('/');
    } catch (error) {
        console.error('CAS validation error:', error);
        return res.redirect('/');
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password, recaptchaToken } = req.body;
    try {
        const recaptchaResponse = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify?secret=6Lc5z7oqAAAAAIsvrCUo0yB4f316Hou_7iIj-Ty-&response=${recaptchaToken}`
        );
        if (!recaptchaResponse.data.success) {
            return res.status(400).json({ message: 'Invalid reCAPTCHA' });
        }
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        req.session.pendingEmail = email;
        const serviceURL = encodeURIComponent('http://localhost:3000/api/cas/validate');
        return res.json({ redirectUrl: `https://login.iiit.ac.in/cas/login?service=${serviceURL}` });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add this new endpoint to clear the session
app.post('/api/clear-session', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
            res.status(500).json({ message: 'Failed to clear session' });
        } else {
            res.json({ message: 'Session cleared' });
        }
    });
});