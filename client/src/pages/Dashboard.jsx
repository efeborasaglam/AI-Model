import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { money, daysUntil } from '../utils';
import UploadBox from '../components/UploadBox';
import InvoiceCard from '../components/InvoiceCard';
import Horizon from '../components/Horizon';

const TABS = [
    { id: 'all', label: 'All', test: () => true },
    { id: 'review', label: 'Needs review', test: (i) => i.status === 'to_review' },
    {
        id: 'upcoming',
        label: 'Upcoming',
        test: (i) => i.status !== 'reviewed' && daysUntil(i.dueDate) !== null && daysUntil(i.dueDate) >= 0,
    },
    {
        id: 'attention',
        label: 'Needs a closer look',
        test: (i) => i.status === 'flagged' || (i.status !== 'reviewed' && i.flags?.some((f) => f.severity === 'warn')),
    },
    { id: 'reviewed', label: 'Reviewed', test: (i) => i.status === 'reviewed' },
];

export default function Dashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('all');
    const [query, setQuery] = useState('');

    useEffect(() => {
        api('/api/invoices')
            .then(setInvoices)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const onStatus = async (id, status) => {
        try {
            const updated = await api(`/api/invoices/${id}`, { method: 'PATCH', body: { status } });
            setInvoices((list) => list.map((i) => (i._id === id ? updated : i)));
        } catch (e) {
            setError(e.message);
        }
    };

    const onDelete = async (id) => {
        if (!window.confirm('Delete this invoice?')) return;
        try {
            await api(`/api/invoices/${id}`, { method: 'DELETE' });
            setInvoices((list) => list.filter((i) => i._id !== id));
        } catch (e) {
            setError(e.message);
        }
    };

    const open = invoices.filter((i) => i.status !== 'reviewed');

    const byCurrency = open.reduce((acc, i) => {
        const c = i.currency || 'EUR';
        acc[c] = (acc[c] || 0) + (i.amount || 0);
        return acc;
    }, {});
    const openText = Object.entries(byCurrency).map(([c, n]) => money(n, c)).join(' + ') || '—';
    const overdue = open.filter((i) => daysUntil(i.dueDate) < 0).length;

    const counts = useMemo(
        () => Object.fromEntries(TABS.map((t) => [t.id, invoices.filter(t.test).length])),
        [invoices]
    );

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const current = TABS.find((t) => t.id === tab);

        let list = invoices.filter(current.test);
        if (q) {
            list = list.filter((i) =>
                [i.vendor, i.description, i.invoiceNumber, i.summary].some((v) => v && v.toLowerCase().includes(q))
            );
        }
        if (tab === 'upcoming') {
            list = [...list].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        }
        return list;
    }, [invoices, tab, query]);

    return (
        <div className="app">
            <header className="topbar">
                <div>
                    <p className="eyebrow">Nothing missed. Nothing paid twice.</p>
                    <h1>Hello, {user.name}</h1>
                </div>
                <div className="header-actions">
                    <button className="btn-sm ghost" onClick={() => navigate('/mail')}>Mail accounts</button>
                    <button className="btn-sm ghost" onClick={async () => { await logout(); navigate('/login'); }}>
                        Log out
                    </button>
                </div>
            </header>

            <section className="stats">
                <div className="stat"><span>{open.length}</span><p>Awaiting your review</p></div>
                <div className="stat"><span>{openText}</span><p>Open amount</p></div>
                <div className={`stat ${overdue ? 'alert' : ''}`}><span>{overdue}</span><p>Overdue</p></div>
            </section>

            <Horizon invoices={invoices} />

            <UploadBox onUploaded={(inv) => setInvoices((list) => [inv, ...list])} />

            {error && <div className="error">{error}</div>}

            <div className="toolbar">
                <div className="tabs">
                    {TABS.map((t) => (
                        <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                            {t.label} <span className="count">{counts[t.id]}</span>
                        </button>
                    ))}
                </div>
                <input
                    className="search"
                    type="search"
                    placeholder="Search invoices…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>

            {loading && <p className="center">Loading…</p>}
            {!loading && invoices.length === 0 && <p className="center">No invoices yet. Upload your first one above.</p>}
            {!loading && invoices.length > 0 && visible.length === 0 && (
                <p className="center">Nothing here{query ? ' for this search' : ''}.</p>
            )}

            <section className="list">
                {visible.map((inv) => (
                    <InvoiceCard key={inv._id} invoice={inv} onStatus={onStatus} onDelete={onDelete} />
                ))}
            </section>
        </div>
    );
}