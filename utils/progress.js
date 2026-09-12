/**
 * Structured progress events for the API server.
 *
 * The dashboard used to recover progress by regex-matching human-readable log
 * lines. Those lines are edited freely — adding the word "ENHANCED" to one of
 * them silently broke role extraction — so twelve patterns had decayed to
 * three by the time anyone looked. Events are a contract instead: the wording
 * of the logs can change without the dashboard noticing.
 *
 * Each event is one line on stdout, prefixed so the parent can pick it out of
 * ordinary log output:
 *
 *   @@EVENT {"type":"phase","progress":55,...}
 */

const PREFIX = '@@EVENT';

function emit(payload) {
  // process.stdout.write, not logger: this is a machine channel and must not
  // pick up the ANSI colour codes the logger adds.
  process.stdout.write(`${PREFIX} ${JSON.stringify(payload)}\n`);
}

module.exports = {
  PREFIX,

  /** Overall pipeline progress. `phase` is a stable key, `label` is for humans. */
  phase(phase, progress, label) {
    emit({ type: 'phase', phase, progress, label });
  },

  /** A role discovered for this celebrity. */
  role(character, title) {
    emit({ type: 'role', character, title });
  },

  /** Cumulative image counts. Omit a field to leave it unchanged. */
  counts({ found, downloaded, verified, printable }) {
    emit({ type: 'counts', found, downloaded, verified, printable });
  },

  /** Final deliverable. */
  download(url) {
    emit({ type: 'download', url });
  },

  /** A failure worth surfacing in the dashboard rather than only in the log. */
  problem(message) {
    emit({ type: 'problem', message });
  }
};
