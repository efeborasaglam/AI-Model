require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']); // Fix für querySrv ECONNREFUSED
const invoiceRoutes = require('./routes/invoices')

const mailRoutes = require('./routes/mail');
const MailAccount = require('./models/MailAccount');

const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/mail', mailRoutes);

// Im Produktivbetrieb das gebaute React-Frontend ausliefern
if (process.env.NODE_ENV === 'production') {
    const dist = path.join(__dirname, 'client', 'dist');
    app.use(express.static(dist));
    app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 3000;

mongoose
    .connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('MongoDB verbunden');
        await MailAccount.updateMany({}, { syncing: false }); // clear stuck syncs after a restart
        app.listen(PORT, () => console.log(`API läuft auf http://localhost:${PORT}`));
    })
    .catch((err) => {
        console.error('MongoDB Verbindungsfehler:', err.message);
        process.exit(1);
    });