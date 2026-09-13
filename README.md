# Print Prep Node - AI-Powered Image Sourcing System

Automates celebrity image sourcing for high-quality autograph print preparation.

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Add your API keys — see `.env.example`, every variable is documented there
   - Required: `SERP_API_KEY` (image search), `TMDB_API_KEY` (roles + reference
     portraits), `GOOGLE_DRIVE_FOLDER_ID`, and at least one of
     `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` for identity verification

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
- **Image Sourcing**: SerpApi (Google Images)
- **Identity Verification**: vision model compares each candidate against a
  TMDb reference portrait; only a confident match is kept
- **Quality Control**: resolution, deduplication, and print-DPI eligibility
- **Processing**: Sharp for 8x10 and 11x17 — never upscales
- **Output**: Manifest JSON + Google Drive upload

## 🔧 Configuration

All settings live in `.env`; `.env.example` documents each one. Two settings
are worth understanding before you change them:

**Search floor vs. print size.** `MIN_SEARCH_WIDTH` / `MIN_SEARCH_HEIGHT` decide
whether a web image is worth downloading. The print formats (8x10 = 2400x3000,
11x17 = 3300x5100 at 300 DPI) are a separate thing entirely. These were once the
same pair of variables, which meant there was no setting that worked: high
enough to print well rejected almost every search result, and low enough to find
images produced upscaled, blurry output.

**`MIN_PRINT_DPI`** decides which print formats an image is offered in. An image
qualifies only if it can fill the sheet at that DPI *without being enlarged*, so
a source too small for a format is dropped from it rather than padded out. Raise
it for crisper output and fewer images; lower it for the reverse.

## 📊 Output

Each run generates:
- Resized images (8x10, 11x17 formats), each at its true resolution — the
  manifest records the DPI it will actually print at
- `manifest.json` with metadata
- Zip file uploaded to Google Drive

Images are dropped, with the reason logged, when they are too small to print at
`MIN_PRINT_DPI`, when they duplicate one already selected, or when identity
verification cannot confidently confirm the right person.

## 🛠️ Development

```bash
npm run dev  # Run with nodemon
```

Logs saved to `logs/system.log`
