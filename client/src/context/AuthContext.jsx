import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api('/api/auth/me')
            .then(setUser)
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    const login = async (email, password) => {
        await api('/api/auth/login', { method: 'POST', body: { email, password } });
        setUser(await api('/api/auth/me'));
    };

    const register = async (name, email, password) => {
        await api('/api/auth/register', { method: 'POST', body: { name, email, password } });
        setUser(await api('/api/auth/me'));
    };

    const logout = async () => {
        await api('/api/auth/logout', { method: 'POST' });
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);