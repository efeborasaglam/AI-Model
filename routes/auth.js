const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Tage
};

function setToken(res, user) {
    const token = jwt.sign(
        { id: user._id, name: user.name, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.cookie('token', token, cookieOptions);
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Registrieren
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Bitte alle Felder ausfüllen.' });
        }
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' });
        }

        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) {
            return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert.' });
        }

        const hashed = await bcrypt.hash(password, 12);
        const user = await User.create({ name, email, password: hashed });

        setToken(res, user);
        res.status(201).json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'E-Mail und Passwort eingeben.' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        const valid = user && (await bcrypt.compare(password, user.password));

        if (!valid) {
            return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
        }

        setToken(res, user);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Serverfehler.' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ ok: true });
});

// Aktueller User
router.get('/me', requireAuth, (req, res) => {
    res.json({ name: req.user.name, email: req.user.email });
});

module.exports = router;