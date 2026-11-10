'use client';
import type { Cluster } from '@/lib/sim/types';
import type { Lab } from '@/lib/sim/labs';
import Icon from './Icon';

export default function LabPanel({ lab, cluster, presenter, onRun }: { lab: Lab; cluster: Cluster; presenter: boolean; onRun: (cmd: string) => void }) {
  const done = lab.steps.map((s) => s.done(cluster));
  const required = lab.steps.filter((s) => !s.optional);
  const complete = required.every((s) => s.done(cluster));
  const current = lab.steps.findIndex((s, i) => !done[i] && !s.optional);
  const next = current === -1 ? lab.steps.findIndex((s, i) => !done[i]) : current;
  const hint = next >= 0 ? lab.steps[next].hint(cluster) : '';
  const runnable = hint.startsWith('kubectl') || hint.startsWith('echo ');
  const pct = Math.round((done.filter(Boolean).length / lab.steps.length) * 100);

  return (
    <section className="card p-5" aria-label="Lab instructions">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-k8s-500">Lab {lab.id} of 4</p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">{lab.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{lab.goal}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-k8s-500 transition-all" style={{ width: `${pct}%` }} /></div>
          {pct}%
        </div>
      </div>

      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {lab.steps.map((s, i) => (
          <li key={i} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition ${done[i] ? 'border-emerald-200 bg-emerald-50/60' : i === next ? 'border-k8s-100 bg-k8s-50/60' : 'border-slate-200 bg-white'}`}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done[i] ? 'bg-emerald-500 text-white' : i === next ? 'bg-k8s-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {done[i] ? <Icon name="check" className="h-3 w-3" /> : i + 1}
            </span>
            <span className={done[i] ? 'text-slate-500 line-through decoration-emerald-300' : 'text-slate-800'}>
              {s.text}
              {s.optional && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500 no-underline">Bonus</span>}
            </span>
          </li>
        ))}
      </ol>

      {!presenter && hint && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
          <Icon name="bulb" className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-xs font-semibold text-slate-600">Hint</span>
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-slate-800">{hint}</code>
          {runnable && <button className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={() => onRun(hint)}><Icon name="play" className="h-3 w-3" />Run it</button>}
        </div>
      )}

      {presenter && !complete && (
        <div className="mt-3 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <Icon name="users" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Ask the audience</p>
            <p className="mt-0.5 text-sm text-amber-950">{lab.ask}</p>
          </div>
        </div>
      )}

      {complete && (
        <div className="mt-3 animate-pop rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700"><Icon name="check" className="h-3.5 w-3.5" />Lab complete · Key takeaway</p>
          <p className="mt-1 text-sm text-emerald-950">{lab.takeaway}</p>
        </div>
      )}
    </section>
  );
}
