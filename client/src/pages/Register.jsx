import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const onSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await register(form.name, form.email, form.password);
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <div className="card">
            <h1>Konto erstellen</h1>
            <p className="sub">In wenigen Sekunden startklar.</p>

            <form onSubmit={onSubmit}>
                <label htmlFor="name">Name</label>
                <input id="name" name="name" type="text" required autoComplete="name"
                       value={form.name} onChange={onChange} />

                <label htmlFor="email">E-Mail</label>
                <input id="email" name="email" type="email" required autoComplete="email"
                       value={form.email} onChange={onChange} />

                <label htmlFor="password">Passwort (mind. 8 Zeichen)</label>
                <input id="password" name="password" type="password" required minLength={8}
                       autoComplete="new-password" value={form.password} onChange={onChange} />

                {error && <div className="error">{error}</div>}
                <button type="submit" disabled={busy}>{busy ? 'Bitte warten…' : 'Registrieren'}</button>
            </form>

            <p className="switch">Schon ein Konto? <Link to="/login">Einloggen</Link></p>
        </div>
    );
}