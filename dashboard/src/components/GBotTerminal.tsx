'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bot, Send, Volume2, VolumeX, Plus, X, Search, Check, ClipboardList } from 'lucide-react';
import type { JobStatus, Analytics, RoleChoice, ResolvedTitle, Mode, RoleResult, RosterGuest } from '@/services/api';
import { celebrityAPI, formatDuration, deliveredCount } from '@/services/api';
import { DATA, NEON } from '@/lib/theme';

interface Props {
  currentJob: JobStatus | null;
  analytics: Analytics;
  lastJob: JobStatus | null;
  onStartJob: (name: string, options?: { roles?: RoleChoice[]; mode?: Mode }) => Promise<string | null>;
  onStartRoster: (guests: RosterGuest[]) => Promise<string | null>;
  rosterRunning: boolean;
  busy: boolean;
}

type UiMode = Mode | 'bulk';

/** "Erik Knudsen: Saw II, Continuum" -> { name, titles }. One guest per line. */
function parseRosterText(text: string): RosterGuest[] {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const cut = line.indexOf(':');
      const name = (cut === -1 ? line : line.slice(0, cut)).trim();
      const titles = cut === -1 ? [] : line.slice(cut + 1).split(/[,;]/).map(t => t.trim()).filter(Boolean);
      return { name, titles };
    })
    .filter(g => g.name);
}

type Card =
  | { kind: 'pick'; name: string; roles: RoleChoice[]; sort: 'popular' | 'newest' }
  | { kind: 'resolve'; name: string; results: ResolvedTitle[] }
  | { kind: 'roster'; guests: RosterGuest[] };

interface Line {
  id: number;
  from: 'GBOT' | 'USER' | 'SYS';
  text?: string;
  card?: Card;
}

/* ------------------------------------------------------------------ */
/* GBot's voice: a friendly studio buddy who loves movies.            */
/* Keys match utils/progress.js on the backend.                       */
/* ------------------------------------------------------------------ */

const PHASE_LINES: Record<string, (subject: string) => string> = {
  role_discovery: s => `Ooh, ${s}! Great pick. Let's see what they've been in.`,
  roles_found: s => `Got ${s}'s roles lined up. Time to go photo hunting 📸`,
  image_search: () => `Digging through official stills, fan wikis and the web. I'm being picky, so give me a few minutes.`,
  resize: () => `Cropping everything to proper 8x10 and 11x17. No chopped-off heads, promise.`,
  manifest: () => `Doing the paperwork...`,
  upload: () => `Sending it all over to Google Drive. Almost there!`
};

const GREETING =
  `Hey! I'm GBot 👋 Give me a name and I'll find their best roles, hunt down photos and get them print-ready.\n\n` +
  `Auto does the whole thing. Select lets you pick the roles. Custom lets you type the shows yourself.\n` +
  `Type "help" anytime.`;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** {solo: 5, group: 3, poster: 1} -> "5 solo shots, 3 group shots and 1 poster" */
