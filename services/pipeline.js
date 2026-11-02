const Invoice = require('../models/Invoice');
const { pdfToImages, parseImage, extractInvoice, extractTextLayer, invoiceScore } = require('./nvidia');
const { validateInvoice } = require('./validate');

function fail(status, message) {
    const e = new Error(message);
    e.status = status;
    return e;
}

const toNumber = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[^\d,.-]/g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    return null;
};

const toDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? null : d;
};

// Mistral often misses the number in "2. Erinnerung", so read it from the text too
function detectReminderLevel(text) {
    const t = text.replace(/<(x|y)_[\d.]+>/g, '').replace(/<class_[\w-]+>/g, ' ');
    const m = t.match(/(\d)\.\*{0,2}\s*(?:Seite\s*\d+\s*\/\s*\d+)?\s*\*{0,2}\s*(Erinnerung|Mahnung)/i);
    if (m) return parseInt(m[1], 10);
    if (/(Zahlungserinnerung|Erinnerung|Mahnung)/i.test(t)) return 1;
    return null;
}

// Throws an error with .status = 422 if the file is not an invoice
async function processFile({ userId, buffer, mimetype, originalname, extra = {} }) {
    let text = '';

    if (mimetype === 'application/pdf') {
        text = (await extractTextLayer(buffer).catch(() => '')).trim();
        if (text.length > 200) {
            if (invoiceScore(text) < 2) throw fail(422, "This doesn't look like an invoice.");
            console.log('[pipeline] text layer found, Nemotron skipped');
        } else {
            text = ''; // scanned PDF, needs OCR
        }
    }

    if (!text) {
        const images = mimetype === 'application/pdf' ? await pdfToImages(buffer, 2) : [{ buffer, mime: mimetype }];
        const pages = await Promise.all(images.map((img) => parseImage(img.buffer, img.mime)));
        text = pages.join('\n\n---\n\n').trim();
    }
    if (!text) throw fail(422, 'Could not read any text from this file.');

    const ai = await extractInvoice(text);
    const looksLikeInvoice = ai.isInvoice || (ai.amount && (ai.invoiceNumber || ai.dueDate));
    if (!looksLikeInvoice) {
        throw fail(422, `This doesn't look like an invoice (detected: ${ai.category || 'other'}).`);
    }

    const fromText = detectReminderLevel(text);

    const clean = {
        vendor: ai.vendor || null,
        vendorKey: ai.vendor ? ai.vendor.trim().toLowerCase() : null,
        description: ai.description || null,
        invoiceNumber: ai.invoiceNumber || null,
        amount: toNumber(ai.amount),
        currency: ai.currency || 'EUR',
        reminderLevel: Math.max(fromText ?? 0, Number.isInteger(ai.reminderLevel) ? ai.reminderLevel : 0),
        issueDate: toDate(ai.issueDate),
        dueDate: toDate(ai.dueDate),
        iban: ai.iban ? String(ai.iban).replace(/\s+/g, '').toUpperCase() : null,
        summary: ai.summary || '',
    };

    const flags = await validateInvoice(userId, clean);
    return Invoice.create({ ...clean, flags, user: userId, originalName: originalname, ...extra });
}

module.exports = { processFile };