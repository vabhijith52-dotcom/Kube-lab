import type { Cluster, Pod, Service } from './types';

export const b64 = (s: string) => btoa(s);
export const unb64 = (s: string) => atob(s);
export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const ALPHA = 'bcdfghjklmnpqrstvwxz2456789';
export function suffix(n: number, len = 5): string {
  let x = Math.imul(n + 7, 2654435761) >>> 0;
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHA[x % ALPHA.length];
    x = (Math.floor(x / ALPHA.length) + Math.imul(n + i + 1, 40503)) >>> 0;
  }
  return s;
}

export function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const matches = (sel: Record<string, string>, labels: Record<string, string>) => {
  const e = Object.entries(sel);
  return e.length > 0 && e.every(([k, v]) => labels[k] === v);
};

/** Endpoints are always derived: Running pods in the same namespace whose labels match. */
export const endpointsOf = (c: Cluster, s: Service) =>
  c.pods.filter((p) => p.namespace === s.namespace && p.status === 'Running' && matches(s.selector, p.labels));

/** Container start: env vars are read ONCE here; volumes start with current data. */
export function snapshot(c: Cluster, p: Pod) {
  const env: Record<string, string> = { HOSTNAME: p.name, KUBERNETES_SERVICE_HOST: '10.96.0.1' };
  const cm = p.configMap ? c.configMaps.find((x) => x.namespace === p.namespace && x.name === p.configMap) : undefined;
  if (cm && p.mode === 'env') Object.assign(env, cm.data);
  const sec = p.secret ? c.secrets.find((x) => x.namespace === p.namespace && x.name === p.secret) : undefined;
  if (sec) for (const [k, v] of Object.entries(sec.data)) env['DB_' + k.toUpperCase()] = unb64(v);
  p.env = env;
  p.mounted = cm && p.mode === 'volume' ? { ...cm.data } : {};
}

export function newPod(
  c: Cluster,
  o: Partial<Pod> & { name: string; namespace: string; image: string },
  now: number,
  running = false,
): Pod {
  const seq = c.seq++;
  const p: Pod = {
    labels: {},
    restarts: 0,
    mode: 'env',
    env: {},
    mounted: {},
    logs: [`Started container ${o.name}`],
    createdAt: now,
    ip: `10.244.0.${10 + seq}`,
    status: running ? 'Running' : 'Pending',
    readyAt: running ? undefined : now + 1500,
    ...o,
  };
  snapshot(c, p);
  return p;
}

/** Advance pod lifecycles and volume syncs. Returns null when nothing changed. */
export function tick(c: Cluster, now: number): Cluster | null {
  let changed = false;
  const n = clone(c);
  n.pods = n.pods.filter((p) => {
    if (p.status === 'Terminating' && p.readyAt !== undefined && now >= p.readyAt) {
      changed = true;
      return false;
    }
    return true;
  });
  for (const p of n.pods) {
    if (p.status === 'Pending' && now >= p.createdAt + 500) {
      p.status = 'ContainerCreating';
      changed = true;
    }
    if (p.status === 'ContainerCreating' && p.readyAt !== undefined && now >= p.readyAt) {
      p.status = 'Running';
      p.readyAt = undefined;
      changed = true;
    }
  }
  if (n.syncAt !== null && now >= n.syncAt) {
    for (const p of n.pods) {
      if (p.mode !== 'volume' || !p.configMap) continue;
      const cm = n.configMaps.find((x) => x.namespace === p.namespace && x.name === p.configMap);
      if (cm) p.mounted = { ...cm.data };
    }
    n.syncAt = null;
    n.flags.volumeSynced = true;
    changed = true;
  }
  return changed ? n : null;
}

/** Keys of resources that changed, used to flash them in the UI. */
export function diffKeys(a: Cluster, b: Cluster): string[] {
  const out: string[] = [];
  const cmp = <T,>(xa: T[], xb: T[], key: (x: T) => string, view: (x: T, c: Cluster) => unknown = (x) => x) => {
    const ma = new Map(xa.map((x) => [key(x), JSON.stringify(view(x, a))]));
    for (const x of xb) if (ma.get(key(x)) !== JSON.stringify(view(x, b))) out.push(key(x));
  };
  cmp(a.namespaces.length ? b.namespaces : [], b.namespaces, (x) => `ns:${x.name}`);
  cmp(a.pods, b.pods, (x) => `pod:${x.namespace}/${x.name}`);
  cmp(a.services, b.services, (x) => `svc:${x.namespace}/${x.name}`, (x, c) => [x, endpointsOf(c, x).map((p) => p.name)]);
  cmp(a.configMaps, b.configMaps, (x) => `cm:${x.namespace}/${x.name}`);
  cmp(a.secrets, b.secrets, (x) => `sec:${x.namespace}/${x.name}`);
  return out;
}

export const appValue = (p: Pod) => (p.mode === 'env' ? p.env.API_URL : p.mounted.API_URL);
