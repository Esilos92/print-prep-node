'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bot, Send, Volume2, VolumeX } from 'lucide-react';
import type { JobStatus, Analytics } from '@/services/api';
import { formatDuration, deliveredCount } from '@/services/api';
import { PHASES, DATA } from '@/lib/theme';

interface Props {
  currentJob: JobStatus | null;
  analytics: Analytics;
  lastJob: JobStatus | null;
  onStartJob: (name: string) => Promise<string | null>;
  busy: boolean;
}

interface Line {
  id: number;
  from: 'GBOT' | 'USER' | 'SYS';
  text: string;
}

/**
 * In-character narration for each pipeline phase.
 *
 * Keys match utils/progress.js on the backend. The previous dashboard was
 * still matching an older vocabulary (filmography_scan, ai_validation, ...)
 * that the pipeline had stopped emitting, so GBot narrated the opening line
 * and then went silent for the rest of every mission.
 */
const PHASE_LINES: Record<string, (subject: string) => string> = {
  role_discovery: s => `Scanning filmography for ${s}. Cross-referencing credit databases...`,
  roles_found: s => `Roles locked for ${s}. Duplicate characters and repeat franchises filtered out.`,
  image_search: () => `Deploying search routines. Retail listings and packaging excluded at the query.`,
  validation: () => `Running quality validation. Checking resolution, duplicates and print viability...`,
  resize: () => `Formatting for print. No upscaling — anything too small to hold DPI is dropped.`,
  manifest: () => `Compiling manifest. Logging source, output size and print DPI per image.`,
  upload: () => `Transferring package to Google Drive. Almost there...`,
  complete: () => `Transfer complete.`
};

let lineId = 0;

