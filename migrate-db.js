const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrateDatabase() {
  let connection;
  
  try {
    console.log('Connecting to MySQL...');
    // Create connection to MySQL without specifying a database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });
    
    console.log('Connected to MySQL successfully.');
    
    // Create the new database if it doesn't exist
    console.log('Creating new database if it doesn\'t exist...');
    await connection.execute(`
      CREATE DATABASE IF NOT EXISTS painting_generator
    `);
    
    // Check if old database exists
    const [oldDbResults] = await connection.execute(`
      SHOW DATABASES LIKE 'thumbnail_generator'
    `);
    
    if (oldDbResults.length === 0) {
      console.log('Old database (thumbnail_generator) does not exist. Creating new database structure only.');
      
      // Close the current connection
      await connection.end();
      
      // Create a new connection to the new database
      connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'painting_generator'
      });
      
      // Initialize database structure
      const { initializeDatabase } = require('./database');
      await initializeDatabase();
      
      console.log('New database structure created successfully.');
      return;
    }
    
    // Both databases exist, proceed with migration
    console.log('Both databases exist. Proceeding with migration...');
    
    // Get list of tables from the old database
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM information_schema.tables 
      WHERE table_schema = 'thumbnail_generator'
    `);
    
    console.log('Tables found:', tables);
    
    // Close the current connection
    await connection.end();
    
    // Create a new connection to the source database
    const sourceConnection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: 'thumbnail_generator'
    });
    
    // Create a new connection to the target database
    const targetConnection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: 'painting_generator'
    });
    
    // Initialize the target database structure
    console.log('Initializing target database structure...');
    const { initializeDatabase } = require('./database');
    await initializeDatabase();
    
    // Migrate data for each table
    for (const table of tables) {
      const tableName = table.TABLE_NAME;
      
      // Skip system tables
      if (typeof tableName === 'string' && tableName.startsWith('sys_')) {
        continue;
      }
      
      console.log(`Migrating data for table: ${tableName}...`);
      
      // Get data from source table
      const [rows] = await sourceConnection.execute(`SELECT * FROM ${tableName}`);
      
      if (rows.length === 0) {
        console.log(`  Table ${tableName} is empty. Skipping.`);
        continue;
      }
      
      console.log(`  Found ${rows.length} rows to migrate.`);
      
      // Special handling for thumbnails table (now paintings)
      if (tableName === 'thumbnails') {
        for (const row of rows) {
          // Insert each row into the paintings table
          const columns = Object.keys(row).join(', ');
          const placeholders = Object.keys(row).map(() => '?').join(', ');
          const values = Object.values(row);
          
          try {
            await targetConnection.execute(
              `INSERT INTO paintings (${columns}) VALUES (${placeholders})`,
              values
            );
          } catch (error) {
            console.error(`  Error inserting row into paintings table:`, error);
          }
        }
        console.log(`  Migrated thumbnails table to paintings table.`);
      } else {
        // For other tables, do a direct migration
        for (const row of rows) {
          const columns = Object.keys(row).join(', ');
          const placeholders = Object.keys(row).map(() => '?').join(', ');
          const values = Object.values(row);
          
          try {
            await targetConnection.execute(
              `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
              values
            );
          } catch (error) {
            console.error(`  Error inserting row into ${tableName} table:`, error);
          }
        }
        console.log(`  Migrated ${tableName} table.`);
      }
    }
    
    console.log('Migration completed successfully.');
    
    // Close connections
    await sourceConnection.end();
    await targetConnection.end();
    
  } catch (error) {
    console.error('Error during database migration:', error);
  } finally {
    if (connection && connection.end) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

// Run the migration function
migrateDatabase(); 