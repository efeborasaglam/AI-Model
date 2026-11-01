export const money = (n, c) =>
    n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: c || 'EUR' }).format(n);

export const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

// days from today until the due date (negative = overdue)
export function daysUntil(d) {
    if (!d) return null;
    const due = new Date(d);
    const now = new Date();
    const a = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((a - b) / 86400000);
}

export function dueInfo(invoice) {
    if (invoice.status === 'reviewed') return null;
    const left = daysUntil(invoice.dueDate);
    if (left === null) return null;
    if (left < 0) return { text: `${-left} days overdue`, cls: 'late' };
    if (left === 0) return { text: 'Due today', cls: 'soon' };
    if (left <= 7) return { text: `Due in ${left} days`, cls: 'soon' };
    return null;
}