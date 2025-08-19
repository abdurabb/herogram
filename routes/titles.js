const express = require('express');
const { createTitle, getTitles, getTitle, updateTitle, deleteTitle } = require('../controllers/titleController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(authMiddleware);

router.post('/', createTitle);
router.get('/', getTitles);
router.get('/:id', getTitle);
router.put('/:id', updateTitle);
router.delete('/:id', deleteTitle);

module.exports = router; 