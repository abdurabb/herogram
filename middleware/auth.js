const jwt = require('jsonwebtoken');
const { pool } = require('../database');
require('dotenv').config();

async function authMiddleware(req, res, next) {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if the decoded token has an id
    if (!decoded || !decoded.id) {
      console.error('Invalid token payload:', decoded);
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    
    // Get user from database
    const [users] = await pool.execute(
      'SELECT id, username, email FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Ensure the user object has an id property
    if (!users[0].id) {
      console.error('User record missing id:', users[0]);
      return res.status(500).json({ error: 'Invalid user data' });
    }
    
    // Attach user to request
    req.user = users[0];
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = authMiddleware; 