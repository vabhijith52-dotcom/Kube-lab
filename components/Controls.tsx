'use client';
import { useState, type ReactNode } from 'react';
import type { Cluster } from '@/lib/sim/types';
import Icon from './Icon';

function Card({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-k8s-50 text-k8s-500"><Icon name={icon} className="h-3.5 w-3.5" /></span>
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
const Preview = ({ cmd }: { cmd: string }) => (
  <p className="truncate rounded-md bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500" title={cmd}><span className="text-emerald-600">$</span> {cmd}</p>
);
const Label = ({ children }: { children: ReactNode }) => <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{children}</span>;

interface P { cluster: Cluster; run: (c: string) => void; selected: string | null; setSelected: (n: string) => void; now: number }

/* ---------- Lab 1 ---------- */
function Lab1({ cluster, run }: P) {
  const [ns, setNs] = useState('testing');
  const [name, setName] = useState('web');
  const [image, setImage] = useState('nginx:1.25');
  const [target, setTarget] = useState('testing');
  const spaces = cluster.namespaces.filter((n) => n.name !== 'kube-system').map((n) => n.name);
  const create = `kubectl create namespace ${ns.trim().toLowerCase()}`;
  const deploy = `kubectl run ${name.trim()} --image=${image} -n ${target}`;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="Create a namespace" icon="box">
        <label><Label>Name</Label><input className="input" value={ns} onChange={(e) => setNs(e.target.value)} /></label>
        <Preview cmd={create} />
        <button className="btn btn-primary w-full" onClick={() => run(create)}>Create namespace</button>
      </Card>
      <Card title="Deploy a Pod" icon="server">
        <div className="grid grid-cols-2 gap-2">
          <label><Label>Pod name</Label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label><Label>Namespace</Label>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>{spaces.map((n) => <option key={n}>{n}</option>)}</select>
          </label>
        </div>
        <label><Label>Image</Label>
          <select className="input" value={image} onChange={(e) => setImage(e.target.value)}>{['nginx:1.25', 'redis:7', 'busybox:1.36'].map((i) => <option key={i}>{i}</option>)}</select>
        </label>
        <Preview cmd={deploy} />
        <button className="btn btn-primary w-full" onClick={() => run(deploy)}>Deploy pod</button>
      </Card>
      <Card title="Inspect each namespace" icon="globe">
        <div className="flex flex-wrap gap-2">
          {spaces.map((n) => <button key={n} className="btn btn-ghost" onClick={() => run(`kubectl get pods -n ${n}`)}>{n}</button>)}
          <button className="btn btn-ghost" onClick={() => run('kubectl get pods -A')}>all (-A)</button>
        </div>
        <Preview cmd="kubectl get pods -n <namespace>" />
        <button className="btn btn-ghost w-full" onClick={() => run('kubectl get ns')}>List namespaces</button>
      </Card>
    </div>
  );
}

/* ---------- Lab 2 ---------- */
function Lab2({ cluster, run, selected, setSelected }: P) {
  const pods = cluster.pods.filter((p) => p.namespace === 'development');
  const cur = pods.find((p) => p.name === selected) ?? pods[0];
  const [k, setK] = useState('app');
  const [v, setV] = useState('backend');
  const [sel, setSel] = useState('app=frontend');
  const label = cur ? `kubectl label pod ${cur.name} ${k}=${v} --overwrite -n development` : '';
  const pairs = sel.split(',').map((x) => x.split('=')).filter((x) => x.length === 2 && x[0]);
  const patch = `kubectl patch svc web-svc -n development -p '${JSON.stringify({ spec: { selector: Object.fromEntries(pairs) } })}'`;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="Edit a Pod's labels" icon="box">
        <label><Label>Pod (or click one in the cluster)</Label>
          <select className="input" value={cur?.name ?? ''} onChange={(e) => setSelected(e.target.value)}>{pods.map((p) => <option key={p.name}>{p.name}</option>)}</select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label><Label>Key</Label><input className="input" value={k} onChange={(e) => setK(e.target.value)} /></label>
          <label><Label>Value</Label><input className="input" value={v} onChange={(e) => setV(e.target.value)} /></label>
        </div>
        <Preview cmd={label} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary" disabled={!cur} onClick={() => run(label)}>Apply label</button>
          <button className="btn btn-ghost" disabled={!cur} onClick={() => run(`kubectl label pod ${cur?.name} ${k}- -n development`)}>Remove key</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-ghost" disabled={!cur} onClick={() => run(`kubectl label pod ${cur?.name} app=backend --overwrite -n development`)}>→ backend</button>
          <button className="btn btn-ghost" disabled={!cur} onClick={() => run(`kubectl label pod ${cur?.name} app=frontend --overwrite -n development`)}>→ frontend</button>
        </div>
      </Card>
      <Card title="Edit the Service selector" icon="globe">
        <label><Label>Selector (key=value)</Label><input className="input" value={sel} onChange={(e) => setSel(e.target.value)} /></label>
        <Preview cmd={patch} />
        <button className="btn btn-primary w-full" disabled={!pairs.length} onClick={() => run(patch)}>Update selector</button>
      </Card>
      <Card title="Inspect" icon="term">
        <button className="btn btn-ghost w-full" onClick={() => run('kubectl get endpoints web-svc -n development')}>Show endpoints</button>
        <button className="btn btn-ghost w-full" onClick={() => run('kubectl get pods --show-labels -n development')}>Pods with labels</button>
        <button className="btn btn-ghost w-full" onClick={() => run('kubectl describe svc web-svc -n development')}>Describe Service</button>
      </Card>
    </div>
  );
}

