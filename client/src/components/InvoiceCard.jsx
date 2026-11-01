import { money, formatDate, dueInfo } from '../utils';

const STATUS = { to_review: 'Needs review', reviewed: 'Reviewed', flagged: 'Flagged' };
const ORDINAL = ['', '1st', '2nd', '3rd'];

export default function InvoiceCard({ invoice, onStatus, onDelete }) {
    const i = invoice;
    const due = dueInfo(i);

    return (
        <div className="invoice">
            <div className="invoice-head">
                <div>
                    <h3>{i.vendor || 'Unknown sender'}</h3>
                    <p className="muted">{i.description || i.originalName}</p>
                </div>
                <div className="right">
                    <div className="amount">{money(i.amount, i.currency)}</div>
                    <div className="badges">
                        {i.reminderLevel > 0 && (
                            <span className="badge late">{ORDINAL[i.reminderLevel] || `${i.reminderLevel}th`} reminder</span>
                        )}
                        {due && <span className={`badge ${due.cls}`}>{due.text}</span>}
                        <span className={`badge ${i.status}`}>{STATUS[i.status]}</span>
                    </div>
                </div>
            </div>

            {i.summary && <p className="summary">{i.summary}</p>}
            {i.source === 'gmail' && (
                <p className="muted source">From Gmail · {i.mailFrom || 'unknown sender'}{i.mailSubject ? ` · “${i.mailSubject}”` : ''}</p>
            )}

            <dl className="facts">
                <div><dt>Due</dt><dd>{formatDate(i.dueDate)}</dd></div>
                <div><dt>Invoice no.</dt><dd>{i.invoiceNumber || '—'}</dd></div>
                <div><dt>IBAN</dt><dd>{i.iban ? `${i.iban.slice(0, 4)} •••• ${i.iban.slice(-4)}` : '—'}</dd></div>
            </dl>

            {i.flags?.length > 0 && (
                <ul className="flags">
                    {i.flags.map((f, idx) => (
                        <li key={idx} className={f.severity}>{f.message}</li>
                    ))}
                </ul>
            )}

            <div className="actions">
                {i.status !== 'reviewed' && (
                    <button className="btn-sm" onClick={() => onStatus(i._id, 'reviewed')}>Mark as reviewed</button>
                )}
                {i.status !== 'flagged' && (
                    <button className="btn-sm ghost" onClick={() => onStatus(i._id, 'flagged')}>Flag issue</button>
                )}
                <button className="btn-sm ghost danger" onClick={() => onDelete(i._id)}>Delete</button>
            </div>
        </div>
    );
}