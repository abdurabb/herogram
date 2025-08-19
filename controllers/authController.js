const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
require('dotenv').config();

// Register a new user
async function register(req, res) {
  const { username, email, password } = req.body;
  
  // Validate input
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required' });
  }
  
  try {
    // Check if user already exists
    const checkParams = [email, username];
    if (checkParams.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { checkParams });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }
    
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      checkParams
    );
    
    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'User with this email or username already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const insertParams = [username, email, hashedPassword];
    if (insertParams.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { insertParams });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }
    
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      insertParams
    );
    
    // Generate token
    const token = jwt.sign(
      { id: result.insertId, username, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: result.insertId,
        username,
        email
      },
      token
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
}

// Login user
async function login(req, res) {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  try {
    // Find user
    const loginParams = [email];
    if (loginParams.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { loginParams });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }
    
    const [users] = await pool.execute(
      'SELECT id, username, email, password FROM users WHERE email = ?',
      loginParams
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = users[0];
    
    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
}

// Get current user
async function getMe(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  // User is already attached to req by auth middleware
  res.status(200).json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    }
  });
}

module.exports = {
  register,
  login,
  getMe
}; 