'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Cluster, Pod } from '@/lib/sim/types';
import { appValue, endpointsOf, matches } from '@/lib/sim/engine';
import Icon from './Icon';

const PAL: Record<string, { box: string; head: string; dot: string }> = {
  development: { box: 'border-sky-300 bg-sky-50/40', head: 'text-sky-700', dot: 'bg-sky-500' },
  production: { box: 'border-emerald-300 bg-emerald-50/40', head: 'text-emerald-700', dot: 'bg-emerald-500' },
  testing: { box: 'border-amber-300 bg-amber-50/40', head: 'text-amber-700', dot: 'bg-amber-500' },
  default: { box: 'border-slate-300 bg-slate-50/60', head: 'text-slate-600', dot: 'bg-slate-400' },
};
const FALLBACK = { box: 'border-violet-300 bg-violet-50/40', head: 'text-violet-700', dot: 'bg-violet-500' };

const STATUS: Record<string, string> = {
  Running: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Pending: 'bg-slate-100 text-slate-600 ring-slate-200',
  ContainerCreating: 'bg-amber-50 text-amber-700 ring-amber-200',
  Terminating: 'bg-rose-50 text-rose-700 ring-rose-200',
};
const DOT: Record<string, string> = { Running: 'bg-emerald-500', Pending: 'bg-slate-400 animate-pulse', ContainerCreating: 'bg-amber-400 animate-pulse', Terminating: 'bg-rose-400 animate-pulse' };
const LINE: Record<string, string> = { svc: '#326CE5', cm: '#D97706', secret: '#7C3AED', exposed: '#E11D48' };

interface Conn { from: string; to: string; kind: string; active: boolean }
interface Path extends Conn { d: string }

function PodCard({ pod, flash, selected, dim, onClick, setRef }: { pod: Pod; flash: boolean; selected: boolean; dim: boolean; onClick: () => void; setRef: (el: HTMLElement | null) => void }) {
  const leaked = (l: string) => l.includes('password=');
  return (
    <button
      ref={setRef}
      onClick={onClick}
      className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-lift ${selected ? 'border-k8s-500 ring-2 ring-k8s-500/30' : 'border-slate-200'} ${flash ? 'animate-flash' : ''} ${dim ? 'opacity-50' : ''} ${pod.status === 'Terminating' ? 'opacity-60' : ''}`}
      aria-label={`Pod ${pod.name}, ${pod.status}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[pod.status]}`} />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-slate-900">{pod.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATUS[pod.status]}`}>{pod.status === 'ContainerCreating' ? 'Creating' : pod.status}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Icon name="box" className="h-3 w-3" /> {pod.image} · <span className="font-mono">{pod.ip}</span>
      </div>
      {Object.keys(pod.labels).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(pod.labels).map(([k, v]) => (
            <span key={k} className="chip bg-k8s-50 text-k8s-700">{k}={v}</span>
          ))}
        </div>
      )}
      {pod.configMap && (
        <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center justify-between text-slate-500">
            <span className="font-semibold uppercase tracking-wide">App output</span>
            <span className="chip">{pod.mode === 'env' ? 'env var' : 'volume'}</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[12px] text-slate-800">Calling {appValue(pod) ?? '(not set)'}</div>
        </div>
      )}
      {pod.secret && (
        <div className="mt-2 space-y-0.5 rounded-lg bg-slate-900 px-2.5 py-1.5 font-mono text-[10.5px] leading-snug text-slate-300">
          {pod.logs.slice(-3).map((l, i) => (
            <div key={i} className={leaked(l) ? 'rounded bg-rose-500/25 px-1 text-rose-200' : 'truncate'}>{leaked(l) ? '⚠ ' : ''}{l}</div>
          ))}
        </div>
      )}
    </button>
  );
}

