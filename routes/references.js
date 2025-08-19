const express = require('express');
const { uploadReference, getReferences, deleteReference } = require('../controllers/referenceController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes are protected
router.use(authMiddleware);

// Change routes to match the correct backend endpoint names
router.post('/', uploadReference);
router.get('/global', getReferences); // Special case for global references
router.get('/:titleId', getReferences);
router.delete('/:id', deleteReference);

module.exports = router; 