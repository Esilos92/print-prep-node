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
      logger.info('Creating zip file...');
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
   * Create zip file from work directory
   */
  static async createZipFile(workDir, celebrityName) {
    const zip = new AdmZip();
    const zipPath = path.join(workDir, '..', `${celebrityName.replace(/\s+/g, '_')}_images.zip`);
    
    // Add resized images
    const resizedDir = path.join(workDir, 'resized');
    try {
      const files = await fs.readdir(resizedDir);
      
      for (const file of files) {
        const filePath = path.join(resizedDir, file);
        zip.addLocalFile(filePath);
      }
    } catch (error) {
      logger.warn('No resized directory found, skipping image files');
    }
    
    // Add manifest
    const manifestPath = path.join(workDir, 'manifest.json');
    try {
      zip.addLocalFile(manifestPath);
    } catch (error) {
      logger.warn('No manifest file found');
    }
    
    // Write zip file
    zip.writeZip(zipPath);
    logger.info(`Zip file created: ${zipPath}`);
    
    return zipPath;
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
        fields: 'id,webViewLink'
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
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });
      
      return auth;
      
    } catch (error) {
      logger.error('Google Drive authentication error:', error.message);
      throw new Error('Failed to authenticate with Google Drive. Check credentials file.');
    }
  }
}

module.exports = { zipAndUpload: ZipUploader.zipAndUpload.bind(ZipUploader) };
