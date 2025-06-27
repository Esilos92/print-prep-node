require('dotenv').config();

const config = {
  api: {
    serpApiKey: process.env.SERP_API_KEY,
    serpEndpoint: process.env.SERP_ENDPOINT || 'https://serpapi.com/search.json',
    tmdbKey: process.env.TMDB_API_KEY,
  },
  
  googleDrive: {
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
    credentialsPath: './credentials/google-drive-creds.json'
  },
  
  image: {
    minDimensions: {
      '8x10': {
        width: parseInt(process.env.MIN_WIDTH_8X10) || 2400,
        height: parseInt(process.env.MIN_HEIGHT_8X10) || 3000
      },
      '11x17': {
        width: parseInt(process.env.MIN_WIDTH_11X17) || 3300,
        height: parseInt(process.env.MIN_HEIGHT_11X17) || 5100
      }
    },
    maxImagesPerRole: parseInt(process.env.MAX_IMAGES_PER_ROLE) || 50,
    dedupThreshold: parseFloat(process.env.DEDUP_THRESHOLD) || 0.85
  }
};

module.exports = config;
