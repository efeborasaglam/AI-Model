const express = require('express');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const requireAuth = require('../middleware/auth');
const MailAccount = require('../models/MailAccount');
const { oauthClient, authUrl, startSync } = require('../services/gmail');
const { encrypt, decrypt } = require('../services/crypto');

const router = express.Router();
const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';

// Google redirects here. The user is identified by the signed "state", not by the cookie.
router.get('/google/callback', async (req, res) => {
    const back = (q) => res.redirect(`${clientUrl()}/mail?${q}`);
    try {
        if (req.query.error) return back(`error=${encodeURIComponent(req.query.error)}`);

        const state = jwt.verify(String(req.query.state), process.env.JWT_SECRET);
        if (state.purpose !== 'gmail') throw new Error('Invalid state');

        const auth = oauthClient();
        const { tokens } = await auth.getToken(String(req.query.code));
        if (!tokens.refresh_token) return back('error=no_refresh_token');

        auth.setCredentials(tokens);
        const profile = await google.gmail({ version: 'v1', auth }).users.getProfile({ userId: 'me' });
        const email = profile.data.emailAddress;

        await MailAccount.findOneAndUpdate(
            { user: state.id, provider: 'gmail', email },
            { refreshToken: encrypt(tokens.refresh_token), needsReconnect: false },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        back('connected=1');
    } catch (err) {
        console.error('[gmail] callback failed:', err.message);
        back('error=connect_failed');
    }
});

router.use(requireAuth);

router.get('/google/connect', (req, res) => {
    try {
        const state = jwt.sign({ id: req.user.id, purpose: 'gmail' }, process.env.JWT_SECRET, { expiresIn: '10m' });
        res.json({ url: authUrl(state) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/accounts', async (req, res) => {
    const accounts = await MailAccount.find({ user: req.user.id }).select('-refreshToken').sort({ createdAt: 1 });
    res.json(accounts);
});

router.post('/accounts/:id/sync', async (req, res) => {
    const account = await MailAccount.findOne({ _id: req.params.id, user: req.user.id });
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const started = await startSync(account._id, req.user.id);
    if (!started) return res.status(409).json({ error: 'A sync is already running.' });
    res.json({ ok: true });
});

router.delete('/accounts/:id', async (req, res) => {
    const account = await MailAccount.findOne({ _id: req.params.id, user: req.user.id });
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    try {
        await oauthClient().revokeToken(decrypt(account.refreshToken)); // best effort
    } catch {
        /* already revoked or expired */
    }
    await account.deleteOne();
    res.json({ ok: true });
});

module.exports = router;