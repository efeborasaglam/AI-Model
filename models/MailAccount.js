const mongoose = require('mongoose');

const mailAccountSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        provider: { type: String, enum: ['gmail'], default: 'gmail' },
        email: { type: String, required: true },
        refreshToken: { type: String, required: true }, // stored encrypted
        syncing: { type: Boolean, default: false },
        needsReconnect: { type: Boolean, default: false },
        lastSyncAt: Date,
        lastResult: {
            scanned: Number,
            found: Number,
            skipped: Number,
            failed: Number,
            error: String,
        },
    },
    { timestamps: true }
);

mailAccountSchema.index({ user: 1, provider: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('MailAccount', mailAccountSchema);