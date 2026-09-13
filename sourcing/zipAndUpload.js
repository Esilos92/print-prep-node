// archiver 8 is ESM-only and exports classes rather than a factory
// function; Node 22 loads it from CommonJS via require() unflagged.
const { ZipArchive } = require('archiver');
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
   * Build the delivery zip by streaming entries to disk.
   *
   * This used to buffer every image into memory with adm-zip's addLocalFile
   * and write the accumulated result at the end. That is what OOM-killed the
   * process in January, on this exact step, and it is what left the system
   * silent for eight months: the log ends mid-zip with no error because the
   * kernel took the process. Swap now catches the overflow, but swap is a
   * backstop, not a fix — a larger filmography still overruns it.
   *
   * Streaming holds roughly one file at a time regardless of package size.
   */
  static async createZipFile(workDir, celebrityName) {
    const zipPath = path.join(workDir, '..', `${celebrityName.replace(/\s+/g, '_')}_images.zip`);
    const resizedDir = path.join(workDir, 'resized');

    const output = require('fs').createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 6 } });

    const finished = new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      // Missing files are warnings, not failures — a partial package still
      // ships, and the entry that failed is named rather than swallowed.
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          logger.warn(`Zip entry missing: ${err.message}`);
        } else {
          reject(err);
        }
      });
    });

    archive.pipe(output);

    let entryCount = 0;

    for (const format of ['8x10', '11x17']) {
      const formatDir = path.join(resizedDir, format);
      try {
        const files = await fs.readdir(formatDir);
        const images = files.filter(f => /\.(jpe?g|png)$/i.test(f));
        if (images.length > 0) {
          logger.info(`Adding ${images.length} ${format} images to zip`);
          for (const file of images) {
            archive.file(path.join(formatDir, file), { name: `${format}/${file}` });
            entryCount++;
          }
        }
      } catch (error) {
        logger.warn(`No ${format} directory found`);
      }
    }

    // Fallback for loose images sitting in the resized root.
    try {
      const loose = (await fs.readdir(resizedDir))
        .filter(f => /\.(jpe?g|png)$/i.test(f));

      if (loose.length > 0) {
        logger.info(`Adding ${loose.length} images from resized root (fallback)`);
        for (const file of loose) {
          const folder = this.determineFolderFromFilename(file);
          archive.file(path.join(resizedDir, file), { name: `${folder}/${file}` });
          entryCount++;
        }
      }
    } catch (error) {
      logger.warn('Error reading resized directory for fallback');
    }

    const manifestPath = path.join(workDir, 'manifest.json');
    try {
      await fs.access(manifestPath);
      archive.file(manifestPath, { name: 'manifest.json' });
      entryCount++;
    } catch (error) {
      logger.warn('No manifest file found');
    }

    if (entryCount === 0) {
      archive.abort();
      throw new Error('Refusing to upload an empty package: no images survived the pipeline');
    }

    await archive.finalize();
    await finished;

    const { size } = await fs.stat(zipPath);
    logger.info(
      `Zip created: ${zipPath} (${entryCount} entries, ${(size / 1024 / 1024).toFixed(1)} MB)`
    );

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

module.exports = {
  zipAndUpload: ZipUploader.zipAndUpload.bind(ZipUploader),
  ZipUploader
};
