const { pool } = require('../database');

// Create a new title
async function createTitle(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { title, instructions } = req.body;
  const userId = req.user.id;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  try {
    const params = [userId, title, instructions || null];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [result] = await pool.execute(
      'INSERT INTO titles (user_id, title, instructions) VALUES (?, ?, ?)',
      params
    );
    
    res.status(201).json({
      id: result.insertId,
      title,
      instructions,
      created_at: new Date()
    });
  } catch (error) {
    console.error('Error creating title:', error);
    res.status(500).json({ error: 'Failed to create title' });
  }
}

// Get all titles for the current user
async function getTitles(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.id;
  
  try {
    const params = [userId];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [rows] = await pool.execute(
      'SELECT id, title, instructions, created_at FROM titles WHERE user_id = ? ORDER BY created_at DESC',
      params
    );
    
    res.status(200).json({ titles: rows });
  } catch (error) {
    console.error('Error getting titles:', error);
    res.status(500).json({ error: 'Failed to get titles' });
  }
}

// Get a single title by ID
async function getTitle(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const userId = req.user.id;
  
  if (!id) {
    return res.status(400).json({ error: 'Title ID is required' });
  }
  
  try {
    const params = [id, userId];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [rows] = await pool.execute(
      'SELECT id, title, instructions, created_at FROM titles WHERE id = ? AND user_id = ?',
      params
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Title not found' });
    }
    
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error getting title:', error);
    res.status(500).json({ error: 'Failed to get title' });
  }
}

// Update a title
async function updateTitle(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const { title, instructions } = req.body;
  const userId = req.user.id;
  
  if (!id) {
    return res.status(400).json({ error: 'Title ID is required' });
  }
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  try {
    const params = [title, instructions || null, id, userId];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [result] = await pool.execute(
      'UPDATE titles SET title = ?, instructions = ? WHERE id = ? AND user_id = ?',
      params
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Title not found or you don\'t have permission to update it' });
    }
    
    res.status(200).json({
      id: parseInt(id),
      title,
      instructions,
      updated_at: new Date()
    });
  } catch (error) {
    console.error('Error updating title:', error);
    res.status(500).json({ error: 'Failed to update title' });
  }
}

// Delete a title
async function deleteTitle(req, res) {
  if (!req.user || !req.user.id) {
    console.error('User not authenticated properly');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const userId = req.user.id;
  
  if (!id) {
    return res.status(400).json({ error: 'Title ID is required' });
  }
  
  try {
    const params = [id, userId];
    // Validate parameters
    if (params.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { params });
      return res.status(500).json({ error: 'Internal server error: Invalid query parameter detected' });
    }

    const [result] = await pool.execute(
      'DELETE FROM titles WHERE id = ? AND user_id = ?',
      params
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Title not found or you don\'t have permission to delete it' });
    }
    
    res.status(200).json({ message: 'Title deleted successfully' });
  } catch (error) {
    console.error('Error deleting title:', error);
    res.status(500).json({ error: 'Failed to delete title' });
  }
}

module.exports = {
  createTitle,
  getTitles,
  getTitle,
  updateTitle,
  deleteTitle
}; 