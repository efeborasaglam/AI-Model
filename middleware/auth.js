const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
    const token = req.cookies.token;
    const isApi = req.originalUrl.startsWith('/api');

    if (!token) {
        return isApi ? res.status(401).json({ error: 'Nicht eingeloggt' }) : res.redirect('/login.html');
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.clearCookie('token');
        return isApi ? res.status(401).json({ error: 'Sitzung abgelaufen' }) : res.redirect('/login.html');
    }
};