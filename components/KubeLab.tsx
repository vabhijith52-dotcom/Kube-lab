'use client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Cluster } from '@/lib/sim/types';
import { LABS } from '@/lib/sim/labs';
import { exec, HELP } from '@/lib/sim/kubectl';
import { diffKeys, tick } from '@/lib/sim/engine';
import Sidebar from './Sidebar';
import LabPanel from './LabPanel';
import ClusterView from './Cluster';
import Controls from './Controls';
import Terminal, { type Entry } from './Terminal';
import Icon from './Icon';

interface LabState { cluster: Cluster; entries: Entry[] }
interface State { lab: number; labs: Record<number, LabState>; nextId: number; flash: string[]; now: number }
type Action =
  | { type: 'run'; line: string; source: 'ui' | 'typed'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'lab'; id: number }
  | { type: 'reset'; now: number }
  | { type: 'clear' }
  | { type: 'flag'; flag: string }
  | { type: 'unflash' };

function init(): State {
  const now = Date.now();
  const labs: Record<number, LabState> = {};
  for (const l of LABS) labs[l.id] = { cluster: l.initial(now), entries: [] };
  return { lab: 1, labs, nextId: 1, flash: [], now };
}

function reducer(s: State, a: Action): State {
  const ls = s.labs[s.lab];
  const put = (v: Partial<LabState>, extra: Partial<State> = {}): State => ({ ...s, ...extra, labs: { ...s.labs, [s.lab]: { ...ls, ...v } } });
  switch (a.type) {
    case 'lab': return { ...s, lab: a.id, flash: [] };
    case 'reset': return put({ cluster: LABS[s.lab - 1].initial(a.now), entries: [] }, { flash: [] });
    case 'clear': return put({ entries: [] });
    case 'flag': return put({ cluster: { ...ls.cluster, flags: { ...ls.cluster.flags, [a.flag]: true } } });
    case 'unflash': return s.flash.length ? { ...s, flash: [] } : s;
    case 'tick': {
      const n = tick(ls.cluster, a.now);
      return n ? put({ cluster: n }, { now: a.now }) : { ...s, now: a.now };
    }
    case 'run': {
      const r = exec(ls.cluster, a.line, a.now);
      if (r.clear) return put({ entries: [] });
      const entry: Entry = { id: s.nextId, cmd: r.display ?? a.line, output: r.output, error: r.error, source: a.source, explain: r.explain };
      return put({ cluster: r.cluster, entries: [...ls.entries, entry] }, { nextId: s.nextId + 1, now: a.now, flash: diffKeys(ls.cluster, r.cluster) });
    }
  }
}

const CHEAT = HELP.split('\n').filter((l) => l.trim().startsWith('kubectl') || l.trim().startsWith('echo'));

export default function KubeLab() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [presenter, setPresenter] = useState(false);
  const [explain, setExplain] = useState(true);
  const [cheat, setCheat] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ls = state.labs[state.lab];
  const lab = LABS[state.lab - 1];

  const run = useCallback((line: string, source: 'ui' | 'typed' = 'ui') => dispatch({ type: 'run', line, source, now: Date.now() }), []);

  /* restore the lab from ?lab= or localStorage after hydration */
  useEffect(() => {
    try {
      const q = Number(new URLSearchParams(window.location.search).get('lab') ?? localStorage.getItem('kubelab:lab'));
      if (q >= 1 && q <= 4) dispatch({ type: 'lab', id: q });
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('kubelab:lab', String(state.lab)); } catch {}
  }, [state.lab]);

  const pending = ls.cluster.pods.some((p) => p.status !== 'Running') || ls.cluster.syncAt !== null;
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 250);
    return () => clearInterval(t);
  }, [pending, state.lab]);

  useEffect(() => {
    if (!state.flash.length) return;
    const t = setTimeout(() => dispatch({ type: 'unflash' }), 900);
    return () => clearTimeout(t);
  }, [state.flash]);

  useEffect(() => {
    document.documentElement.style.fontSize = presenter ? '18px' : '16px';
  }, [presenter]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); }
      const t = e.target as HTMLElement;
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) setCheat((v) => !v);
      if (e.key === 'Escape') setCheat(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const progress = LABS.map((l) => ({ done: l.steps.filter((s) => s.done(state.labs[l.id].cluster)).length, total: l.steps.length }));

  return (
    <div className="min-h-screen bg-white text-slate-900 lg:h-screen lg:overflow-hidden">
      <div className="flex flex-col lg:h-full lg:flex-row">
        <Sidebar lab={state.lab} progress={progress} onLab={(id) => { setSelected(null); dispatch({ type: 'lab', id }); }} presenter={presenter} onPresenter={() => setPresenter((v) => !v)} onReset={() => dispatch({ type: 'reset', now: Date.now() })} onCheat={() => setCheat(true)} />
        <main className="min-w-0 flex-1 space-y-4 p-4 lg:overflow-y-auto lg:p-6">
          <LabPanel lab={lab} cluster={ls.cluster} presenter={presenter} onRun={(c) => run(c)} />
          <ClusterView cluster={ls.cluster} labId={state.lab} flash={state.flash} selected={selected} onSelect={setSelected} onService={(s, ns) => run(`kubectl get endpoints ${s} -n ${ns}`)} />
          <Controls labId={state.lab} cluster={ls.cluster} run={run} selected={selected} setSelected={setSelected} now={state.now} onFlag={(f) => dispatch({ type: 'flag', flag: f })} />
        </main>
        <div className="p-4 lg:h-full lg:w-[460px] lg:shrink-0 lg:py-6 lg:pl-0 lg:pr-6 xl:w-[500px]">
          <Terminal entries={ls.entries} cluster={ls.cluster} onRun={(l) => run(l, 'typed')} onClear={() => dispatch({ type: 'clear' })} inputRef={input} showExplain={explain} onToggleExplain={() => setExplain((v) => !v)} />
        </div>
      </div>

      {cheat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setCheat(false)} role="dialog" aria-modal="true" aria-label="Command cheat sheet">
          <div className="card max-h-[85vh] w-full max-w-2xl animate-pop overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Supported commands</h2>
              <button className="btn btn-ghost !p-1.5" onClick={() => setCheat(false)} aria-label="Close"><Icon name="x" /></button>
            </div>
            <ul className="space-y-1.5">
              {CHEAT.map((l) => <li key={l} className="rounded-lg bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-700">{l.trim()}</li>)}
            </ul>
            <p className="mt-4 text-xs text-slate-500">Shortcuts: Ctrl/Cmd+K focus terminal · Tab complete · ↑↓ history · ? toggle this sheet</p>
          </div>
        </div>
      )}
    </div>
  );
}
