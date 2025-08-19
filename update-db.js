const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateDatabase() {
  let connection;
  
  try {
    console.log('Connecting to database...');
    // Create connection to database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    
    console.log('Connected to database successfully.');
    
    // Check if error_message column exists
    const [columns] = await connection.execute(`
      SHOW COLUMNS FROM paintings LIKE 'error_message'
    `);
    
    if (columns.length === 0) {
      console.log('Adding error_message column to paintings table...');
      
      // Add error_message column to paintings table
      await connection.execute(`
        ALTER TABLE paintings
        ADD COLUMN error_message VARCHAR(255) AFTER status
      `);
      
      console.log('Column added successfully.');
    } else {
      console.log('error_message column already exists in paintings table.');
    }
    
    console.log('Database update completed successfully.');
  } catch (error) {
    console.error('Error updating database:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

// Run the update function
updateDatabase(); 