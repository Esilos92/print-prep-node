/**
 * Bounded parallelism for I/O-bound work.
 *
 * The pipeline ran every network operation one at a time: a four-role job
 * issued roughly 320 image downloads sequentially, each with a 25-second
 * timeout, then roughly 320 vision calls sequentially. Nearly all of that
 * wall-clock time was spent idle, waiting on a round-trip.
 *
 * Bounded rather than unbounded on purpose. This runs on one vCPU with 2 GB
 * and a history of OOM kills, and the upstream APIs have rate limits. The
 * point is to stop waiting on one request at a time, not to open 300 sockets.
 */

/**
 * Map over items with at most `limit` in flight, preserving input order in
 * the results. A rejected task rejects the whole call, as Promise.all does;
 * use `settleLimit` when individual failures should not sink the batch.
 */
async function mapLimit(items, limit, worker) {
  const list = Array.from(items);
  const results = new Array(list.length);
  const size = Math.max(1, Math.min(limit, list.length));
  let cursor = 0;

  const runners = Array.from({ length: size }, async () => {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await worker(list[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Like mapLimit, but never rejects: each entry is
 * { ok: true, value } or { ok: false, error }.
 *
 * This is the right shape for downloads and verification, where one bad URL
 * or one API hiccup should cost one image rather than the whole role.
 */
async function settleLimit(items, limit, worker) {
  return mapLimit(items, limit, async (item, index) => {
    try {
      return { ok: true, value: await worker(item, index) };
    } catch (error) {
      return { ok: false, error };
    }
  });
}

module.exports = { mapLimit, settleLimit };
