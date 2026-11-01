const express = require('express');
const multer = require('multer');
const Invoice = require('../models/Invoice');
const requireAuth = require('../middleware/auth');
const { processFile } = require('../services/pipeline');

const router = express.Router();
router.use(requireAuth);

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
}).single('file');

function uploadMiddleware(req, res, next) {
    upload(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}

router.post('/upload', uploadMiddleware, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Please upload a PDF, PNG or JPG (max 10 MB).' });

        const invoice = await processFile({
            userId: req.user.id,
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname,
        });
        res.status(201).json(invoice);
    } catch (err) {
        if (!err.status) console.error(err);
        res.status(err.status || 500).json({ error: err.message || 'Could not process this invoice.' });
    }
});

router.get('/', async (req, res) => {
    const invoices = await Invoice.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(invoices);
});

router.patch('/:id', async (req, res) => {
    const { status } = req.body;
    if (!['to_review', 'reviewed', 'flagged'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
    }
    const invoice = await Invoice.findOneAndUpdate(
        { _id: req.params.id, user: req.user.id },
        { status },
        { new: true }
    );
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    res.json(invoice);
});

router.delete('/:id', async (req, res) => {
    await Invoice.deleteOne({ _id: req.params.id, user: req.user.id });
    res.json({ ok: true });
});

module.exports = router;