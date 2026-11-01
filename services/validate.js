const Invoice = require('../models/Invoice');

const fmt = (n, c) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: c || 'EUR' }).format(n);

async function validateInvoice(userId, inv) {
    const flags = [];
    const level = inv.reminderLevel || 0;

    if (level > 0) {
        flags.push({ type: 'reminder', severity: 'warn', message: `This is reminder no. ${level}. Payment may already be overdue.` });
    }
    if (!inv.vendor) flags.push({ type: 'missing_vendor', severity: 'warn', message: 'Sender could not be detected.' });
    if (!(inv.amount > 0)) flags.push({ type: 'missing_amount', severity: 'warn', message: 'No valid amount found.' });
    if (!inv.dueDate) flags.push({ type: 'missing_due_date', severity: 'warn', message: 'No due date found.' });
    if (!inv.iban) flags.push({ type: 'missing_iban', severity: 'info', message: 'No IBAN found.' });

    if (inv.vendorKey) {
        if (inv.invoiceNumber) {
            const dup = await Invoice.findOne({ user: userId, vendorKey: inv.vendorKey, invoiceNumber: inv.invoiceNumber });
            if (dup) {
                flags.push(
                    level > 0
                        ? { type: 'reminder_of_existing', severity: 'info', message: 'You already uploaded this invoice. Make sure you only pay once.' }
                        : { type: 'duplicate', severity: 'warn', message: 'This invoice number was already uploaded.' }
                );
            }
        }

        const previous = await Invoice.find({ user: userId, vendorKey: inv.vendorKey }).sort({ createdAt: -1 }).limit(6);
        const last = previous[0];

        if (last) {
            if (last.iban && inv.iban && last.iban !== inv.iban) {
                flags.push({ type: 'iban_changed', severity: 'warn', message: 'Payee IBAN differs from the previous invoice.' });
            }
            if (last.amount && inv.amount && last.currency === inv.currency) {
                const diff = inv.amount - last.amount;
                if (Math.abs(diff) > 10) {
                    flags.push({
                        type: 'amount_changed',
                        severity: 'warn',
                        message: `${fmt(Math.abs(diff), inv.currency)} ${diff > 0 ? 'higher' : 'lower'} than the last invoice.`,
                    });
                }
            }
        }
        if (previous.length && !flags.some((f) => f.type === 'iban_changed')) {
            flags.push({ type: 'known_sender', severity: 'info', message: `Matches ${previous.length} previous invoice(s) from this sender.` });
        }
    }

    return flags;
}

module.exports = { validateInvoice };