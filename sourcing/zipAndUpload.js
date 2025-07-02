const AdmZip = require('adm-zip');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');

class ZipUploader {
  
  /**
   * Zip directory and upload to Google Drive
   */
  static async zipAndUpload(workDir, celebrityName) {
    try {
      logger.info('Creating zip file with organized folders...');
      const zipPath = await this.createZipFile(workDir, celebrityName);
      
      logger.info('Uploading to Google Drive...');
      const uploadResult = await this.uploadToGoogleDrive(zipPath, celebrityName);
      
      // Cleanup zip file
      await fs.unlink(zipPath);
      
      return uploadResult;
      
    } catch (error) {
      logger.error('Error in zip and upload:', error.message);
      throw error;
    }
  }
  
  /**
   * FIXED: Create zip file with separate folders for 8x10 and 11x17
   */
  static async createZipFile(workDir, celebrityName) {
    const zip = new AdmZip();
    const zipPath = path.join(workDir, '..', `${celebrityName.replace(/\s+/g, '_')}_images.zip`);
    
    // Add resized images with folder structure
    const resizedDir = path.join(workDir, 'resized');
    
    try {
      // Check if we have the new folder structure
      const format8x10Dir = path.join(resizedDir, '8x10');
      const format11x17Dir = path.join(resizedDir, '11x17');
      
      // Add 8x10 images to zip in their own folder
      try {
        const files8x10 = await fs.readdir(format8x10Dir);
        logger.info(`Adding ${files8x10.length} 8x10 images to zip`);
        
        for (const file of files8x10) {
          const filePath = path.join(format8x10Dir, file);
          // Add to zip with folder structure: 8x10/filename.jpg
          zip.addLocalFile(filePath, '8x10/');
        }
      } catch (error) {
        logger.warn('No 8x10 directory found');
      }
      
      // Add 11x17 images to zip in their own folder
      try {
        const files11x17 = await fs.readdir(format11x17Dir);
        logger.info(`Adding ${files11x17.length} 11x17 images to zip`);
        
        for (const file of files11x17) {
          const filePath = path.join(format11x17Dir, file);
          // Add to zip with folder structure: 11x17/filename.jpg
          zip.addLocalFile(filePath, '11x17/');
        }
      } catch (error) {
        logger.warn('No 11x17 directory found');
      }
      
      // Fallback: if no subfolder structure exists, add all files from resized root
      try {
        const allFiles = await fs.readdir(resizedDir);
        const imageFiles = allFiles.filter(file => 
          file.toLowerCase().endsWith('.jpg') || 
          file.toLowerCase().endsWith('.jpeg') || 
          file.toLowerCase().endsWith('.png')
        );
        
        if (imageFiles.length > 0) {
          logger.info(`Adding ${imageFiles.length} images from resized root (fallback)`);
          
          for (const file of imageFiles) {
            const filePath = path.join(resizedDir, file);
            // Determine folder based on filename format indicator
            const folder = this.determineFolderFromFilename(file);
            zip.addLocalFile(filePath, `${folder}/`);
          }
        }
      } catch (error) {
        logger.warn('Error reading resized directory for fallback');
      }
      
    } catch (error) {
      logger.warn('No resized directory found, skipping image files');
    }
    
    // Add manifest to root of zip
    const manifestPath = path.join(workDir, 'manifest.json');
    try {
      zip.addLocalFile(manifestPath);
    } catch (error) {
      logger.warn('No manifest file found');
    }
    
    // Write zip file
    zip.writeZip(zipPath);
    logger.info(`Zip file created with organized folders: ${zipPath}`);
    
    return zipPath;
  }
  
  /**
   * NEW: Determine folder from filename when using fallback method
   */
  static determineFolderFromFilename(filename) {
    // Look for format indicators in filename
    if (filename.includes('8x10') || filename.includes('8X10')) {
      return '8x10';
    } else if (filename.includes('11x17') || filename.includes('11X17')) {
      return '11x17';
    }
    
    // Default to 8x10 if unclear
    return '8x10';
  }
  
  /**
   * Upload file to Google Drive
   */
  static async uploadToGoogleDrive(zipPath, celebrityName) {
    try {
      const auth = await this.authenticateGoogleDrive();
      const drive = google.drive({ version: 'v3', auth });
      
      const fileName = `${celebrityName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`;
      
      const fileMetadata = {
        name: fileName,
        parents: config.googleDrive.folderId ? [config.googleDrive.folderId] : undefined
      };
      
      const media = {
        mimeType: 'application/zip',
        body: require('fs').createReadStream(zipPath)
      };
      
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,webViewLink',
        supportsAllDrives: true
      });
      
      logger.success(`File uploaded successfully: ${response.data.id}`);
      
      return {
        fileId: response.data.id,
        webViewLink: response.data.webViewLink,
        fileName: fileName
      };
      
    } catch (error) {
      logger.error('Google Drive upload error:', error.message);
      throw error;
    }
  }
  
  /**
   * Authenticate with Google Drive API
   */
  static async authenticateGoogleDrive() {
    try {
      const credentials = require(path.resolve(config.googleDrive.credentialsPath));
      
      const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      
      return auth;
      
    } catch (error) {
      logger.error('Google Drive authentication error:', error.message);
      throw new Error('Failed to authenticate with Google Drive. Check credentials file.');
    }
  }
}

module.exports = { zipAndUpload: ZipUploader.zipAndUpload.bind(ZipUploader) };