/* ---------- Lab 3 ---------- */
function Lab3({ cluster, run, now }: P) {
  const [url, setUrl] = useState('https://api.v2.example.com');
  const pod = cluster.pods.find((p) => p.owner === 'web' && p.status !== 'Terminating');
  const running = pod?.status === 'Running';
  const patch = `kubectl patch configmap app-config -n development -p '${JSON.stringify({ data: { API_URL: url } })}'`;
  const check = pod?.mode === 'volume' ? `kubectl exec ${pod?.name} -n development -- cat /etc/config/API_URL` : `kubectl exec ${pod?.name} -n development -- env`;
  const left = cluster.syncAt ? Math.max(0, Math.ceil((cluster.syncAt - now) / 1000)) : 0;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="Edit the ConfigMap" icon="file">
        <label><Label>API_URL</Label><input className="input font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setUrl('https://api.v1.example.com')}>v1</button>
          <button className="btn btn-ghost flex-1" onClick={() => setUrl('https://api.v2.example.com')}>v2</button>
        </div>
        <Preview cmd={patch} />
        <button className="btn btn-primary w-full" onClick={() => run(patch)}>Save ConfigMap</button>
        {cluster.syncAt && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">Volume syncing to the pod in {left}s…</p>}
      </Card>
      <Card title="Pod actions" icon="server">
        <Preview cmd={check} />
        <button className="btn btn-ghost w-full" disabled={!running} onClick={() => run(check)}>{pod?.mode === 'volume' ? 'Read mounted file' : 'Check pod env'}</button>
        <Preview cmd="kubectl rollout restart deployment/web -n development" />
        <button className="btn btn-primary w-full" onClick={() => run('kubectl rollout restart deployment/web -n development')}>Restart Pod</button>
      </Card>
      <Card title="How the pod consumes config" icon="box">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Config mode">
          {(['env', 'volume'] as const).map((m) => (
            <button key={m} onClick={() => pod?.mode !== m && run(`kubectl apply -f web-${m}.yaml -n development`)} aria-pressed={pod?.mode === m} className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${pod?.mode === m ? 'bg-white text-k8s-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {m === 'env' ? 'Env variable' : 'Volume mount'}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-slate-500">Env variables are read once at container start. Mounted files are refreshed by the kubelet after about 5 seconds, with no restart.</p>
      </Card>
    </div>
  );
}

/* ---------- Lab 4 ---------- */
const QUIZ = [
  { t: 'The password is printed in plain text in the application logs', ok: true },
  { t: 'The Secret should have been stored in a ConfigMap instead', ok: false },
  { t: 'Base64 is too weak, so hex encoding would have been safer', ok: false },
];
function Lab4Real({ cluster, run, onFlag }: P & { onFlag: (f: string) => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const sec = cluster.secrets[0];
  const pod = cluster.pods.find((p) => p.owner === 'api' && p.status !== 'Terminating');
  const rotate = `kubectl patch secret db-credentials -p '{"stringData":{"password":"N3wP@ss#2026"}}'`;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card title="1 · Break it" icon="alert">
        <p className="text-xs text-slate-500">Simulate a developer adding a debug log line that prints the DB credentials.</p>
        <button className="btn btn-danger w-full" onClick={() => run('__simulate-leak')}><Icon name="alert" className="h-3.5 w-3.5" />Simulate bug: app logs credentials</button>
        {cluster.flags.leaked && (
          <div className="space-y-1.5 pt-1">
            <Label>What is the security problem?</Label>
            {QUIZ.map((q, i) => (
              <button key={i} onClick={() => { setPick(i); if (q.ok) onFlag('quizPassed'); }} className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${pick === i ? (q.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-rose-300 bg-rose-50 text-rose-900') : 'border-slate-200 hover:bg-slate-50'}`}>
                {q.t}{pick === i && <span className="ml-1 font-bold">{q.ok ? ' ✓ Correct' : ' ✗ Not quite'}</span>}
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card title="2 · Fix it" icon="lock">
        <Preview cmd={rotate} />
        <button className="btn btn-primary w-full" onClick={() => run(rotate)}>Rotate password</button>
        <Preview cmd="kubectl apply -f api-fixed.yaml" />
        <button className="btn btn-primary w-full" onClick={() => run('kubectl apply -f api-fixed.yaml')}>Redeploy with logging fixed</button>
        <p className="text-xs text-slate-500">Rotate first: the leaked password must be treated as compromised.</p>
      </Card>
      <Card title="3 · Decode it" icon="term">
        <button className="btn btn-ghost w-full" onClick={() => run('kubectl get secret db-credentials -o yaml')}>View Secret YAML</button>
        <Preview cmd={`echo ${sec?.data.password ?? '…'} | base64 -d`} />
        <button className="btn btn-ghost w-full" disabled={!sec} onClick={() => run(`echo ${sec.data.password} | base64 -d`)}>Decode the password</button>
        {pod && <button className="btn btn-ghost w-full" disabled={pod.status !== 'Running'} onClick={() => run(`kubectl exec ${pod.name} -- env`)}>exec into pod: env</button>}
      </Card>
    </div>
  );
}

export default function Controls(p: P & { labId: number; onFlag: (f: string) => void }) {
  return (
    <section aria-label="Actions" className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-bold text-slate-900">Actions</h2>
        <span className="text-[11px] text-slate-500">Each one runs the kubectl command shown, in the terminal beside</span>
      </div>
      {p.labId === 1 && <Lab1 {...p} />}
      {p.labId === 2 && <Lab2 {...p} />}
      {p.labId === 3 && <Lab3 {...p} />}
      {p.labId === 4 && <Lab4Real {...p} />}
    </section>
  );
}
