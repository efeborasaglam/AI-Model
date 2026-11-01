const { google } = require('googleapis');
const MailAccount = require('../models/MailAccount');
const ProcessedAttachment = require('../models/ProcessedAttachment');
const { processFile } = require('./pipeline');
const { decrypt } = require('./crypto');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']; // read only, Milo never sends or deletes
const QUERY =
    'has:attachment filename:pdf newer_than:90d (rechnung OR invoice OR mahnung OR erinnerung OR zahlung OR payment OR facture OR fattura OR bill)';
const MAX_PER_SYNC = 5; // attachments per sync (each one takes ~30-60 s of AI time); press sync again for more
const MAX_BYTES = 10 * 1024 * 1024;

function oauthClient() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
        throw new Error('Google credentials are missing in .env');
    }
    return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

function authUrl(state) {
    return oauthClient().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state,
    });
}

function collectAttachments(part, out = []) {
    if (!part) return out;
    const name = part.filename || '';
    const isPdf = part.mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
    if (name && isPdf && part.body?.attachmentId) {
        out.push({ filename: name, attachmentId: part.body.attachmentId, size: part.body.size || 0 });
    }
    (part.parts || []).forEach((p) => collectAttachments(p, out));
    return out;
}

function header(msg, name) {
    const h = (msg.data.payload?.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
    return h?.value || '';
}

async function syncAccount(accountId) {
    const account = await MailAccount.findById(accountId);
    if (!account) return;

    const result = { scanned: 0, found: 0, skipped: 0, failed: 0, error: null };
    let needsReconnect = false;

    try {
        const auth = oauthClient();
        auth.setCredentials({ refresh_token: decrypt(account.refreshToken) });
        const gmail = google.gmail({ version: 'v1', auth });

        const list = await gmail.users.messages.list({ userId: 'me', q: QUERY, maxResults: 30 });
        const ids = (list.data.messages || []).map((m) => m.id);
        result.scanned = ids.length;

        let handled = 0;

        outer: for (const id of ids) {
            const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
            const from = header(msg, 'From');
            const subject = header(msg, 'Subject');

            for (const att of collectAttachments(msg.data.payload)) {
                const key = `${account._id}:${id}:${att.filename}:${att.size}`;
                if (await ProcessedAttachment.exists({ user: account.user, key })) continue;
                if (handled >= MAX_PER_SYNC) break outer;
                handled++;

                if (att.size > MAX_BYTES) {
                    await ProcessedAttachment.create({ user: account.user, key }).catch(() => {});
                    result.skipped++;
                    continue;
                }

                try {
                    const a = await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: att.attachmentId });
                    const buffer = Buffer.from(a.data.data, 'base64url');

                    await processFile({
                        userId: account.user,
                        buffer,
                        mimetype: 'application/pdf',
                        originalname: att.filename,
                        extra: { source: 'gmail', mailFrom: from, mailSubject: subject, messageId: id },
                    });
                    await ProcessedAttachment.create({ user: account.user, key }).catch(() => {});
                    result.found++;
                } catch (err) {
                    if (err.status === 422) {
                        // readable, but not an invoice: remember it so we never pay for the AI again
                        await ProcessedAttachment.create({ user: account.user, key }).catch(() => {});
                        result.skipped++;
                    } else {
                        // technical error (AI timeout etc.): not remembered, so the next sync tries again
                        console.error('[gmail] failed:', att.filename, err.message);
                        result.failed++;
                    }
                }
            }
        }
    } catch (err) {
        console.error('[gmail] sync failed:', err.message);
        if (/invalid_grant/.test(err.message)) {
            needsReconnect = true;
            result.error = 'Google access has expired. Please reconnect this account.';
        } else {
            result.error = err.message;
        }
    } finally {
        await MailAccount.updateOne(
            { _id: account._id },
            {
                syncing: false,
                lastSyncAt: new Date(),
                lastResult: result,
                ...(needsReconnect ? { needsReconnect: true } : {}),
            }
        );
    }
}

// Starts a sync in the background. Returns false if one is already running.
async function startSync(accountId, userId) {
    const account = await MailAccount.findOneAndUpdate(
        { _id: accountId, user: userId, syncing: false },
        { syncing: true },
        { new: true }
    );
    if (!account) return false;
    syncAccount(account._id).catch((e) => console.error('[gmail]', e));
    return true;
}

module.exports = { oauthClient, authUrl, startSync };