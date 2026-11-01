const mongoose = require('mongoose');

const flagSchema = new mongoose.Schema(
    {
        type: String,
        severity: { type: String, enum: ['info', 'warn'], default: 'info' },
        message: String,
    },
    { _id: false }
);

const invoiceSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        vendor: String,
        vendorKey: { type: String, index: true },
        description: String,
        invoiceNumber: String,
        amount: Number,
        currency: { type: String, default: 'EUR' },
        issueDate: Date,
        dueDate: Date,
        iban: String,
        summary: String,
        flags: [flagSchema],
        status: { type: String, enum: ['to_review', 'reviewed', 'flagged'], default: 'to_review' },
        originalName: String,
        reminderLevel: { type: Number, default: 0 },
        source: { type: String, enum: ['upload', 'gmail', 'outlook'], default: 'upload' },
        mailFrom: String,
        mailSubject: String,
        messageId: String,
    },
    { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);