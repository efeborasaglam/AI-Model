const mongoose = require('mongoose');

const schema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        key: { type: String, required: true },
    },
    { timestamps: true }
);
schema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('ProcessedAttachment', schema);