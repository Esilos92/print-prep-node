const fs = require('fs').promises;
const path = require('path');

/**
 * Bulk roster: a queue of guests run one after another.
 *
 * A guest with titles runs in Custom mode (titles matched to their credits);
 * a guest without runs in Auto. One guest at a time keeps the droplet and the
 * API bills predictable. A guest that fails is retried once, at the end of
 * the queue. The queue is saved after every change, so an API restart picks
 * up where it left off; a guest that was mid-run is simply started again.
 */

const FILE = path.join(__dirname, 'roster.json');
const MAX_ATTEMPTS = 2;
const BUSY_RETRY_MS = 30000;

let state = null;
let deps = null;   // { launchJob, resolveTitles }
let ticking = false;

function counts() {
  const c = { waiting: 0, running: 0, done: 0, failed: 0 };
  for (const item of state?.items || []) c[item.status] = (c[item.status] || 0) + 1;
  return c;
}

function view() {
  if (!state) return { status: 'idle', items: [], counts: counts() };
  return { ...state, counts: counts() };
}

async function save() {
  if (!state) {
    await fs.rm(FILE, { force: true });
    return;
  }
  // Write then rename, so a crash mid-write can't leave a corrupt file.
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, FILE);
}

function running() {
  return state?.items.find(i => i.status === 'running') || null;
}

async function finishItem(item, job) {
  item.jobId = job.id;
  if (job.status === 'completed') {
    item.status = 'done';
    item.downloadLink = job.downloadLink || null;
    item.printable = job.imagesPrintable || 0;
    item.roleResults = job.roleResults || [];
  } else if (item.attempts < MAX_ATTEMPTS && !/cancelled/i.test(job.currentPhase || '')) {
    // Retry once, after everyone else.
    item.status = 'waiting';
    item.error = null;
    state.items.splice(state.items.indexOf(item), 1);
    state.items.push(item);
    item.notes.push(`First try failed (${(job.currentPhase || '').replace(/^Error:\s*/, '')}); retrying at the end.`);
  } else {
    item.status = 'failed';
    item.error = (job.problems?.[0]) || (job.currentPhase || 'Failed').replace(/^Error:\s*/, '');
  }
  item.finishedAt = new Date().toISOString();

  if (state.status === 'stopping') state.status = 'stopped';
  await save();
  setTimeout(tick, 2000);
}

/** Start the next guest if nothing is running. */
async function tick() {
  if (ticking || !state || state.status !== 'running' || running()) return;
  ticking = true;
  try {
    const item = state.items.find(i => i.status === 'waiting');
    if (!item) {
      state.status = 'done';
      state.finishedAt = new Date().toISOString();
      await save();
      return;
    }

    item.status = 'running';
    item.attempts += 1;
    item.startedAt = new Date().toISOString();
    await save();

    let roles = null;
    if (item.titles.length) {
      try {
        const resolved = await deps.resolveTitles(item.name, item.titles);
        if (!resolved.found) throw new Error(`TMDb has no one named "${item.name}"`);
        roles = resolved.results.filter(r => r.status === 'matched').map(r => r.role);
        const missing = resolved.results.filter(r => r.status !== 'matched').map(r => r.input);
        if (missing.length) item.notes.push(`Not in their credits, skipped: ${missing.join(', ')}`);
        if (roles.length === 0) throw new Error('None of the titles matched their credits');
      } catch (error) {
        item.status = 'failed';
        item.error = error.message;
        await save();
        ticking = false;
        return tick();
      }
    }

    try {
      const job = await deps.launchJob(item.name, roles, 'roster', { onFinish: (j) => finishItem(item, j) });
      item.jobId = job.id;
      await save();
    } catch (error) {
      // Busy with a job someone started by hand: wait and try again.
      item.status = 'waiting';
      item.attempts -= 1;
      await save();
      if (error.status === 429) setTimeout(tick, BUSY_RETRY_MS);
      else {
        item.status = 'failed';
        item.error = error.message;
        await save();
        setTimeout(tick, 2000);
      }
    }
  } finally {
    ticking = false;
  }
}

function create(guests) {
  if (state && ['running', 'stopping'].includes(state.status)) {
    throw Object.assign(new Error('A roster is already running. Stop it or wait for it to finish.'), { status: 409 });
  }
  state = {
    id: `roster_${Date.now()}`,
    status: 'running',
    createdAt: new Date().toISOString(),
    items: guests.map((g, i) => ({
      id: i + 1,
      name: g.name,
      titles: g.titles,
      status: 'waiting',
      attempts: 0,
      jobId: null,
      downloadLink: null,
      printable: 0,
      error: null,
      notes: []
    }))
  };
  return save().then(() => {
    setImmediate(tick);
    return view();
  });
}

async function stop() {
  if (!state) return view();
  state.status = running() ? 'stopping' : 'stopped';
  await save();
  return view();
}

async function resume() {
  if (!state) return view();
  if (state.items.some(i => i.status === 'waiting') || running()) {
    state.status = 'running';
    await save();
    setImmediate(tick);
  }
  return view();
}

async function clear() {
  if (state && running()) {
    throw Object.assign(new Error('Stop the roster and let the current guest finish first.'), { status: 409 });
  }
  state = null;
  await save();
  return view();
}

/** Load a saved roster on startup and carry on with it. */
async function init(dependencies) {
  deps = dependencies;
  try {
    state = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    state = null;
    return;
  }
  // A guest that was mid-run when the server stopped starts again.
  for (const item of state.items) {
    if (item.status === 'running') {
      item.status = 'waiting';
      item.notes.push('Restarted after the server restarted.');
    }
  }
  if (state.status === 'stopping') state.status = 'stopped';
  await save();
  if (state.status === 'running') {
    console.log(`📋 Resuming roster: ${counts().waiting} guest(s) waiting`);
    setImmediate(tick);
  }
}

module.exports = { init, create, stop, resume, clear, view, MAX_GUESTS: 60 };
