
const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const FormData = require('form-data');
const { pool } = require('../database');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure uploads directory exists synchronously at startup
if (!fsSync.existsSync(UPLOADS_DIR)) {
  fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Cache for API key validation
let apiKeyValidated = false;

// Reusable axios instance with optimized settings for OpenAI
const openaiClient = axios.create({
  baseURL: 'https://api.openai.com/v1',
  // timeout: 120000, // 2 minute timeout for image generation
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Connection': 'keep-alive'
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity
});

// Validate inputs early and cache API key check
function validateInputs(ideaId, prompt) {
  if (!ideaId) {
    throw new Error('Idea ID is required for image generation');
  }
  
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt is required for image generation');
  }
  
  if (!apiKeyValidated && !OPENAI_API_KEY) {
    throw new Error('OpenAI API key is missing. Please check your .env file.');
  }
  apiKeyValidated = true;
}

// Optimized database update function with parameter validation
async function updatePaintingStatus(ideaId, status, additionalFields = {}) {
  const baseFields = { status };
  const fields = { ...baseFields, ...additionalFields };
  
  const setClause = Object.keys(fields).map(key => `${key} = ?`).join(', ');
  const values = [...Object.values(fields), ideaId];
  
  // Validate parameters
  if (values.some(v => v === undefined)) {
    console.error('Invalid query parameters:', { values });
    throw new Error('Invalid query parameter detected');
  }
  
  await pool.execute(
    `UPDATE paintings SET ${setClause} WHERE idea_id = ?`,
    values
  );
}

// Optimized temporary file management
class TempFileManager {
  constructor() {
    this.tempFiles = [];
  }
  
  async createTempFile(base64Data, prefix = 'temp') {
    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
      const tempFilePath = path.join(UPLOADS_DIR, fileName);
      
      await fs.writeFile(tempFilePath, buffer);
      this.tempFiles.push(tempFilePath);
      
      return tempFilePath;
    } catch (error) {
      console.error('Error creating temp file:', error);
      throw error;
    }
  }
  
  async cleanup() {
    const cleanupPromises = this.tempFiles.map(async (filePath) => {
      try {
        if (fsSync.existsSync(filePath)) {
          await fs.unlink(filePath);
          console.log(`Deleted temp file: ${filePath}`);
        }
      } catch (error) {
        console.error(`Error deleting temp file ${filePath}:`, error);
      }
    });
    
    await Promise.all(cleanupPromises);
    this.tempFiles = [];
  }
}

// Optimized reference image processing
async function processReferenceImages(references, formData, tempFileManager) {
  if (!references || references.length === 0) return;
  
  console.log(`Processing ${references.length} reference images`);
  
  // Process reference images in parallel for better performance
  const processingPromises = references.map(async (ref, index) => {
    try {
      const base64Data = ref.image_data.split(',')[1];
      if (!base64Data) {
        console.warn(`Invalid base64 data for reference ${index}`);
        return;
      }
      
      const tempFilePath = await tempFileManager.createTempFile(base64Data, `ref_${index}`);
      formData.append('image[]', fsSync.createReadStream(tempFilePath));
      
      console.log(`Processed reference image ${index}`);
    } catch (error) {
      console.error(`Error processing reference image ${index}:`, error);
      // Continue with other images
    }
  });
  
  await Promise.all(processingPromises);
}

