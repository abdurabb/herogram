const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create titles table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS titles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create references2 table (changed from references)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS references2 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title_id INT,
        user_id INT NOT NULL,
        image_data LONGTEXT NOT NULL,
        is_global BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create ideas table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ideas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title_id INT NOT NULL,
        summary TEXT NOT NULL,
        full_prompt TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE
      )
    `);
    
    // Create paintings table (renamed from thumbnails)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS paintings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title_id INT NOT NULL,
        idea_id INT NOT NULL,
        image_url VARCHAR(255),
        image_data LONGTEXT,
        status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
        error_message VARCHAR(255),
        used_reference_ids TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE,
        FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
      )
    `);
    
    connection.release();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

module.exports = { pool, initializeDatabase }; 