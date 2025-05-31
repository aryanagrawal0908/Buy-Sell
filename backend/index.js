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
