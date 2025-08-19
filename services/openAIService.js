const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { pool } = require('../database');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Function to generate an image using OpenAI's gpt-image-1 model
async function generateImage(ideaId, prompt, references = []) {
  const tempFiles = []; // Initialize tempFiles array
  
  try {
    console.log(`Starting image generation for idea ${ideaId}`);
    console.log(`Using API key: ${OPENAI_API_KEY ? 'API key exists' : 'NO API KEY FOUND!'}`);
    
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key is missing. Please check your .env file.');
    }
    
    if (!ideaId) {
      throw new Error('Idea ID is required for image generation');
    }
    
    // First update status to processing
    const statusUpdateParams = ['processing', ideaId];
    // Validate parameters
    if (statusUpdateParams.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { statusUpdateParams });
      throw new Error('Invalid query parameter detected');
    }
    
    await pool.execute(
      'UPDATE paintings SET status = ? WHERE idea_id = ?',
      statusUpdateParams
    );
    console.log(`Updated status to processing for idea ${ideaId}`);

    let response;
    
    if (references && references.length > 0) {
      console.log(`Using ${references.length} reference images for edits endpoint`);
      // Use the edits endpoint when there are reference images
      const formData = new FormData();
      formData.append('model', 'gpt-image-1');
      formData.append('prompt', prompt);
      formData.append('size', '1536x1024');
      formData.append('quality', 'high');
      
      // Add reference images
      for (const ref of references) {
        try {
          // Extract base64 data
          const base64Data = ref.image_data.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          const tempFilePath = path.join(UPLOADS_DIR, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.png`);
          
          // Save to temp file
          fs.writeFileSync(tempFilePath, buffer);
          console.log(`Created temp file ${tempFilePath}`);
          
          // Append to form
          formData.append('image[]', fs.createReadStream(tempFilePath));
          
          // Track temp file for cleanup
          tempFiles.push(tempFilePath);
        } catch (err) {
          console.error('Error processing reference image:', err);
          // Continue with other images if one fails
        }
      }
      
      try {
        console.log('Making request to OpenAI edits endpoint');
        response = await axios.post('https://api.openai.com/v1/images/edits', formData, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            ...formData.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        console.log('OpenAI edits response received');
      } catch (error) {
        console.error('OpenAI edits API error:');
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data, null, 2));
          throw new Error(`OpenAI API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          console.error('No response received');
          throw new Error('No response received from OpenAI API');
        } else {
          console.error('Error message:', error.message);
          throw error;
        }
      } finally {
        // Cleanup temp files
        for (const tempFile of tempFiles) {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            console.log(`Deleted temp file ${tempFile}`);
          }
        }
      }
    } else {
      console.log('No reference images, using generations endpoint');
      // Use the generations endpoint when there are no reference images
      try {
        const requestBody = {
          model: 'gpt-image-1',
          prompt: prompt,
          quality: 'high',
          size: '1536x1024'
        };
        console.log('Making request to OpenAI generations endpoint with payload:', JSON.stringify(requestBody, null, 2));
        
        response = await axios.post('https://api.openai.com/v1/images/generations', requestBody, {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('OpenAI generations response received');
      } catch (error) {
        console.error('OpenAI generations API error:');
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data, null, 2));
          throw new Error(`OpenAI API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          console.error('No response received');
          throw new Error('No response received from OpenAI API');
        } else {
          console.error('Error message:', error.message);
          throw error;
        }
      }
    }

    // Get the generated image as base64
    let imageData;
    try {
      if (references.length > 0) {
        imageData = response.data.data[0].b64_json;
      } else {
        // Handle both response formats - older format used b64_json, newer format uses url
        if (response.data.data[0].b64_json) {
          imageData = response.data.data[0].b64_json;
        } else if (response.data.data[0].url) {
          // If we got a URL instead of base64, we need to download the image
          console.log('Received URL instead of base64, downloading image...');
          const imageResponse = await axios.get(response.data.data[0].url, { responseType: 'arraybuffer' });
          imageData = Buffer.from(imageResponse.data).toString('base64');
        } else {
          throw new Error('No image data found in response');
        }
      }
      console.log('Successfully extracted image data from response');
    } catch (error) {
      console.error('Error extracting image data from response:', error);
      console.error('Response structure:', JSON.stringify(response.data, null, 2));
      throw new Error('Invalid response format from OpenAI API');
    }

    // Save image to disk
    const fileName = `painting_${ideaId}_${Date.now()}.png`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
    console.log(`Saved image to ${filePath}`);

    const referenceIds = references.map(ref => ref.id).filter(id => id != null);
    const usedReferenceIdsJSON = referenceIds.length > 0 ? JSON.stringify(referenceIds) : null;

    // Update database with image URL and status
    const completeUpdateParams = [`uploads/${fileName}`, `data:image/png;base64,${imageData}`, 'completed', usedReferenceIdsJSON, ideaId];
    // Validate parameters
    if (completeUpdateParams.some(p => p === undefined)) {
      console.error('Attempted to execute query with undefined parameter:', { completeUpdateParams });
      throw new Error('Invalid query parameter detected');
    }
    
    await pool.execute(
      'UPDATE paintings SET image_url = ?, image_data = ?, status = ?, used_reference_ids = ? WHERE idea_id = ?',
      completeUpdateParams
    );
    console.log(`Updated database status to completed for idea ${ideaId}`);

    return {
      ideaId,
      imageUrl: `uploads/${fileName}`,
      status: 'completed'
    };
  } catch (error) {
    console.error('Error generating image:', error);
    
    // Cleanup temp files if error occurs
    for (const tempFile of tempFiles) {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
        console.log(`Deleted temp file ${tempFile} during error cleanup`);
      }
    }
    
    // Update status to failed with error message
    try {
      const errorMsg = error.message || 'Unknown error';
      const failureUpdateParams = ['failed', errorMsg.substring(0, 255), ideaId];
      // Validate parameters
      if (failureUpdateParams.some(p => p === undefined)) {
        console.error('Attempted to execute query with undefined parameter:', { failureUpdateParams });
        // Don't throw here, just log and continue
      } else {
        await pool.execute(
          'UPDATE paintings SET status = ?, error_message = ? WHERE idea_id = ?',
          failureUpdateParams
        );
        console.log(`Updated database status to failed for idea ${ideaId}`);
      }
    } catch (dbError) {
      console.error('Error updating database with failure status:', dbError);
    }
    
    throw error;
  }
}

module.exports = { generateImage }; 