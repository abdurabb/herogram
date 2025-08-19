const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database');
const authRoutes = require('./routes/auth');
const titleRoutes = require('./routes/titles');
const paintingRoutes = require('./routes/paintings');
const referenceRoutes = require('./routes/references');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/titles', titleRoutes);
app.use('/api/paintings', paintingRoutes);
app.use('/api/references', referenceRoutes);

// Config endpoint to provide server information to frontend
const serverIp  = process.env.SERVER_IP
app.get(`${serverIp}/api/config`, (req, res) => {
  res.json({
    serverIP: process.env.SERVER_IP,
    apiPort: process.env.PORT || 3000
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'AI Image Generator API' });
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.static(__dirname));

// Initialize database and start server
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  }); 