function NamespaceBox({ name, c, flash, selected, onSelect, onService }: { name: string; c: Cluster; flash: string[]; selected: string | null; onSelect: (p: string) => void; onService: (s: string, ns: string) => void }) {
  const pal = PAL[name] ?? FALLBACK;
  const pods = c.pods.filter((p) => p.namespace === name).sort((a, b) => a.name.localeCompare(b.name));
  const svcs = c.services.filter((s) => s.namespace === name);
  const cms = c.configMaps.filter((x) => x.namespace === name);
  const secs = c.secrets.filter((x) => x.namespace === name);
  const wrap = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [paths, setPaths] = useState<Path[]>([]);
  const reg = (id: string) => (el: HTMLElement | null) => { refs.current[id] = el; };

  const conns: Conn[] = [];
  for (const s of svcs) for (const p of pods) if (p.status !== 'Terminating' && matches(s.selector, p.labels)) conns.push({ from: `svc:${s.name}`, to: `pod:${p.name}`, kind: 'svc', active: p.status === 'Running' });
  for (const p of pods) {
    if (p.configMap && cms.some((x) => x.name === p.configMap)) conns.push({ from: `cm:${p.configMap}`, to: `pod:${p.name}`, kind: 'cm', active: true });
    const sec = secs.find((x) => x.name === p.secret);
    if (sec) conns.push({ from: `sec:${sec.name}`, to: `pod:${p.name}`, kind: sec.exposed ? 'exposed' : 'secret', active: true });
  }
  const sig = JSON.stringify(conns) + pods.map((p) => p.name + p.status + p.logs.length).join(',');

  useLayoutEffect(() => {
    const measure = () => {
      const box = wrap.current;
      if (!box) return;
      const b = box.getBoundingClientRect();
      const out: Path[] = [];
      for (const k of conns) {
        const a = refs.current[k.from];
        const z = refs.current[k.to];
        if (!a || !z) continue;
        const ra = a.getBoundingClientRect();
        const rz = z.getBoundingClientRect();
        const x1 = ra.right - b.left, y1 = ra.top + ra.height / 2 - b.top, x2 = rz.left - b.left, y2 = rz.top + rz.height / 2 - b.top;
        out.push({ ...k, d: `M${x1},${y1} C${x1 + 36},${y1} ${x2 - 36},${y2} ${x2},${y2}` });
      }
      setPaths(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    const t = setTimeout(measure, 120);
    return () => { ro.disconnect(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const hasSvc = svcs.length > 0;
  const selected_ = (p: Pod) => svcs.some((s) => matches(s.selector, p.labels));
  const empty = !pods.length && !svcs.length && !cms.length && !secs.length;
  const fl = (k: string) => flash.includes(k);

  return (
    <div className={`rounded-2xl border-2 border-dashed p-4 transition ${pal.box} ${fl(`ns:${name}`) ? 'animate-flash' : ''}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${pal.dot}`} />
        <h3 className={`text-sm font-bold ${pal.head}`}>{name}</h3>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">namespace</span>
        <span className="ml-auto text-[11px] text-slate-500">{pods.length} pod{pods.length === 1 ? '' : 's'}</span>
      </div>
      {empty ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 py-6 text-center text-xs text-slate-500">No resources in this namespace</div>
      ) : (
        <div ref={wrap} className="relative flex flex-col gap-4 md:flex-row md:gap-14">
          {(hasSvc || cms.length > 0 || secs.length > 0) && (
            <div className="w-full shrink-0 space-y-3 md:w-48">
              {svcs.map((s) => {
                const eps = endpointsOf(c, s);
                return (
                  <button key={s.name} ref={reg(`svc:${s.name}`)} onClick={() => onService(s.name, name)} className={`w-full rounded-xl border border-k8s-100 border-l-4 border-l-k8s-500 bg-white p-3 text-left shadow-sm transition hover:shadow-lift ${fl(`svc:${name}/${s.name}`) ? 'animate-flash' : ''}`}>
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900"><Icon name="globe" className="h-3.5 w-3.5 text-k8s-500" />{s.name}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-slate-500">{s.clusterIP}:{s.port}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(s.selector).map(([k, v]) => <span key={k} className="chip bg-k8s-50 text-k8s-700">{k}={v}</span>)}
                      {!Object.keys(s.selector).length && <span className="chip">no selector</span>}
                    </div>
                    <div className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${eps.length ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {eps.length ? <Icon name="check" className="h-3 w-3" /> : <Icon name="alert" className="h-3 w-3" />}
                      {eps.length ? `${eps.length} endpoint${eps.length > 1 ? 's' : ''}` : 'Endpoints: <none>'}
                    </div>
                  </button>
                );
              })}
              {cms.map((x) => (
                <div key={x.name} ref={reg(`cm:${x.name}`)} className={`rounded-xl border border-amber-200 border-l-4 border-l-amber-500 bg-white p-3 shadow-sm ${fl(`cm:${name}/${x.name}`) ? 'animate-flash' : ''}`}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold"><Icon name="file" className="h-3.5 w-3.5 text-amber-600" />{x.name}</div>
                  <div className="mt-1.5 space-y-0.5 font-mono text-[10.5px] text-slate-600">
                    {Object.entries(x.data).map(([k, v]) => <div key={k} className="truncate"><span className="text-amber-700">{k}</span>: {v}</div>)}
                  </div>
                </div>
              ))}
              {secs.map((x) => (
                <div key={x.name} ref={reg(`sec:${x.name}`)} className={`rounded-xl border border-l-4 bg-white p-3 shadow-sm ${x.exposed ? 'border-rose-300 border-l-rose-500 bg-rose-50' : 'border-violet-200 border-l-violet-500'} ${fl(`sec:${name}/${x.name}`) ? 'animate-flash' : ''}`}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold"><Icon name="lock" className={`h-3.5 w-3.5 ${x.exposed ? 'text-rose-600' : 'text-violet-600'}`} />{x.name}</div>
                  <div className="mt-1.5 space-y-0.5 font-mono text-[10.5px] text-slate-600">
                    {Object.entries(x.data).map(([k, v]) => <div key={k} className="truncate"><span className="text-violet-700">{k}</span>: {v}</div>)}
                  </div>
                  {x.exposed && <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-rose-700"><Icon name="alert" className="h-3 w-3" />EXPOSED in logs</div>}
                  {!x.exposed && c.flags.fixed && c.flags.rotated && <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Icon name="check" className="h-3 w-3" />Secure</div>}
                </div>
              ))}
            </div>
          )}
          <div className="grid min-w-0 flex-1 content-start gap-3">
            {pods.map((p) => (
              <PodCard key={p.name} pod={p} flash={fl(`pod:${name}/${p.name}`)} selected={selected === p.name} dim={hasSvc && !selected_(p)} onClick={() => onSelect(p.name)} setRef={reg(`pod:${p.name}`)} />
            ))}
            {!pods.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 py-6 text-center text-xs text-slate-500">No pods</div>}
          </div>
          <svg className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible md:block" aria-hidden="true">
            {paths.map((p, i) => (
              <path key={i} d={p.d} fill="none" stroke={LINE[p.kind]} strokeWidth="2" strokeLinecap="round" strokeDasharray="6 6" opacity={p.active ? 0.9 : 0.35} className={p.active ? 'animate-dash' : ''} />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

export default function ClusterView({ cluster, labId, flash, selected, onSelect, onService }: { cluster: Cluster; labId: number; flash: string[]; selected: string | null; onSelect: (p: string) => void; onService: (s: string, ns: string) => void }) {
  const has = (n: string) => cluster.pods.some((p) => p.namespace === n) || cluster.services.some((s) => s.namespace === n) || cluster.configMaps.some((x) => x.namespace === n) || cluster.secrets.some((x) => x.namespace === n);
  const spaces = cluster.namespaces.filter((n) => n.name !== 'kube-system' && (n.name !== 'default' || labId === 1 || has('default')));
  return (
    <section className="card overflow-hidden" aria-label="Cluster visualization">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-k8s-50 text-k8s-500"><Icon name="server" className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">Cluster</h2>
          <p className="text-[11px] text-slate-500">Every action redraws this view</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />kubelab-node · Ready
        </span>
        <div className="hidden items-center gap-3 text-[11px] text-slate-500 xl:flex">
          <span className="flex items-center gap-1"><i className="h-0.5 w-4 bg-k8s-500" />Service</span>
          <span className="flex items-center gap-1"><i className="h-0.5 w-4 bg-amber-600" />ConfigMap</span>
          <span className="flex items-center gap-1"><i className="h-0.5 w-4 bg-violet-600" />Secret</span>
        </div>
      </header>
      <div className="dots grid gap-4 p-4 sm:p-5 xl:grid-cols-2">
        {spaces.map((n) => (
          <div key={n.name} className={spaces.length === 1 || (n.name === 'development' && labId > 1) ? 'xl:col-span-2' : ''}>
            <NamespaceBox name={n.name} c={cluster} flash={flash} selected={selected} onSelect={onSelect} onService={onService} />
          </div>
        ))}
      </div>
    </section>
  );
}

