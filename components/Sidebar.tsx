'use client';
import { LABS } from '@/lib/sim/labs';
import Icon from './Icon';

export default function Sidebar({ lab, progress, onLab, presenter, onPresenter, onReset, onCheat }: {
  lab: number; progress: { done: number; total: number }[]; onLab: (id: number) => void;
  presenter: boolean; onPresenter: () => void; onReset: () => void; onCheat: () => void;
}) {
  return (
    <aside className="flex shrink-0 flex-col gap-4 border-b border-slate-100 p-4 lg:h-full lg:w-72 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-k8s-500 text-white shadow-lift">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5z" /><circle cx="12" cy="12" r="2.2" /></svg>
        </div>
        <div>
          <p className="text-base font-bold leading-none tracking-tight text-slate-900">KubeLab</p>
          <p className="mt-1 text-[11px] text-slate-500">Interactive Kubernetes simulator</p>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1" aria-label="Labs">
        <p className="col-span-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:col-span-1">Labs</p>
        {LABS.map((l, i) => {
          const p = progress[i];
          const active = l.id === lab;
          const full = p.done === p.total;
          return (
            <button key={l.id} onClick={() => onLab(l.id)} aria-current={active} className={`group rounded-xl border p-3 text-left transition ${active ? 'border-k8s-500 bg-k8s-50/70 shadow-lift' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-card'}`}>
              <div className="flex items-center gap-2.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${active ? 'bg-k8s-500 text-white' : full ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {full && !active ? <Icon name="check" className="h-3.5 w-3.5" /> : l.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{l.title}</span>
                  <span className="hidden truncate text-[11px] text-slate-500 lg:block">{l.short}</span>
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${full ? 'bg-emerald-500' : 'bg-k8s-500'}`} style={{ width: `${(p.done / p.total) * 100}%` }} /></div>
                <span className="text-[10px] font-semibold text-slate-500">{p.done}/{p.total}</span>
              </div>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2">
        <button onClick={onPresenter} role="switch" aria-checked={presenter} className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          <Icon name="present" className="h-4 w-4 text-slate-500" />
          <span className="flex-1 text-left">Presenter mode</span>
          <span className={`relative h-5 w-9 rounded-full transition ${presenter ? 'bg-k8s-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${presenter ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onReset} className="btn btn-ghost"><Icon name="reset" className="h-3.5 w-3.5" />Reset lab</button>
          <button onClick={onCheat} className="btn btn-ghost"><Icon name="help" className="h-3.5 w-3.5" />Cheat sheet</button>
        </div>
        <p className="px-1 text-[11px] leading-snug text-slate-400">Simulated cluster. No real Kubernetes is running.</p>
      </div>
    </aside>
  );
}
