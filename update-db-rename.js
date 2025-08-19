const mysql = require('mysql2/promise');
require('dotenv').config();

async function renameTable() {
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
    
    // Check if paintings table already exists
    const [tables] = await connection.execute(`
      SHOW TABLES LIKE 'paintings'
    `);
    
    if (tables.length > 0) {
      console.log('The paintings table already exists. Migration already completed.');
      return;
    }

    // Check if thumbnails table exists
    const [thumbnailsTables] = await connection.execute(`
      SHOW TABLES LIKE 'thumbnails'
    `);
    
    if (thumbnailsTables.length === 0) {
      console.log('The thumbnails table does not exist. Cannot perform migration.');
      return;
    }

    console.log('Renaming thumbnails table to paintings...');
    
    // Rename thumbnails table to paintings
    await connection.execute(`
      RENAME TABLE thumbnails TO paintings
    `);
    
    console.log('Table renamed successfully.');
    
    console.log('Database migration completed successfully.');
  } catch (error) {
    console.error('Error during database migration:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

// Run the migration function
renameTable(); 