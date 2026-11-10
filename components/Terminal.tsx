'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Cluster } from '@/lib/sim/types';
import { VERBS } from '@/lib/sim/kubectl';
import Icon from './Icon';

export interface Entry {
  id: number;
  cmd: string;
  output: string;
  error?: boolean;
  source: 'ui' | 'typed';
  explain?: string;
}

const RES = ['pods', 'svc', 'endpoints', 'configmap', 'secrets', 'namespaces', 'secret', 'service', 'nodes', 'deployment'];

function complete(input: string, c: Cluster): string {
  const parts = input.split(/\s+/);
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  const verb = parts[1];
  let cands: string[];
  if (parts.length === 1) cands = ['kubectl'];
  else if (parts.length === 2) cands = VERBS;
  else if (prev === '-n' || prev === '--namespace') cands = c.namespaces.map((n) => n.name);
  else if (parts.length === 3 && ['get', 'describe', 'delete', 'label', 'patch', 'create', 'expose'].includes(verb)) cands = verb === 'create' ? ['namespace', 'configmap', 'secret', 'service'] : RES;
  else cands = [...c.pods.map((p) => p.name), ...c.services.map((s) => s.name), ...c.configMaps.map((x) => x.name), ...c.secrets.map((s) => s.name)];
  const m = cands.filter((x) => x.startsWith(last));
  if (!m.length) return input;
  let pre = m[0];
  for (const x of m) while (!x.startsWith(pre)) pre = pre.slice(0, -1);
  return [...parts.slice(0, -1), pre].join(' ') + (m.length === 1 ? ' ' : '');
}

export default function Terminal({
  entries, cluster, onRun, onClear, inputRef, showExplain, onToggleExplain,
}: {
  entries: Entry[];
  cluster: Cluster;
  onRun: (line: string) => void;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement>;
  showExplain: boolean;
  onToggleExplain: () => void;
}) {
  const [text, setText] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [idx, setIdx] = useState(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  const submit = () => {
    const line = text.trim();
    if (!line) return;
    onRun(line);
    setHist((h) => [...h, line]);
    setIdx(-1);
    setText('');
  };

  const copy = (e: Entry) => {
    try {
      navigator.clipboard?.writeText(e.cmd);
    } catch {}
    setCopied(e.id);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <section className="flex h-full min-h-[460px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1020] shadow-lift" aria-label="kubectl terminal">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-400">
          <Icon name="term" className="h-3.5 w-3.5" />
          <span className="truncate font-mono">kubectl · context kubelab · ns: <span className="text-sky-300">{cluster.ctxNs}</span></span>
        </div>
        <button onClick={onToggleExplain} className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${showExplain ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/5 text-slate-400'}`} aria-pressed={showExplain}>
          Explain
        </button>
        <button onClick={onClear} className="rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-white/10">Clear</button>
      </header>

      <div ref={scroller} className="term flex-1 space-y-4 overflow-y-auto px-4 py-4 font-mono text-[13px] leading-relaxed" aria-live="polite">
        {entries.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/15 p-4 text-slate-400">
            <p className="mb-2 font-sans text-sm text-slate-300">Every action you take appears here as a real kubectl command.</p>
            <p>Try typing: <span className="text-emerald-300">kubectl get pods -A</span></p>
            <p className="mt-1 text-xs text-slate-500">Tab completes · ↑ ↓ history · ? cheat sheet</p>
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id} className="animate-pop">
            <div className="flex items-start gap-2">
              <span className="select-none text-emerald-400">$</span>
              <span className="min-w-0 flex-1 break-all text-slate-100">{e.cmd}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide ${e.source === 'ui' ? 'bg-sky-400/15 text-sky-300' : 'bg-violet-400/15 text-violet-300'}`}>
                {e.source === 'ui' ? 'from UI' : 'typed'}
              </span>
              <button onClick={() => copy(e)} className="shrink-0 text-slate-500 transition hover:text-slate-200" aria-label="Copy command">
                {copied === e.id ? <Icon name="check" className="h-3.5 w-3.5 text-emerald-400" /> : <Icon name="copy" className="h-3.5 w-3.5" />}
              </button>
            </div>
            {e.output && <pre className={`mt-1.5 overflow-x-auto whitespace-pre pl-4 ${e.error ? 'text-rose-300' : 'text-slate-300'}`}>{e.output}</pre>}
            {showExplain && e.explain && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-400/10 px-3 py-2 font-sans text-xs text-emerald-200">
                <Icon name="bulb" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{e.explain}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(ev) => { ev.preventDefault(); submit(); }}
        className="flex items-center gap-2 border-t border-white/10 bg-[#0e1530] px-4 py-3 font-mono text-[13px]"
      >
        <span className="text-emerald-400" aria-hidden="true">$</span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') { e.preventDefault(); setText(complete(text, cluster)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); const n = Math.min(hist.length - 1, idx + 1); if (n >= 0) { setIdx(n); setText(hist[hist.length - 1 - n]); } }
            else if (e.key === 'ArrowDown') { e.preventDefault(); const n = idx - 1; setIdx(n); setText(n < 0 ? '' : hist[hist.length - 1 - n]); }
          }}
          placeholder="kubectl get pods"
          aria-label="Type a kubectl command"
          autoComplete="off" autoCapitalize="off" spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-slate-100 placeholder:text-slate-600 focus:outline-none"
        />
        <button type="submit" className="rounded-md bg-k8s-500 px-3 py-1 font-sans text-xs font-semibold text-white transition hover:bg-k8s-600">Run</button>
      </form>
    </section>
  );
}
