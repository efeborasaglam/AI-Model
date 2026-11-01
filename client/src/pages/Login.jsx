import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const onSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await login(form.email, form.password);
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <div className="card">
            <h1>Willkommen zurück</h1>
            <p className="sub">Melde dich in deinem Konto an.</p>

            <form onSubmit={onSubmit}>
                <label htmlFor="email">E-Mail</label>
                <input id="email" name="email" type="email" required autoComplete="email"
                       value={form.email} onChange={onChange} />

                <label htmlFor="password">Passwort</label>
                <input id="password" name="password" type="password" required autoComplete="current-password"
                       value={form.password} onChange={onChange} />

                {error && <div className="error">{error}</div>}
                <button type="submit" disabled={busy}>{busy ? 'Bitte warten…' : 'Einloggen'}</button>
            </form>

            <p className="switch">Noch kein Konto? <Link to="/register">Registrieren</Link></p>
        </div>
    );
}