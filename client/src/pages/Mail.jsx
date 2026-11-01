import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

const ERRORS = {
    access_denied: 'You cancelled the connection.',
    no_refresh_token: 'Google did not return a long-lived token. Remove Milo at myaccount.google.com/permissions and try again.',
    connect_failed: 'Could not connect this account. Check the server terminal for details.',
};

function ago(date) {
    if (!date) return 'Never synced';
    const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'Synced just now';
    if (s < 3600) return `Synced ${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `Synced ${Math.floor(s / 3600)} h ago`;
    return `Synced ${Math.floor(s / 86400)} days ago`;
}

export default function Mail() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const urlError = params.get('error');

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(urlError ? ERRORS[urlError] || 'Something went wrong.' : '');
    const [notice, setNotice] = useState(params.get('connected') ? 'Gmail connected. Press "Sync now" to read your mail.' : '');

    const load = useCallback(
        () =>
            api('/api/mail/accounts')
                .then(setAccounts)
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false)),
        []
    );

    useEffect(() => {
        load();
        if (params.toString()) setParams({}, { replace: true }); // clean the URL
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    const syncing = accounts.some((a) => a.syncing);
    useEffect(() => {
        if (!syncing) return;
        const t = setInterval(load, 3000);
        return () => clearInterval(t);
    }, [syncing, load]);

    const connect = async () => {
        setError('');
        try {
            const { url } = await api('/api/mail/google/connect');
            window.location.href = url;
        } catch (e) {
            setError(e.message);
        }
    };

    const sync = async (id) => {
        setError('');
        setNotice('');
        try {
            await api(`/api/mail/accounts/${id}/sync`, { method: 'POST' });
            setAccounts((list) => list.map((a) => (a._id === id ? { ...a, syncing: true } : a)));
        } catch (e) {
            setError(e.message);
        }
    };

    const remove = async (id) => {
        if (!window.confirm('Disconnect this account? Invoices already found stay in your dashboard.')) return;
        try {
            await api(`/api/mail/accounts/${id}`, { method: 'DELETE' });
            setAccounts((list) => list.filter((a) => a._id !== id));
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <div className="app">
            <header className="topbar">
                <div>
                    <p className="eyebrow">A clearer inbox</p>
                    <h1>Integrate Mail</h1>
                </div>
                <button className="btn-sm ghost" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
            </header>

            {notice && <div className="notice">{notice}</div>}
            {error && <div className="error">{error}</div>}
            {loading && <p className="center">Loading…</p>}

            <section className="list">
                {accounts.map((a) => (
                    <div className="account" key={a._id}>
                        <div>
                            <h3>{a.email}</h3>
                            <p className="muted">
                                Gmail · {a.syncing ? 'Reading your mail… this can take a few minutes' : ago(a.lastSyncAt)}
                            </p>
                            {a.lastResult && !a.syncing && (
                                <p className="muted">
                                    {a.lastResult.scanned} mails checked · {a.lastResult.found} invoices found · {a.lastResult.skipped} skipped
                                    {a.lastResult.failed > 0 && ` · ${a.lastResult.failed} failed (will retry)`}
                                </p>
                            )}
                            {a.lastResult?.error && <p className="account-error">{a.lastResult.error}</p>}
                        </div>
                        <div className="btns">
                            {a.needsReconnect ? (
                                <button className="btn-sm" onClick={connect}>Reconnect</button>
                            ) : (
                                <button className="btn-sm" disabled={a.syncing} onClick={() => sync(a._id)}>
                                    {a.syncing ? 'Syncing…' : 'Sync now'}
                                </button>
                            )}
                            <button className="btn-sm ghost danger" onClick={() => remove(a._id)}>Disconnect</button>
                        </div>
                    </div>
                ))}
            </section>

            <div className="connect-box">
                <h3>Make room for another inbox</h3>
                <p className="muted">Secure, read-only connection. Milo never sends, deletes or pays anything.</p>
                <button className="btn-sm" onClick={connect}>Connect Gmail</button>
            </div>
        </div>
    );
}