// Streamlined API request for generations with enhanced error handling
async function makeGenerationRequest(prompt) {
  const requestBody = {
    model: 'dall-e-3', // Use DALL-E 3 instead of gpt-image-1
    prompt: prompt.trim(),
    quality: 'hd',
    size: '1024x1024', // DALL-E 3 supports different sizes
    response_format: 'b64_json' // Request base64 format directly
  };
  
  console.log('Making generations API request with payload:', JSON.stringify(requestBody, null, 2));
  const startTime = Date.now();
  
  try {
    const response = await openaiClient.post('/images/generations', requestBody, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log(`Generations API completed (${Date.now() - startTime}ms)`);
    console.log('Response status:', response.status);
    console.log('Response data structure:', {
      hasData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : [],
      hasDataArray: !!response.data?.data,
      dataArrayLength: response.data?.data?.length,
      firstItemKeys: response.data?.data?.[0] ? Object.keys(response.data.data[0]) : []
    });
    
    return response;
  } catch (error) {
    console.error('Generations API detailed error:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      // More specific error messages based on status code
      switch (error.response.status) {
        case 401:
          throw new Error('Invalid OpenAI API key');
        case 403:
          throw new Error('OpenAI API access forbidden - check your subscription');
        case 429:
          throw new Error('OpenAI API rate limit exceeded');
        case 400:
          throw new Error(`Invalid request: ${error.response.data?.error?.message || 'Bad request'}`);
        case 500:
          throw new Error('OpenAI API server error');
        default:
          throw new Error(`OpenAI API error (${error.response.status}): ${error.response.data?.error?.message || JSON.stringify(error.response.data)}`);
      }
    } else if (error.request) {
      console.error('No response received from OpenAI API');
      console.error('Request details:', {
        method: error.request.method,
        url: error.request.url,
        timeout: error.code === 'ECONNABORTED'
      });
      throw new Error('No response received from OpenAI API - check your internet connection');
    } else {
      console.error('Request setup error:', error.message);
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}

// Streamlined API request for edits with enhanced error handling
async function makeEditsRequest(prompt, formData) {
  // Note: DALL-E 3 doesn't support edits, fallback to variations or generations
  console.warn('DALL-E 3 does not support edits endpoint, using generations instead');
  return makeGenerationRequest(prompt);
}

// Alternative function for DALL-E 2 if needed
async function makeDalle2GenerationRequest(prompt) {
  const requestBody = {
    model: 'dall-e-2',
    prompt: prompt.trim().substring(0, 1000), // DALL-E 2 has shorter prompt limit
    size: '1024x1024',
    response_format: 'b64_json'
  };
  
  console.log('Making DALL-E 2 generations API request');
  const startTime = Date.now();
  
  try {
    const response = await openaiClient.post('/images/generations', requestBody, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log(`DALL-E 2 API completed (${Date.now() - startTime}ms)`);
    return response;
  } catch (error) {
    console.error('DALL-E 2 API error:', error.response?.status, error.response?.data);
    throw error;
  }
}

// Optimized image data extraction and URL handling
async function extractImageData(response, hasReferences) {
  try {
    const imageResult = response.data.data[0];
    
    if (!imageResult) {
      throw new Error('No image data in API response');
    }
    
    // Handle base64 response
    if (imageResult.b64_json) {
      return imageResult.b64_json;
    }
    
    // Handle URL response (download and convert to base64)
    if (imageResult.url) {
      console.log('Downloading image from URL...');
      const startTime = Date.now();
      
      const imageResponse = await axios.get(imageResult.url, { 
        responseType: 'arraybuffer',
        // timeout: 30000 // 30 second timeout for image download
      });
      
      const imageData = Buffer.from(imageResponse.data).toString('base64');
      console.log(`Image download completed (${Date.now() - startTime}ms)`);
      
      return imageData;
    }
    
    throw new Error('No valid image data found in API response');
    
  } catch (error) {
    console.error('Error extracting image data:', error);
    console.error('Response structure:', JSON.stringify(response.data, null, 2));
    throw new Error('Failed to extract image data from API response');
  }
}

// Optimized file saving with async I/O
async function saveImageFile(ideaId, imageData) {
  const fileName = `painting_${ideaId}_${Date.now()}.png`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  
  const startTime = Date.now();
  await fs.writeFile(filePath, Buffer.from(imageData, 'base64'));
  console.log(`Image saved (${Date.now() - startTime}ms): ${filePath}`);
  
  return fileName;
}

// Main optimized image generation function
async function generateImage(ideaId, prompt, references = []) {
  console.log(`Starting image generation for idea ${ideaId}`, new Date());
  // console.log(`Prompt length: ${prompt?.length}, References: ${references?.length || 0}`);
  
  // Early validation
  validateInputs(ideaId, prompt);
  
  const tempFileManager = new TempFileManager();
  
  try {
    // Update status to processing
    await updatePaintingStatus(ideaId, 'processing');
    
    let response;
    const hasReferences = references && references.length > 0;
    
    // Try different models with fallback
    const models = ['dall-e-3', 'dall-e-2'];
    let lastError;
    
    for (const model of models) {
      try {
        if (hasReferences) {
          console.log(`Attempting with ${model} (references ignored - not supported)`);
          // Both DALL-E models don't support reference images in the way the original code expected
          // Use the prompt with a note about the references
          const enhancedPrompt = `${prompt} (inspired by provided reference images)`;
          
          if (model === 'dall-e-3') {
            response = await makeGenerationRequest(enhancedPrompt);
          } else {
            response = await makeDalle2GenerationRequest(enhancedPrompt);
          }
        } else {
          console.log(`Using ${model} for generations`);
          if (model === 'dall-e-3') {
            response = await makeGenerationRequest(prompt);
          } else {
            response = await makeDalle2GenerationRequest(prompt);
          }
        }
        
        // If we got here, the request was successful
        console.log(`Successfully generated image with ${model}`,new Date());
        break;
        
      } catch (error) {
        console.warn(`${model} failed:`, error.message);
        lastError = error;
        
        // If this was a client error (4xx), don't try other models
        if (error.message.includes('Invalid OpenAI API key') || 
            error.message.includes('access forbidden') ||
            error.message.includes('Invalid request')) {
          throw error;
        }
        
        // Continue to next model for other errors
        continue;
      }
    }
    
    // If no model worked, throw the last error
    if (!response) {
      throw lastError || new Error('All image generation models failed');
    }
    
    // Extract image data
    const imageData = await extractImageData(response, hasReferences);
    
    // Save image file
    const fileName = await saveImageFile(ideaId, imageData);
    
    // Prepare reference IDs for database
    const referenceIds = references
      .map(ref => ref.id)
      .filter(id => id != null);
    const usedReferenceIdsJSON = referenceIds.length > 0 ? JSON.stringify(referenceIds) : null;
    
    // Update database with completion status
    console.log('Updating database with completion status');
    await updatePaintingStatus(ideaId, 'completed', {
      image_url: `uploads/${fileName}`,
      image_data: `data:image/png;base64,${imageData}`,
      used_reference_ids: usedReferenceIdsJSON
    });
    
    console.log(`Image generation completed successfully for idea ${ideaId}`);
    
    return {
      ideaId,
      imageUrl: `uploads/${fileName}`,
      status: 'completed'
    };
    
  } catch (error) {
    console.error(`Error generating image for idea ${ideaId}:`, error);
    
    // Update status to failed
    try {
      const errorMsg = error.message || 'Unknown error';
      await updatePaintingStatus(ideaId, 'failed', {
        error_message: errorMsg.substring(0, 255)
      });
      console.log(`Updated status to failed for idea ${ideaId}`);
    } catch (dbError) {
      console.error('Error updating failure status:', dbError);
    }
    
    throw error;
  } finally {
    // Always cleanup temp files
    await tempFileManager.cleanup();
  }
}

module.exports = { generateImage };




