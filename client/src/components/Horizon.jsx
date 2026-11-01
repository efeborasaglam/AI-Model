import { money, daysUntil } from '../utils';

function label(left) {
    if (left < 0) return `${-left} days overdue`;
    if (left === 0) return 'Due today';
    if (left === 1) return 'Due tomorrow';
    return `In ${left} days`;
}

export default function Horizon({ invoices }) {
    const items = invoices
        .filter((i) => i.status !== 'reviewed' && i.dueDate)
        .map((i) => ({ i, left: daysUntil(i.dueDate) }))
        .filter((x) => x.left <= 14)
        .sort((a, b) => a.left - b.left);

    if (items.length === 0) return null;

    return (
        <section className="horizon">
            <div className="horizon-head">
                <h2>On the horizon</h2>
                <span className="muted">Next 14 days</span>
            </div>
            <ul>
                {items.map(({ i, left }) => {
                    const d = new Date(i.dueDate);
                    return (
                        <li key={i._id} className={left < 0 ? 'late' : left <= 3 ? 'soon' : ''}>
                            <div className="date-box">
                                <strong>{String(d.getUTCDate()).padStart(2, '0')}</strong>
                                <span>{d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>
                            </div>
                            <div className="horizon-main">
                                <div>{i.vendor || 'Unknown sender'}</div>
                                <small>{label(left)}</small>
                            </div>
                            <div className="horizon-amount">{money(i.amount, i.currency)}</div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}