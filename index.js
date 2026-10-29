require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const config = require('./utils/config');
const logger = require('./utils/logger');
const progress = require('./utils/progress');
const { fetchCelebrityRoles } = require('./sourcing/roles');
const { sourceRole } = require('./sourcing/images/sourceRole');
const { preparePrints, buildContactSheet } = require('./sourcing/images/print');
const ReferencePortrait = require('./sourcing/ai-services/ReferencePortrait');
const { generateManifest } = require('./sourcing/generateManifest');
const { zipAndUpload } = require('./sourcing/zipAndUpload');

/**
 * One job: roles → photos per role → print files → manifest → zip → Drive.
 *
 * Partial results ship. A role that finds nothing is reported (in the log
 * and to the dashboard) and the job carries on with the others; it only
 * fails when there is nothing at all to deliver.
 */

function fail(message) {
  progress.problem(message);
  logger.error(`❌ ${message}`);
  process.exit(1);
}

/** temp/<slug>, never anywhere else: this directory is deleted at the end. */
function workDirFor(celebrityName) {
  const slug = celebrityName
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60);
  if (!slug) return null;

  const tempRoot = path.join(__dirname, 'temp');
  const workDir = path.join(tempRoot, slug);
  const relative = path.relative(tempRoot, workDir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return workDir;
}

function summariseRole(report) {
  const kinds = Object.entries(report.byKind || {}).map(([k, n]) => `${n} ${k}`).join(', ') || 'none';
  const sources = report.sources
    ? Object.entries(report.sources).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(', ')
    : '';
  logger.info(`📸 ${report.character} (${report.title}): ${report.selected} selected (${kinds}) — ` +
    `${report.accepted} passed review of ${report.reviewed} reviewed, ${report.downloaded} downloaded of ${report.candidatesFound} found${sources ? ` [${sources}]` : ''}`);

  const rejected = Object.entries(report.rejected || {}).sort((a, b) => b[1] - a[1])
    .map(([why, n]) => `${why} ${n}`).join(', ');
  if (rejected) logger.info(`   rejected: ${rejected}`);

  if (report.selected === 0) {
    const top = Object.entries(report.rejected || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([why, n]) => `${n} ${why.replace(/_/g, ' ')}`).join(', ');
    const detail = report.reviewed === 0
      ? `no candidate images found${report.error ? ` (${report.error})` : ''}`
      : `none of ${report.reviewed} reviewed were usable${top ? ` — ${top}` : ''}`;
    progress.problem(`${report.character} (${report.title}): ${detail}`);
  }
}

/**
 * Roles chosen by the user (Select or Custom mode), passed as a JSON file:
 *   node index.js "Name" --roles /path/to/roles.json
 * These skip role discovery and are never written to the role cache, so a
 * hand-picked list doesn't become the default for later Auto runs.
 */
async function chosenRoles() {
  const flag = process.argv.indexOf('--roles');
  if (flag === -1) return null;
  const file = process.argv[flag + 1];
  const roles = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!Array.isArray(roles)) throw new Error('--roles file must contain a list of roles');
  return roles.filter(r => r && r.character && r.title);
}

