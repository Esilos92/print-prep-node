# Print Prep Node - AI-Powered Image Sourcing System

Automates celebrity image sourcing for high-quality autograph print preparation.

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Add your API keys (Bing Image Search, TMDb)
   - Add Google Drive folder ID

3. **Set up Google Drive credentials:**
   - Create service account in Google Cloud Console
   - Download credentials JSON file
   - Place in `credentials/google-drive-creds.json`

4. **Run the system:**
   ```bash
   npm start "William Shatner"
   ```

## 📁 System Architecture

- **Role Discovery**: TMDb API → Wikipedia fallback
- **Image Sourcing**: Bing Image Search API
- **Quality Control**: Resolution + deduplication
- **Processing**: Sharp for 8x10 and 11x17 resizing
- **Output**: Manifest JSON + Google Drive upload

## 🔧 Configuration

All settings in `.env`:
- `BING_IMAGE_API_KEY`: Required for image search
- `TMDB_API_KEY`: Optional, for better role discovery
- `GOOGLE_DRIVE_FOLDER_ID`: Target upload folder
- Resolution thresholds and processing limits

## 📊 Output

Each run generates:
- Resized images (8x10, 11x17 formats)
- `manifest.json` with metadata
- Zip file uploaded to Google Drive

## 🛠️ Development

```bash
npm run dev  # Run with nodemon
```

Logs saved to `logs/system.log`
