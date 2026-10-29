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

- **Role Discovery**: the performer's real TMDb credits (talk shows and guest
  spots filtered out); an OpenAI model picks the best-known ones. Falls back to
  the model's own knowledge only when TMDb has no match
- **Image Sourcing**: TMDb's official posters and stills first, then Google
  Images (SerpApi) with queries written per role; fan-art, marketplace and
  stock-photo sites are blocked by domain
- **Review**: a vision model reviews candidates in batches against a TMDb
  reference portrait and reports, per image, the kind of photo (solo, group,
  poster), identity, whether it is from the production or official, print
  quality, and the area a crop must keep. Each role gets a solo/group/poster
  mix (`MIX_*`), and a role that comes up short gets a wider second search
- **Print files**: every file has the sheet's true shape. A photo already that
  shape is only resized; otherwise it is cropped without cutting any face, and
  skipped for that size if it can't be. Wide photos go on landscape sheets.
  Never upscales. Each package includes `contact_sheet.jpg` to check crops
- **Output**: Manifest JSON + Google Drive upload

## 🧭 Modes (dashboard)

- **Auto**: type a name; roles are chosen from TMDb and everything runs.
- **Select**: type a name, choose Popular or Newest, tick the roles to search.
- **Custom**: type a name and the shows/movies (➕ for more). Titles are
  matched to the person's credits; one that isn't can still be searched by
  typing the character name.
- **Bulk**: a guest list, run one after another on the server (close the tab
  and it keeps going). Plain names run on Auto; names with titles run like
  Custom. Add rows with ➕ or paste one guest per line
  (`Erik Knudsen: Saw II, Continuum`). A failed guest is retried once at the
  end; the list survives API restarts (`roster.json`).

The dashboard is password-protected (`DASHBOARD_PASSWORD` in
`dashboard/.env.local`) and forwards `/api` to the API, which listens only on
the droplet itself (`127.0.0.1:4000`).

`node scripts/check-sources.js "Name" "Title"` shows what each photo source
finds for one role without running a job.

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