async function main() {
  const celebrityName = (process.argv[2] || '').trim();
  if (!celebrityName || celebrityName.startsWith('--')) {
    logger.error('Usage: npm start "Celebrity Name" [--roles roles.json]');
    process.exit(1);
  }

  const workDir = workDirFor(celebrityName);
  if (!workDir) fail(`Celebrity name produces no usable directory name: ${celebrityName}`);

  try {
    logger.info(`🚀 Sourcing print images for: ${celebrityName}`);
    // Start clean: leftovers from an earlier failed run must not ship in this package.
    await fs.rm(workDir, { recursive: true, force: true });
    await fs.mkdir(workDir, { recursive: true });

    // 1. Roles: chosen by the user, or discovered
    progress.phase('role_discovery', 5, 'Finding roles...');
    const picked = await chosenRoles();
    const { roles } = picked ? { roles: picked } : await fetchCelebrityRoles(celebrityName);
    if (!roles || roles.length === 0) {
      fail(picked ? 'No roles were chosen.' : `No roles found for ${celebrityName}. Check the spelling.`);
    }
    if (picked) logger.info(`🎯 Using ${roles.length} chosen role(s)`);

    progress.phase('roles_found', 25, `${roles.length} roles found`);
    logger.info(`✅ ${roles.length} roles:`);
    roles.forEach((role, i) => {
      progress.role(role.character, role.title);
      logger.info(`  ${i + 1}. ${role.character} in ${role.title} (${role.year}) [${role.medium}]`);
    });

    // 2. Photos
    progress.phase('image_search', 30, 'Finding photos...');
    const referencePaths = config.verification.useReferenceImage
      ? await new ReferencePortrait().getPortraits(celebrityName, path.join(workDir, 'reference'), 3)
      : [];
    if (referencePaths.length === 0) {
      progress.problem('No reference photo found on TMDb — identity checks are weaker for this run.');
    }

    const context = { referencePaths, seen: [], triedUrls: new Set() };
    const selectedImages = [];
    const roleReports = [];
    let outages = 0;

    for (const [i, role] of roles.entries()) {
      progress.phase('image_search', 30 + Math.round((i / roles.length) * 50), `Photos for ${role.character} (${i + 1}/${roles.length})`);
      try {
        const { images, report } = await sourceRole(celebrityName, role, workDir, context);
        selectedImages.push(...images);
        roleReports.push(report);
        summariseRole(report);
        progress.roleDone(report);
      } catch (error) {
        outages++;
        logger.warn(`❌ ${role.character}: ${error.message}`);
        roleReports.push({ character: role.character, title: role.title, selected: 0, error: error.message });
        progress.roleDone({ character: role.character, title: role.title, selected: 0 });
        progress.problem(`${role.character} (${role.title}): ${error.message}`);
      }
      progress.counts({ verified: selectedImages.length });
    }

    if (selectedImages.length === 0) {
      fail(outages === roles.length
        ? 'Image review service unavailable for every role — check the OpenAI/Anthropic keys and credit.'
        : 'No usable photos found for any role (see the per-role notes).');
    }

    // 3. Print files
    progress.phase('resize', 82, 'Preparing print files...');
    const { prints, skipped } = await preparePrints(selectedImages, workDir, celebrityName);
    progress.counts({ printable: prints.length });
    logger.info(`✅ ${prints.length} print files from ${selectedImages.length} photos`);

    const skipSummary = {};
    for (const s of skipped) {
      const key = `${s.format}: ${s.why.replace(/only \d+ DPI/, 'below DPI floor')}`;
      skipSummary[key] = (skipSummary[key] || 0) + 1;
    }
    for (const [why, n] of Object.entries(skipSummary)) logger.info(`   skipped ${n} × ${why}`);
    const noPrint = selectedImages.length - new Set(prints.map(p => p.hash)).size;
    if (noPrint > 0) logger.info(`   ${noPrint} selected photo(s) produced no print file at any size`);

    if (prints.length === 0) {
      fail('Photos were found, but none could be printed at the DPI floor without cutting the subject.');
    }

    try {
      await buildContactSheet(prints, path.join(workDir, 'resized', 'contact_sheet.jpg'));
    } catch (error) {
      logger.warn(`Contact sheet skipped: ${error.message}`);
    }

    // 4. Manifest
    progress.phase('manifest', 90, 'Writing manifest...');
    const manifest = await generateManifest(prints, celebrityName, roles);
    manifest.roleReports = roleReports;
    manifest.skippedPrints = skipped;
    await fs.writeFile(path.join(workDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // 5. Zip and upload
    progress.phase('upload', 95, 'Uploading to Google Drive...');
    const upload = await zipAndUpload(workDir, celebrityName);
    progress.download(upload.webViewLink);
    progress.phase('complete', 100, 'Complete');

    const perRole = roleReports.map(r => `${r.character}: ${r.selected}`).join(', ');
    logger.info(`🎉 ${celebrityName}: ${prints.length} print files (${perRole})`);
    logger.info(`   ${upload.webViewLink}`);

    await fs.rm(workDir, { recursive: true, force: true });
  } catch (error) {
    logger.error(error.stack || error.message);
    fail(`Job failed: ${error.message}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