export default function GBotTerminal({ currentJob, analytics, lastJob, onStartJob, busy }: Props) {
  const [lines, setLines] = useState<Line[]>([
    { id: lineId++, from: 'GBOT', text: 'GBot.EXE online. Give me a name and I will source, verify and format a print package.\n\nType "help" for commands.' }
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [announced, setAnnounced] = useState<string | null>(null);

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
      seq[kind].forEach(([note, delay]) =>
        setTimeout(() => s.triggerAttackRelease(note, '0.08'), delay)
      );
    } catch {
      /* audio is a flourish; never let it break the console */
    }
  }, [audioOn]);

  /* ---------------- output helpers ---------------- */

  const say = useCallback((text: string, from: Line['from'] = 'GBOT', instant = false) => {
    if (instant) {
      setLines(prev => [...prev, { id: lineId++, from, text }]);
      return;
    }
    setTyping(true);
    setTimeout(() => {
      setLines(prev => [...prev, { id: lineId++, from, text }]);
      setTyping(false);
    }, 420);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, typing]);

  /* ---------------- mission narration ---------------- */

  useEffect(() => {
    if (!currentJob) {
      setAnnounced(null);
      return;
    }

    if (currentJob.status === 'running') {
      const phase = currentJob.currentPhaseForGBot;
      if (phase && phase !== announced) {
        const line = PHASE_LINES[phase];
        if (line) {
          beep('phase');
          say(line(currentJob.celebrity));
          setAnnounced(phase);
        }
      }
      return;
    }

    if (currentJob.status === 'completed' && announced !== 'completed') {
      beep('done');
      const delivered = deliveredCount(currentJob);
      say(
        `Mission complete — ${currentJob.celebrity}.\n` +
        `  roles      ${currentJob.roles?.length ?? 0}\n` +
        `  downloaded ${currentJob.imagesProcessed ?? 0}\n` +
        `  verified   ${currentJob.imagesValidated ?? 0}\n` +
        `  delivered  ${delivered} print-ready\n` +
        (currentJob.downloadLink ? `\nPackage is in the Subject Log, ready for signing.` : `\nNo Drive link came back — check the API log.`)
      );
      setAnnounced('completed');
      return;
    }

    if (currentJob.status === 'error' && announced !== 'error') {
      beep('error');
      say(`Mission failed — ${currentJob.celebrity}.\n${currentJob.currentPhase}`);
      if (currentJob.problems?.length) {
        currentJob.problems.forEach(p => say(`! ${p}`, 'SYS', true));
      }
      setAnnounced('error');
    }
  }, [currentJob, announced, beep, say]);

  /* ---------------- commands ---------------- */

  const runCommand = (raw: string): boolean => {
    const cmd = raw.trim().toLowerCase();

    if (cmd === 'help' || cmd === '?') {
      say(
        'COMMANDS\n' +
        '  <name>     start a sourcing mission for that subject\n' +
        '  status     current mission progress\n' +
        '  stats      operation totals\n' +
        '  roles      roles found for the current or last subject\n' +
        '  phases     the pipeline, step by step\n' +
        '  clear      wipe this log'
      );
      return true;
    }

    if (cmd === 'clear') {
      setLines([{ id: lineId++, from: 'GBOT', text: 'Log cleared. Standing by.' }]);
      return true;
    }

    if (cmd === 'status') {
      if (!currentJob) {
        say(lastJob
          ? `No active mission. Last subject was ${lastJob.celebrity} — ${lastJob.status}.`
          : 'No active mission. Give me a name.');
      } else {
        say(
          `${currentJob.celebrity} — ${currentJob.progress}%\n` +
          `  phase      ${currentJob.currentPhase}\n` +
          `  roles      ${currentJob.roles?.length ?? 0}\n` +
          `  downloaded ${currentJob.imagesProcessed ?? 0}\n` +
          `  verified   ${currentJob.imagesValidated ?? 0}`
        );
      }
      return true;
    }

    if (cmd === 'stats') {
      say(
        `OPERATION TOTALS\n` +
        `  missions   ${analytics.total}\n` +
        `  complete   ${analytics.completed}\n` +
        `  failed     ${analytics.failed}\n` +
        `  hit rate   ${(analytics.successRate * 100).toFixed(0)}%\n` +
        `  delivered  ${analytics.imagesDelivered} print-ready images\n` +
        `  median run ${formatDuration(analytics.medianDurationMs)}`
      );
      return true;
    }

    if (cmd === 'roles') {
      const job = currentJob || lastJob;
      if (!job?.roles?.length) {
        say('No roles on record yet.');
      } else {
        say(`ROLES — ${job.celebrity}\n` + job.roles.map(r => `  • ${r}`).join('\n'));
      }
      return true;
    }

    if (cmd === 'phases') {
      say('PIPELINE\n' + PHASES.map((p, i) => `  ${i + 1}. ${p.label}`).join('\n'));
      return true;
    }

    return false;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;

    setInput('');
    say(value, 'USER', true);

    if (runCommand(value)) return;

    if (busy) {
      say('A mission is already running. One at a time — the box only has one core.');
      return;
    }

    if (!audioOn) setAudioOn(true);
    beep('start');
    setAnnounced(null);

    const error = await onStartJob(value);
    if (error) {
      say(`Cannot start: ${error}`);
    } else {
      say(`Roger. Opening mission for ${value}.`);
    }
  };

  const colorFor = (from: Line['from']) =>
    from === 'USER' ? DATA.accent : from === 'SYS' ? DATA.warning : DATA.good;

  return (
    <div className="cyber-panel panel-live flex flex-col" style={{ minHeight: '520px' }}>
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
        <div className="term-window flex-1 min-h-0" style={{ minHeight: '300px' }}>
          <div className="term-bar">
            <span className="term-dot" style={{ background: DATA.critical }} />
            <span className="term-dot" style={{ background: DATA.warning }} />
            <span className="term-dot" style={{ background: DATA.good }} />
            <span className="eyebrow ml-2">communication log</span>
          </div>

          <div className="term-scroll" ref={scrollRef} role="log" aria-live="polite" aria-label="GBot conversation">
            {lines.map(line => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <span
                  className="font-cyber"
                  style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: colorFor(line.from) }}
                >
                  [{line.from}]
                </span>
                <div className="term-line" style={{ color: line.from === 'USER' ? 'var(--ink)' : 'var(--ink-2)' }}>
                  {line.text}
                </div>
              </motion.div>
            ))}

            {typing && (
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

        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="gbot-input" className="sr-only">Message GBot or enter a subject name</label>
          <input
            id="gbot-input"
            className="cyber-input flex-1"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={busy ? 'mission running…' : 'enter subject name, or "help"'}
            autoComplete="off"
          />
          <button type="submit" className="cyber-button" disabled={!input.trim()}>
            <Send className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