function describeKinds(byKind: Record<string, number>): string {
  const parts = [
    byKind.solo ? plural(byKind.solo, 'solo shot') : '',
    byKind.group ? plural(byKind.group, 'group shot') : '',
    byKind.poster ? plural(byKind.poster, 'poster') : ''
  ].filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function roleLine(r: RoleResult): string {
  const kinds = describeKinds(r.byKind);
  if (r.selected >= 6) return `${r.title} turned out great: ${kinds}!`;
  if (r.selected >= 2) return `${r.title}: got ${kinds}.`;
  if (r.selected === 1) return `${r.title} was tough, only found ${kinds}. Not many good photos of that one out there.`;
  return `${r.title} came up empty. Nothing good enough to print, sorry!`;
}

let lineId = 0;

/* ------------------------------------------------------------------ */
/* Cards GBot shows inside the chat                                    */
/* ------------------------------------------------------------------ */

function Poster({ src, title }: { src?: string | null; title: string }) {
  return src
    ? <img src={src} alt="" width={36} height={54} style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
    : <div aria-hidden style={{ width: 36, height: 54, borderRadius: 3, flexShrink: 0, background: 'var(--plate-raised, #16203a)', display: 'grid', placeItems: 'center', fontSize: 10, color: 'var(--ink-3)' }}>{title.slice(0, 1)}</div>;
}

const cardStyle: React.CSSProperties = {
  marginTop: 6,
  border: `1px solid rgba(0,191,255,.35)`,
  borderRadius: 6,
  background: 'rgba(0,148,209,.06)',
  padding: 10
};

function PickCard({ card, disabled, onConfirm }: {
  card: Extract<Card, { kind: 'pick' }>;
  disabled: boolean;
  onConfirm: (roles: RoleChoice[]) => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [sent, setSent] = useState(false);
  const toggle = (i: number) => setChecked(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  return (
    <div style={cardStyle}>
      <div className="flex flex-col gap-2">
        {card.roles.map((role, i) => (
          <label key={`${role.tmdbId}-${role.character}`} className="flex items-center gap-3" style={{ cursor: sent ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              checked={checked.has(i)}
              disabled={sent}
              onChange={() => toggle(i)}
              aria-label={`${role.character} in ${role.title}`}
            />
            <Poster src={role.poster} title={role.title} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', color: 'var(--ink)', fontSize: '0.85rem' }}>{role.title}</span>
              <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: '0.75rem' }}>
                {role.character} · {role.year}{role.mediaType === 'tv' && role.episodes ? ` · ${plural(role.episodes, 'episode')}` : ''}
                {role.recent && <span style={{ color: DATA.warning }}> · brand new, photos may be thin</span>}
              </span>
            </span>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="cyber-button"
        style={{ marginTop: 10 }}
        disabled={sent || disabled || checked.size === 0}
        onClick={() => {
          setSent(true);
          onConfirm(card.roles.filter((_, i) => checked.has(i)));
        }}
      >
        <Check className="w-4 h-4" aria-hidden />
        {sent ? 'Sent!' : checked.size ? `Search ${plural(checked.size, 'role')}` : 'Pick some roles'}
      </button>
    </div>
  );
}

function ResolveCard({ card, disabled, onConfirm }: {
  card: Extract<Card, { kind: 'resolve' }>;
  disabled: boolean;
  onConfirm: (roles: RoleChoice[]) => void;
}) {
  // For titles not in their credits: the character name to search anyway.
  const [manual, setManual] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);

  const roles: RoleChoice[] = card.results.flatMap((r, i): RoleChoice[] => {
    if (r.status === 'matched') return [r.role];
    const character = (manual[i] || '').trim();
    if (!character) return [];
    return [{
      character,
      title: r.guess?.title || r.input,
      year: r.guess?.year || 'unknown',
      tmdbId: r.guess?.tmdbId ?? null,
      mediaType: r.guess?.mediaType ?? null,
      medium: r.guess?.mediaType === 'tv' ? 'live_action_tv' : 'live_action_movie',
      source: 'manual'
    }];
  });

  return (
    <div style={cardStyle}>
      <div className="flex flex-col gap-3">
        {card.results.map((r, i) => (
          <div key={`${r.input}-${i}`} className="flex items-center gap-3">
            {r.status === 'matched'
              ? <>
                  <Poster src={r.role.poster} title={r.role.title} />
                  <span>
                    <span style={{ display: 'block', color: 'var(--ink)', fontSize: '0.85rem' }}>
                      <span style={{ color: DATA.good }}>✓</span> {r.role.character} in {r.role.title}
                    </span>
                    <span style={{ display: 'block', color: 'var(--ink-3)', fontSize: '0.75rem' }}>
                      {r.role.year}{r.input.toLowerCase() !== r.role.title.toLowerCase() ? ` · you typed "${r.input}"` : ''}
                    </span>
                  </span>
                </>
              : <>
                  <Poster src={r.guess?.poster} title={r.guess?.title || r.input} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', color: 'var(--ink)', fontSize: '0.85rem' }}>
                      <span style={{ color: DATA.warning }}>?</span> &quot;{r.input}&quot; isn&apos;t in their credits
                      {r.guess ? ` (closest: ${r.guess.title}, ${r.guess.year})` : ''}
                    </span>
                    <input
                      className="cyber-input"
                      style={{ marginTop: 4, width: '100%', fontSize: '0.8rem', padding: '4px 8px' }}
                      placeholder="Type the character name to search anyway, or leave blank to skip"
                      value={manual[i] || ''}
                      disabled={sent}
                      onChange={e => setManual(prev => ({ ...prev, [i]: e.target.value }))}
                    />
                  </span>
                </>}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="cyber-button"
        style={{ marginTop: 10 }}
        disabled={sent || disabled || roles.length === 0}
        onClick={() => {
          setSent(true);
          onConfirm(roles);
        }}
      >
        <Check className="w-4 h-4" aria-hidden />
        {sent ? 'Sent!' : roles.length ? `Search ${plural(roles.length, 'title')}` : 'Nothing to search yet'}
      </button>
    </div>
  );
}

function RosterCard({ card, disabled, onConfirm }: {
  card: Extract<Card, { kind: 'roster' }>;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [sent, setSent] = useState(false);
  return (
    <div style={cardStyle}>
      <ol className="flex flex-col gap-1" style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 220, overflowY: 'auto' }}>
        {card.guests.map((g, i) => (
          <li key={`${g.name}-${i}`} style={{ fontSize: '0.82rem', color: 'var(--ink)' }}>
            {i + 1}. {g.name}
            <span style={{ color: 'var(--ink-3)' }}>
              {g.titles.length ? ` · ${g.titles.join(', ')}` : ' · Auto'}
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="cyber-button"
        style={{ marginTop: 10 }}
        disabled={sent || disabled}
        onClick={() => {
          setSent(true);
          onConfirm();
        }}
      >
        <Check className="w-4 h-4" aria-hidden />
        {sent ? 'Started!' : `Start roster (${plural(card.guests.length, 'guest')})`}
      </button>
    </div>
  );
}

/** GBot's how-to bubble for Bulk mode, pinned to the right of the screen. */
function BulkTip({ onClose }: { onClose: () => void }) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      role="note"
      aria-label="GBot tip for Bulk mode"
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 40,
        width: 320, maxWidth: 'calc(100vw - 32px)',
        border: `1px solid ${NEON.blue}`, borderRadius: 10,
        background: 'rgba(7,11,20,.96)', boxShadow: '0 8px 30px rgba(0,191,255,.18)',
        padding: '12px 14px', fontSize: '0.82rem', color: 'var(--ink-2)', lineHeight: 1.5
      }}
    >
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <Bot className="w-4 h-4" style={{ color: NEON.blue }} aria-hidden />
        <span className="font-cyber" style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: NEON.blue }}>GBOT TIP</span>
        <button type="button" onClick={onClose} className="ml-auto" aria-label="Close tip" style={{ color: 'var(--ink-3)' }}>
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
      <p style={{ margin: 0 }}>Give me a whole guest list and I&apos;ll work through it one by one 📋</p>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <li><strong style={{ color: 'var(--ink)' }}>Just a name</strong> and I&apos;ll run them on Auto and pick their roles myself.</li>
        <li><strong style={{ color: 'var(--ink)' }}>Add titles</strong> (comma-separated) and I&apos;ll only search those, like Custom mode.</li>
        <li>Got a long list? Hit <strong style={{ color: 'var(--ink)' }}>Paste a list</strong> and put one guest per line, like:<br />
          <code className="font-term" style={{ color: 'var(--ink)' }}>Erik Knudsen: Saw II, Continuum</code><br />
          <code className="font-term" style={{ color: 'var(--ink)' }}>Nico Tortorella</code>
        </li>
      </ul>
      <p style={{ margin: '8px 0 0', color: 'var(--ink-3)' }}>Each guest takes about 10-20 minutes, so big lists are an overnight thing. You can close this tab; I&apos;ll keep going.</p>
    </motion.aside>
  );
}

/* ------------------------------------------------------------------ */

const MODES: Array<{ id: UiMode; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'I pick the roles and do everything' },
  { id: 'select', label: 'Select', hint: 'I show you their roles, you pick' },
  { id: 'custom', label: 'Custom', hint: 'You type the shows and movies' },
  { id: 'bulk', label: 'Bulk', hint: 'A whole guest list, one after another' }
];

export default function GBotTerminal({ currentJob, analytics, lastJob, onStartJob, onStartRoster, rosterRunning, busy }: Props) {
  const [lines, setLines] = useState<Line[]>([{ id: lineId++, from: 'GBOT', text: GREETING }]);
  const [mode, setMode] = useState<UiMode>('auto');
  const [guests, setGuests] = useState<Array<{ name: string; titles: string }>>([{ name: '', titles: '' }]);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [tipOpen, setTipOpen] = useState(true);
  const [sort, setSort] = useState<'popular' | 'newest'>('popular');
  const [name, setName] = useState('');
  const [titles, setTitles] = useState<string[]>(['']);
  const [typing, setTyping] = useState(false);
  const [working, setWorking] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [announced, setAnnounced] = useState<string | null>(null);
  const rolesNarrated = useRef<{ jobId: string | null; count: number }>({ jobId: null, count: 0 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<{ triggerAttackRelease: (n: string, d: string) => void } | null>(null);

  /* ---------------- audio: loaded lazily so it never blocks first paint ---- */

  const beep = useCallback(async (kind: 'start' | 'phase' | 'done' | 'error') => {
    if (!audioOn) return;
    try {
      const Tone = await import('tone');
      if (Tone.context.state !== 'running') await Tone.start();
      if (!synthRef.current) {
        synthRef.current = new Tone.Synth({
          oscillator: { type: 'square' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.25, release: 0.1 },
          volume: -30
        }).toDestination() as unknown as typeof synthRef.current;
      }
      const s = synthRef.current;
      if (!s) return;
      const seq: Record<typeof kind, Array<[string, number]>> = {
        start: [['C4', 0], ['E4', 70]],
        phase: [['G4', 0]],
        done: [['C4', 0], ['E4', 110], ['G4', 220], ['C5', 330]],
        error: [['C4', 0], ['G3', 170]]
      };
      seq[kind].forEach(([note, delay]) => setTimeout(() => s.triggerAttackRelease(note, '0.08'), delay));
    } catch {
      /* audio is a flourish; never let it break the chat */
    }
  }, [audioOn]);

  /* ---------------- output helpers ---------------- */

  const push = useCallback((line: Omit<Line, 'id'>, instant = false) => {
    if (instant) {
      setLines(prev => [...prev, { ...line, id: lineId++ }]);
      return;
    }
    setTyping(true);
    setTimeout(() => {
      setLines(prev => [...prev, { ...line, id: lineId++ }]);
      setTyping(false);
    }, 420);
  }, []);

  const say = useCallback((text: string, from: Line['from'] = 'GBOT', instant = false) => push({ from, text }, instant), [push]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, typing]);

  /* ---------------- job narration ---------------- */

  useEffect(() => {
    if (!currentJob) {
      setAnnounced(null);
      return;
    }

    // Per-role results, as each role finishes.
    if (rolesNarrated.current.jobId !== currentJob.id) rolesNarrated.current = { jobId: currentJob.id, count: 0 };
    const results = currentJob.roleResults || [];
    if (results.length > rolesNarrated.current.count) {
      results.slice(rolesNarrated.current.count).forEach(r => say(roleLine(r)));
      rolesNarrated.current.count = results.length;
    }

    if (currentJob.status === 'running') {
      const phase = currentJob.currentPhaseForGBot;
      if (phase && phase !== announced) {
        const line = PHASE_LINES[phase];
        if (line) {
          beep('phase');
          say(line(currentJob.celebrity));
        }
        setAnnounced(phase);
      }
      return;
    }

    if (currentJob.status === 'completed' && announced !== 'completed') {
      beep('done');
      const delivered = deliveredCount(currentJob);
      say(
        `All done with ${currentJob.celebrity}! 🎉 ${plural(delivered, 'print-ready file')} across ${plural(currentJob.roles?.length ?? 0, 'role')}.\n` +
        (currentJob.downloadLink
          ? `It's in the Subject Log whenever you're ready.`
          : `Hmm, Google Drive never sent me a link back, though. Worth checking the server log.`)
      );
      setAnnounced('completed');
      return;
    }

    if (currentJob.status === 'error' && announced !== 'error') {
      beep('error');
      say(`Ugh, ${currentJob.celebrity} didn't work out. ${currentJob.currentPhase.replace(/^Error:\s*/, '')}`);
      currentJob.problems?.forEach(p => say(`• ${p}`, 'SYS', true));
      setAnnounced('error');
    }
  }, [currentJob, announced, beep, say]);

  /* ---------------- text commands (typed into the name box) ---------------- */

  const runCommand = (raw: string): boolean => {
    const cmd = raw.trim().toLowerCase();

    if (cmd === 'help' || cmd === '?') {
      say(
        `Here's what I can do:\n` +
        `  • Auto: type a name and I'll handle everything\n` +
        `  • Select: type a name, pick Popular or Newest, and choose roles from my list\n` +
        `  • Custom: type a name and the shows or movies you want\n\n` +
        `You can also type:\n` +
        `  status   how the current job is going\n` +
        `  stats    totals so far\n` +
        `  roles    roles from the current or last job\n` +
        `  clear    tidy up this chat`
      );
      return true;
    }

    if (cmd === 'clear') {
      setLines([{ id: lineId++, from: 'GBOT', text: 'All cleaned up! Who are we doing next?' }]);
      return true;
    }

    if (cmd === 'status') {
      if (!currentJob) {
        say(lastJob
          ? `Nothing running right now. Last one was ${lastJob.celebrity} (${lastJob.status === 'completed' ? 'done' : lastJob.status === 'error' ? "didn't work out" : lastJob.status}).`
          : `Nothing running right now. Give me a name!`);
      } else {
        say(
          `${currentJob.celebrity}: ${currentJob.progress}% done\n` +
          `  right now   ${currentJob.currentPhase}\n` +
          `  roles       ${currentJob.roles?.length ?? 0}\n` +
          `  photos kept ${currentJob.imagesValidated ?? 0}`
        );
      }
      return true;
    }

    if (cmd === 'stats') {
      say(
        `Our numbers so far:\n` +
        `  jobs        ${analytics.total} (${analytics.completed} done, ${analytics.failed} didn't work out)\n` +
        `  hit rate    ${(analytics.successRate * 100).toFixed(0)}%\n` +
        `  delivered   ${analytics.imagesDelivered} print-ready files\n` +
        `  usual time  ${formatDuration(analytics.medianDurationMs)}`
      );
      return true;
    }

    if (cmd === 'roles') {
      const job = currentJob || lastJob;
      say(job?.roles?.length
        ? `Roles for ${job.celebrity}:\n` + job.roles.map(r => `  • ${r}`).join('\n')
        : `No roles on record yet.`);
      return true;
    }

    return false;
  };

  /* ---------------- starting work ---------------- */

  const begin = async (person: string, roles?: RoleChoice[], jobMode: Mode = 'auto') => {
    if (busy) {
      say(`I'm still working on the last one! One at a time, I've only got one brain.`);
      return;
    }
    if (!audioOn) setAudioOn(true);
    beep('start');
    setAnnounced(null);

    const error = await onStartJob(person, { roles, mode: jobMode });
    if (error) {
      say(`Hmm, I couldn't start that: ${error}`);
    } else {
      say(roles
        ? `On it! Searching ${plural(roles.length, 'role')} for ${person}.`
        : `On it! Starting on ${person}.`);
    }
  };

  const findRoles = async (person: string) => {
    setWorking(true);
    try {
      const list = await celebrityAPI.listRoles(person, sort);
      if (!list.roles.length) {
        say(`Hmm, I couldn't find any roles for ${person}. Double-check the spelling?`);
        return;
      }
      const who = list.person?.name || person;
      push({
        from: 'GBOT',
        text: sort === 'newest'
          ? `Here are ${who}'s newest roles! Pick the ones you want 🎬`
          : `Here's what I found for ${who}! Pick the ones you want 🎬`,
        card: { kind: 'pick', name: who, roles: list.roles, sort }
      });
    } catch (error) {
      say(`Hmm, ${error instanceof Error ? error.message : 'something went wrong looking that up.'}`);
    } finally {
      setWorking(false);
    }
  };

  const checkTitles = async (person: string) => {
    const typed = titles.map(t => t.trim()).filter(Boolean);
    if (!typed.length) {
      say(`Add at least one show or movie and I'll take it from there.`);
      return;
    }
    setWorking(true);
    try {
      const results = await celebrityAPI.resolveTitles(person, typed);
      const missing = results.filter(r => r.status === 'not_found').length;
      push({
        from: 'GBOT',
        text: missing === 0
          ? `Found all of them! Here's what I matched for ${person}. Look right?`
          : `Here's what I matched for ${person}. ${missing === results.length ? "I couldn't find any of those in their credits" : `${plural(missing, 'title')} didn't show up in their credits`}, so fill in the character if you still want me to try.`,
        card: { kind: 'resolve', name: person, results }
      });
    } catch (error) {
      say(`Hmm, ${error instanceof Error ? error.message : 'something went wrong checking those.'}`);
    } finally {
      setWorking(false);
    }
  };

  const bulkGuests = (): RosterGuest[] => guests
    .map(g => ({ name: g.name.trim(), titles: g.titles.split(/[,;]/).map(t => t.trim()).filter(Boolean) }))
    .filter(g => g.name);

  const applyPaste = () => {
    const parsed = parseRosterText(pasteText);
    if (parsed.length) {
      setGuests(parsed.map(g => ({ name: g.name, titles: g.titles.join(', ') })));
      setPasting(false);
      setPasteText('');
      say(`Got it, ${plural(parsed.length, 'guest')} filled in below. Give them a once-over and hit Check list.`);
    }
  };

  const checkRoster = () => {
    const list = bulkGuests();
    if (!list.length) {
      say(`Add at least one guest and I'll take it from there.`);
      return;
    }
    if (list.length > 60) {
      say(`That's a lot! I can take up to 60 guests per list. Split it in two?`);
      return;
    }
    const custom = list.filter(g => g.titles.length).length;
    say(`${plural(list.length, 'guest')} on the list`, 'USER', true);
    push({
      from: 'GBOT',
      text: `Got ${plural(list.length, 'guest')}! ${list.length - custom} on Auto${custom ? `, ${custom} with titles` : ''}. ` +
        `That's roughly ${Math.max(1, Math.round(list.length * 15 / 60))} hour${list.length * 15 >= 90 ? 's' : ''} of work. Want me to start?`,
      card: { kind: 'roster', guests: list }
    });
  };

  const startRoster = async (list: RosterGuest[]) => {
    const error = await onStartRoster(list);
    say(error
      ? `Hmm, I couldn't start the list: ${error}`
      : `Here we go! Starting with ${list[0].name}. I'll keep you posted as each one finishes.`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'bulk') {
      checkRoster();
      return;
    }
    const value = name.trim();
    if (!value) return;

    if (runCommand(value)) {
      say(value, 'USER', true);
      setName('');
      return;
    }

    if (mode === 'auto') {
      say(value, 'USER', true);
      setName('');
      await begin(value);
    } else if (mode === 'select') {
      say(`${value} (${sort === 'newest' ? 'newest' : 'most popular'} roles)`, 'USER', true);
      await findRoles(value);
    } else {
      const typed = titles.map(t => t.trim()).filter(Boolean);
      say(`${value}: ${typed.join(', ') || '(no titles yet)'}`, 'USER', true);
      await checkTitles(value);
    }
  };

  const colorFor = (from: Line['from']) =>
    from === 'USER' ? DATA.accent : from === 'SYS' ? DATA.warning : DATA.good;

  const segment = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: '0.72rem',
    letterSpacing: '0.06em',
    borderRadius: 4,
    border: `1px solid ${active ? NEON.blue : 'rgba(0,148,209,.3)'}`,
    background: active ? 'rgba(0,191,255,.14)' : 'transparent',
    color: active ? 'var(--ink)' : 'var(--ink-3)'
  });

  const submitLabel = mode === 'auto' ? 'Send' : mode === 'select' ? 'Find roles' : 'Check titles';

  return (
    <div className="cyber-panel panel-live terminal-panel flex flex-col">
      <div className="panel-head">
        <Bot className="w-4 h-4" style={{ color: 'var(--neon-blue)' }} aria-hidden />
        <span className="panel-title">GBot.EXE</span>
        <span className="eyebrow ml-auto hidden sm:inline">chat://gbot.exe</span>
        <button
          type="button"
          onClick={() => setAudioOn(v => !v)}
          className="ml-2 p-1 rounded"
          style={{ color: audioOn ? 'var(--neon-blue)' : 'var(--ink-3)' }}
          aria-pressed={audioOn}
          aria-label={audioOn ? 'Mute interface sounds' : 'Enable interface sounds'}
          title={audioOn ? 'Mute' : 'Enable sound'}
        >
          {audioOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>

      <div className="panel-body flex flex-col gap-3 flex-1 min-h-0">
        <div className="term-window flex-1 min-h-0">
          <div className="term-bar">
            <span className="term-dot" style={{ background: DATA.critical }} />
            <span className="term-dot" style={{ background: DATA.warning }} />
            <span className="term-dot" style={{ background: DATA.good }} />
            <span className="eyebrow ml-2">chat with gbot</span>
          </div>

          <div className="term-scroll" ref={scrollRef} role="log" aria-live="polite" aria-label="GBot conversation">
            {lines.map(line => (
              <motion.div key={line.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                <span className="font-cyber" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: colorFor(line.from) }}>
                  [{line.from === 'USER' ? 'YOU' : line.from}]
                </span>
                {line.text && (
                  <div className="term-line" style={{ color: line.from === 'USER' ? 'var(--ink)' : 'var(--ink-2)' }}>
                    {line.text}
                  </div>
                )}
                {line.card?.kind === 'pick' && (() => {
                  const card = line.card;
                  return <PickCard card={card} disabled={busy} onConfirm={roles => begin(card.name, roles, 'select')} />;
                })()}
                {line.card?.kind === 'resolve' && (() => {
                  const card = line.card;
                  return <ResolveCard card={card} disabled={busy} onConfirm={roles => begin(card.name, roles, 'custom')} />;
                })()}
                {line.card?.kind === 'roster' && (() => {
                  const card = line.card;
                  return <RosterCard card={card} disabled={rosterRunning} onConfirm={() => startRoster(card.guests)} />;
                })()}
              </motion.div>
            ))}

            {(typing || working) && (
              <div className="flex items-center gap-2" aria-hidden>
                <span className="font-cyber" style={{ fontSize: '0.6rem', color: DATA.good }}>[GBOT]</span>
                {[0, 0.15, 0.3].map(delay => (
                  <motion.span
                    key={delay}
                    className="inline-block rounded-full"
                    style={{ width: 5, height: 5, background: DATA.good }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 0.9, delay }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mode">
          {MODES.map(m => (
            <button key={m.id} type="button" style={segment(mode === m.id)} aria-pressed={mode === m.id} onClick={() => { setMode(m.id); if (m.id === 'bulk') setTipOpen(true); }} title={m.hint}>
              {m.label}
            </button>
          ))}
          {mode === 'select' && (
            <span className="flex gap-1 ml-auto" role="group" aria-label="Sort roles">
              <button type="button" style={segment(sort === 'popular')} aria-pressed={sort === 'popular'} onClick={() => setSort('popular')}>Popular</button>
              <button type="button" style={segment(sort === 'newest')} aria-pressed={sort === 'newest'} onClick={() => setSort('newest')}>Newest</button>
            </span>
          )}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2">
          {mode === 'bulk' && (
            <>
              {pasting ? (
                <>
                  <label htmlFor="gbot-paste" className="sr-only">Guest list, one per line</label>
                  <textarea
                    id="gbot-paste"
                    className="cyber-input"
                    rows={6}
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder={'One guest per line. Titles after a colon:\nErik Knudsen: Saw II, Continuum\nNico Tortorella'}
                    style={{ resize: 'vertical', fontSize: '0.85rem' }}
                  />
                  <div className="flex gap-2">
                    <button type="button" className="cyber-button" onClick={() => setPasting(false)}>Cancel</button>
                    <button type="button" className="cyber-button ml-auto" disabled={!pasteText.trim()} onClick={applyPaste}>
                      <ClipboardList className="w-4 h-4" aria-hidden />
                      <span>Fill in the list</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }} className="flex flex-col gap-2">
                    {guests.map((g, i) => (
                      <div key={i} className="flex gap-2">
                        <label htmlFor={`gbot-guest-${i}`} className="sr-only">Guest {i + 1} name</label>
                        <input
                          id={`gbot-guest-${i}`}
                          className="cyber-input"
                          style={{ flex: '1 1 40%', minWidth: 0 }}
                          value={g.name}
                          onChange={e => setGuests(prev => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                          placeholder={i === 0 ? 'guest name' : 'another guest'}
                          autoComplete="off"
                        />
                        <label htmlFor={`gbot-guest-titles-${i}`} className="sr-only">Guest {i + 1} titles (optional)</label>
                        <input
                          id={`gbot-guest-titles-${i}`}
                          className="cyber-input"
                          style={{ flex: '1 1 60%', minWidth: 0 }}
                          value={g.titles}
                          onChange={e => setGuests(prev => prev.map((x, j) => (j === i ? { ...x, titles: e.target.value } : x)))}
                          placeholder="titles, optional (blank = Auto)"
                          autoComplete="off"
                        />
                        {guests.length > 1 && (
                          <button
                            type="button"
                            className="cyber-button"
                            aria-label={`Remove ${g.name || `guest ${i + 1}`}`}
                            onClick={() => setGuests(prev => prev.filter((_, j) => j !== i))}
                          >
                            <X className="w-4 h-4" aria-hidden />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="cyber-button" disabled={guests.length >= 60} onClick={() => setGuests(prev => [...prev, { name: '', titles: '' }])}>
                      <Plus className="w-4 h-4" aria-hidden />
                      <span>Add guest</span>
                    </button>
                    <button type="button" className="cyber-button" onClick={() => setPasting(true)}>
                      <ClipboardList className="w-4 h-4" aria-hidden />
                      <span>Paste a list</span>
                    </button>
                    <button type="submit" className="cyber-button ml-auto" disabled={!guests.some(g => g.name.trim()) || rosterRunning}>
                      <Search className="w-4 h-4" aria-hidden />
                      <span>{rosterRunning ? 'List running…' : 'Check list'}</span>
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {mode !== 'bulk' && <div className="flex gap-2">
            <label htmlFor="gbot-name" className="sr-only">Celebrity name, or a command like help</label>
            <input
              id="gbot-name"
              className="cyber-input flex-1"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={busy ? 'working on one right now…' : mode === 'auto' ? 'celebrity name, or "help"' : 'celebrity name'}
              autoComplete="off"
            />
            {mode !== 'custom' && (
              <button type="submit" className="cyber-button" disabled={!name.trim() || working} aria-label={submitLabel}>
                {mode === 'auto' ? <Send className="w-4 h-4" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
                <span className="hidden sm:inline">{submitLabel}</span>
              </button>
            )}
          </div>}

          {mode === 'custom' && (
            <>
              {titles.map((title, i) => (
                <div key={i} className="flex gap-2">
                  <label htmlFor={`gbot-title-${i}`} className="sr-only">Show or movie {i + 1}</label>
                  <input
                    id={`gbot-title-${i}`}
                    className="cyber-input flex-1"
                    value={title}
                    onChange={e => setTitles(prev => prev.map((t, j) => (j === i ? e.target.value : t)))}
                    placeholder={i === 0 ? 'show or movie, e.g. Scream 4' : 'another show or movie'}
                    autoComplete="off"
                  />
                  {titles.length > 1 && (
                    <button
                      type="button"
                      className="cyber-button"
                      aria-label={`Remove ${title || `title ${i + 1}`}`}
                      onClick={() => setTitles(prev => prev.filter((_, j) => j !== i))}
                    >
                      <X className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="cyber-button"
                  disabled={titles.length >= 12}
                  onClick={() => setTitles(prev => [...prev, ''])}
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  <span>Add title</span>
                </button>
                <button type="submit" className="cyber-button ml-auto" disabled={!name.trim() || working}>
                  <Search className="w-4 h-4" aria-hidden />
                  <span>{submitLabel}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
      {mode === 'bulk' && tipOpen && <BulkTip onClose={() => setTipOpen(false)} />}
    </div>
  );
}
