import type { Cluster, ExecResult, Pod } from './types';
import { age, b64, clone, endpointsOf, matches, newPod, snapshot, suffix, unb64 } from './engine';

const ALIASES: Record<string, string> = {
  namespaces: 'ns', namespace: 'ns', ns: 'ns',
  pods: 'pod', pod: 'pod', po: 'pod',
  services: 'svc', service: 'svc', svc: 'svc',
  endpoints: 'ep', endpoint: 'ep', ep: 'ep',
  configmaps: 'cm', configmap: 'cm', cm: 'cm',
  secrets: 'secret', secret: 'secret',
  nodes: 'node', node: 'node',
  deployments: 'deploy', deployment: 'deploy', deploy: 'deploy',
};
const PLURAL: Record<string, string> = { ns: 'namespaces', pod: 'pods', svc: 'services', ep: 'endpoints', cm: 'configmaps', secret: 'secrets', deploy: 'deployments' };

export const VERBS = ['get', 'describe', 'create', 'run', 'label', 'expose', 'delete', 'patch', 'exec', 'logs', 'rollout', 'apply', 'config'];

export const HELP = `KubeLab supports a practical subset of kubectl:

  kubectl get ns|pods|svc|endpoints|cm|secrets|nodes [-n NS] [-A] [-o wide|yaml] [-l k=v] [--show-labels]
  kubectl describe pod|svc NAME [-n NS]
  kubectl create namespace NAME
  kubectl create configmap NAME --from-literal=k=v
  kubectl create secret generic NAME --from-literal=k=v
  kubectl run NAME --image=IMG [-n NS] [--labels=a=b,c=d]
  kubectl label pod NAME key=value [--overwrite]   (key- removes)
  kubectl expose pod NAME --port=80 [--selector=k=v]
  kubectl patch configmap|secret|svc NAME -p '{...}'
  kubectl delete ns|pod|svc|cm|secret NAME
  kubectl exec POD -- env | cat /etc/config/KEY
  kubectl logs POD
  kubectl rollout restart deployment/NAME
  kubectl apply -f api-fixed.yaml | web-volume.yaml | web-env.yaml
  kubectl config set-context --current --namespace=NS
  echo STRING | base64 -d
  clear | help`;

/* ---------- parsing ---------- */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  let has = false;
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

type Flags = Record<string, string[] | true>;
const VALUE_FLAGS = new Set(['-n', '--namespace', '-o', '--output', '-l', '--selector', '--image', '--labels', '--from-literal', '--port', '--target-port', '--tcp', '-p', '--patch', '-f', '--filename', '--name', '-c', '--container']);

function parseArgs(tokens: string[]) {
  const pos: string[] = [];
  const flags: Flags = {};
  let rest: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') {
      rest = tokens.slice(i + 1);
      break;
    }
    if (t.startsWith('-') && t.length > 1) {
      let name = t;
      let val: string | undefined;
      if (t.startsWith('--') && t.includes('=')) {
        const k = t.indexOf('=');
        name = t.slice(0, k);
        val = t.slice(k + 1);
      }
      if (VALUE_FLAGS.has(name)) {
        if (val === undefined) val = tokens[++i];
        const cur = flags[name];
        const arr = Array.isArray(cur) ? cur : [];
        arr.push(val ?? '');
        flags[name] = arr;
      } else flags[name] = true;
    } else pos.push(t);
  }
  return { pos, flags, rest };
}

const val = (f: Flags, ...n: string[]) => {
  for (const k of n) {
    const v = f[k];
    if (Array.isArray(v) && v.length) return v[v.length - 1];
  }
  return undefined;
};
const vals = (f: Flags, ...n: string[]) => n.flatMap((k) => (Array.isArray(f[k]) ? (f[k] as string[]) : []));
const has = (f: Flags, ...n: string[]) => n.some((k) => f[k] !== undefined);

function parseKV(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of s.split(',').filter(Boolean)) {
    const i = part.indexOf('=');
    if (i < 1) return null;
    out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

function table(rows: string[][]): string {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(w[i] + 3))).join('')).join('\n');
}

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const selStr = (s: Record<string, string>) => Object.entries(s).map(([k, v]) => `${k}=${v}`).join(',') || '<none>';
const rsHash = (n: number) => suffix(n * 3 + 1, 6);

/* ---------- executor ---------- */
export function exec(cluster: Cluster, line: string, now: number): ExecResult {
  const raw = line.trim();
  if (!raw) return { cluster, output: '' };
  if (raw === 'clear') return { cluster, output: '', clear: true };
  if (raw === 'help') return { cluster, output: HELP };

  const c = clone(cluster);
  const fail = (output: string, explain?: string): ExecResult => ({ cluster, output, error: true, explain });
  const ok = (output: string, explain?: string, display?: string): ExecResult => {
    const svc = c.services.find((s) => s.name === 'web-svc');
    if (svc && endpointsOf(c, svc).length < 2) c.flags.shrunk = true;
    return { cluster: c, output, explain, display };
  };
  const notFound = (kind: string, name: string) => fail(`Error from server (NotFound): ${kind} "${name}" not found`);

  /* teaching command: echo X | base64 -d */
  const m = raw.match(/^echo\s+(.+?)\s*\|\s*base64\s+(?:-d|-D|--decode)\s*$/);
  if (m) {
    const input = tokenize(m[1])[0] ?? '';
    try {
      const out = unb64(input);
      if (c.secrets.some((s) => Object.values(s.data).includes(input))) c.flags.decoded = true;
      return ok(out, 'Base64 is just an encoding. Anyone can reverse it. It is not encryption.');
    } catch {
      return fail('base64: invalid input');
    }
  }

  /* hidden action used by the Lab 4 "Simulate bug" button */
  if (raw === '__simulate-leak') {
    const pod = c.pods.find((p) => p.owner === 'api' && p.status !== 'Terminating');
    const sec = pod && c.secrets.find((s) => s.namespace === pod.namespace && s.name === pod.secret);
    if (!pod || !sec) return fail('error: nothing to leak in this lab');
    pod.logs.push(`[DEBUG] connecting to db user=${unb64(sec.data.username)} password=${unb64(sec.data.password)}`);
    sec.exposed = true;
    c.flags.leaked = true;
    c.flags.fixed = false;
    c.flags.rotated = false;
    return ok(pod.logs.join('\n'), 'The app printed its Secret to stdout. Anyone who can read logs now has the password.', `kubectl logs ${pod.name} -n ${pod.namespace}`);
  }

  const tokens = tokenize(raw);
  if (tokens[0] !== 'kubectl') return fail(`bash: ${tokens[0]}: command not found. Commands start with kubectl (type help).`);
  if (tokens.length === 1 || tokens[1] === '--help' || tokens[1] === '-h') return { cluster, output: HELP };

  const verb = tokens[1];
  const { pos, flags: f, rest } = parseArgs(tokens.slice(2));
  const all = has(f, '-A', '--all-namespaces');
  const ns = val(f, '-n', '--namespace') ?? c.ctxNs;
  const nsExists = (n: string) => c.namespaces.some((x) => x.name === n);
  const findPod = (name: string, n = ns) => c.pods.find((p) => p.name === name && p.namespace === n);
  const split = (s?: string): [string, string | undefined] => {
    const [a, b] = (s ?? '').split('/');
    return [a, b];
  };
  const replacePod = (old: Pod, patch: Partial<Pod> = {}) => {
    const seq = c.seq;
    const fresh = newPod(c, { ...old, ...patch, name: `${old.owner}-${rsHash(seq)}-${suffix(seq)}`, ip: `10.244.0.${10 + seq}`, status: 'Pending', restarts: 0, logs: [`Started container ${old.owner}`], readyAt: now + 1500, createdAt: now }, now);
    snapshot(c, fresh);
    c.pods = c.pods.filter((p) => p !== old && !(p.name === old.name && p.namespace === old.namespace));
    c.pods.push(fresh);
    return fresh;
  };

  switch (verb) {
    /* ================= get ================= */
    case 'get': {
      const [rRaw, inline] = split(pos[0]);
      if (!rRaw) return fail('error: You must specify the type of resource to get.');
      const type = ALIASES[rRaw];
      if (!type) return fail(`error: the server doesn't have a resource type "${rRaw}"`);
      const name = inline ?? pos[1];
      const out = val(f, '-o', '--output');
      const wide = out === 'wide';
      const inNs = <T extends { namespace: string }>(a: T[]) => a.filter((x) => all || x.namespace === ns);
      const emptyMsg = all ? 'No resources found' : `No resources found in ${ns} namespace.`;
      const withNs = (head: string[], rows: string[][], src: { namespace: string }[]) =>
        table([all ? ['NAMESPACE', ...head] : head, ...rows.map((r, i) => (all ? [src[i].namespace, ...r] : r))]);

      if (type === 'node')
        return ok(table([['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'], ['kubelab-node', 'Ready', 'control-plane', '12d', 'v1.30.2']]), 'A node is the machine that runs your pods.');

      if (type === 'ns') {
        const rows = c.namespaces.map((n) => [n.name, 'Active', age(now - n.createdAt)]);
        return ok(table([['NAME', 'STATUS', 'AGE'], ...rows]), 'Namespaces are logical partitions of one cluster.');
      }

      if (type === 'pod') {
        let list = inNs(c.pods);
        if (name) list = list.filter((p) => p.name === name);
        const sel = val(f, '-l', '--selector');
        if (sel) {
          const kv = parseKV(sel);
          if (!kv) return fail(`error: unable to parse requirement: ${sel}`);
          list = list.filter((p) => Object.entries(kv).every(([k, v]) => p.labels[k] === v));
        }
        if (name && !list.length) return notFound('pods', name);
        if (!all && !name) c.flags[`viewed:${ns}`] = true;
        if (!list.length) return ok(emptyMsg, `Pods live inside a namespace. kubectl only shows the current one (${ns}) unless you pass -n or -A.`);
        const head = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(wide ? ['IP', 'NODE'] : []), ...(has(f, '--show-labels') ? ['LABELS'] : [])];
        const rows = list.map((p) => [p.name, p.status === 'Running' ? '1/1' : '0/1', p.status, String(p.restarts), age(now - p.createdAt), ...(wide ? [p.ip, 'kubelab-node'] : []), ...(has(f, '--show-labels') ? [selStr(p.labels)] : [])]);
        return ok(withNs(head, rows, list), all ? 'The -A flag lists pods from every namespace at once.' : `Showing pods in the ${ns} namespace only. Other namespaces have their own separate lists.`);
      }

      if (type === 'svc') {
        let list = inNs(c.services);
        if (name) list = list.filter((s) => s.name === name);
        if (name && !list.length) return notFound('services', name);
        if (!list.length) return ok(emptyMsg);
        const rows = list.map((s) => [s.name, 'ClusterIP', s.clusterIP, '<none>', `${s.port}/TCP`, age(now - s.createdAt)]);
        return ok(withNs(['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'], rows, list), 'A Service gives a stable address to a changing set of pods.');
      }

      if (type === 'ep') {
        let list = inNs(c.services);
        if (name) list = list.filter((s) => s.name === name);
        if (name && !list.length) return notFound('endpoints', name);
        if (!list.length) return ok(emptyMsg);
        c.flags['viewed:endpoints'] = true;
        const rows = list.map((s) => {
          const eps = endpointsOf(c, s).map((p) => `${p.ip}:${s.port}`);
          return [s.name, eps.length ? eps.slice(0, 3).join(',') + (eps.length > 3 ? ` + ${eps.length - 3} more...` : '') : '<none>', age(now - s.createdAt)];
        });
        return ok(withNs(['NAME', 'ENDPOINTS', 'AGE'], rows, list), 'Endpoints are computed live: Running pods whose labels match the Service selector.');
      }

      if (type === 'cm' || type === 'secret') {
        const src = type === 'cm' ? c.configMaps : c.secrets;
        let list = inNs(src as { namespace: string; name: string; data: Record<string, string> }[]);
        if (name) list = list.filter((x) => x.name === name);
        if (name && !list.length) return notFound(PLURAL[type], name);
        if (out === 'yaml') {
          if (!name) return fail('error: specify a name to print YAML');
          const o = list[0] as { name: string; namespace: string; data: Record<string, string> };
          const body = Object.entries(o.data).sort().map(([k, v]) => `  ${k}: ${v}`).join('\n');
          if (type === 'secret') c.flags['viewed:secretyaml'] = true;
          return ok(`apiVersion: v1\ndata:\n${body}\nkind: ${type === 'cm' ? 'ConfigMap' : 'Secret'}\nmetadata:\n  name: ${o.name}\n  namespace: ${o.namespace}${type === 'secret' ? '\ntype: Opaque' : ''}`, type === 'secret' ? 'Secret values are only base64-encoded. Anyone with read access can decode them.' : undefined);
        }
        if (!list.length) return ok(emptyMsg);
        const rows = list.map((x) => (type === 'cm' ? [x.name, String(Object.keys(x.data).length), '5d'] : [x.name, 'Opaque', String(Object.keys(x.data).length), '5d']));
        return ok(withNs(type === 'cm' ? ['NAME', 'DATA', 'AGE'] : ['NAME', 'TYPE', 'DATA', 'AGE'], rows, list), undefined);
      }

      if (type === 'deploy') {
        const owners = [...new Set(inNs(c.pods).filter((p) => p.owner).map((p) => p.owner as string))];
        if (!owners.length) return ok(emptyMsg);
        const rows = owners.map((o) => {
          const n = c.pods.filter((p) => p.owner === o && p.status === 'Running').length;
          return [o, `${n}/1`, '1', String(n), '5d'];
        });
        return ok(table([['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'], ...rows]));
      }
      return fail('error: unsupported resource');
    }

    /* ================= describe ================= */
    case 'describe': {
      const [rRaw, inline] = split(pos[0]);
      const type = ALIASES[rRaw];
      const name = inline ?? pos[1];
      if (!name) return fail('error: You must specify the name of the resource to describe.');
      if (type === 'pod') {
        const p = findPod(name);
        if (!p) return notFound('pods', name);
        const lines = [
          `Name:         ${p.name}`, `Namespace:    ${p.namespace}`, 'Node:         kubelab-node/192.168.49.2', `Status:       ${p.status}`, `IP:           ${p.ip}`, `Labels:       ${selStr(p.labels).replace(/,/g, '\n              ')}`,
          'Containers:', '  main:', `    Image:   ${p.image}`,
        ];
        if (p.configMap && p.mode === 'env') lines.push('    Environment Variables from:', `      ${p.configMap}  ConfigMap  Optional: false`);
        if (p.secret) lines.push('    Environment Variables from:', `      ${p.secret}  Secret  Optional: false`);
        lines.push(`    Environment:  ${Object.keys(p.env).filter((k) => !['HOSTNAME', 'KUBERNETES_SERVICE_HOST'].includes(k)).length ? 'see kubectl exec -- env' : '<none>'}`);
        if (p.mode === 'volume') lines.push(`    Mounts:   /etc/config from ${p.configMap} (ConfigMap, ro)`);
        const a = age(now - p.createdAt);
        lines.push('Events:', '  Type    Reason     Age  From               Message', '  ----    ------     ---  ----               -------', `  Normal  Scheduled  ${a}   default-scheduler  Successfully assigned ${p.namespace}/${p.name} to kubelab-node`, `  Normal  Pulled     ${a}   kubelet            Container image "${p.image}" already present`, `  Normal  Started    ${a}   kubelet            Started container main`);
        return ok(lines.join('\n'), 'describe shows the full object plus events. It is the first place to look when a pod misbehaves.');
      }
      if (type === 'svc') {
        const s = c.services.find((x) => x.name === name && x.namespace === ns);
        if (!s) return notFound('services', name);
        c.flags['viewed:endpoints'] = true;
        const eps = endpointsOf(c, s).map((p) => `${p.ip}:${s.port}`);
        return ok([`Name:              ${s.name}`, `Namespace:         ${s.namespace}`, `Selector:          ${selStr(s.selector)}`, 'Type:              ClusterIP', `IP:                ${s.clusterIP}`, `Port:              ${s.port}/TCP`, `Endpoints:         ${eps.join(',') || '<none>'}`].join('\n'), 'The Service finds pods only through its label selector.');
      }
      return fail('error: describe supports pod and svc in this simulator');
    }

    /* ================= create ================= */
    case 'create': {
      const [rRaw] = split(pos[0]);
      const type = ALIASES[rRaw];
      if (type === 'ns') {
        const name = pos[1];
        if (!name) return fail('error: exactly one NAME is required, got 0');
        if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name)) return fail(`The Namespace "${name}" is invalid: metadata.name: Invalid value: "${name}": a lowercase RFC 1123 label must consist of lower case alphanumeric characters or '-'`);
        if (nsExists(name)) return fail(`Error from server (AlreadyExists): namespaces "${name}" already exists`);
        c.namespaces.push({ name, createdAt: now });
        return ok(`namespace/${name} created`, 'Namespaces give logical separation and scope resource names. They are not a security boundary on their own.');
      }
      if (type === 'cm' || type === 'secret') {
        const rawName = type === 'secret' ? pos[2] : pos[1];
        if (type === 'secret' && pos[1] !== 'generic') return fail('error: usage: kubectl create secret generic NAME --from-literal=k=v');
        if (!rawName) return fail('error: exactly one NAME is required, got 0');
        if (!nsExists(ns)) return notFound('namespaces', ns);
        const data: Record<string, string> = {};
        for (const kv of vals(f, '--from-literal')) {
          const i = kv.indexOf('=');
          if (i < 1) return fail(`error: invalid literal source ${kv}, expected key=value`);
          data[kv.slice(0, i)] = type === 'secret' ? b64(kv.slice(i + 1)) : kv.slice(i + 1);
        }
        const list = type === 'cm' ? c.configMaps : c.secrets;
        if (list.some((x) => x.name === rawName && x.namespace === ns)) return fail(`Error from server (AlreadyExists): ${PLURAL[type]} "${rawName}" already exists`);
        if (type === 'cm') c.configMaps.push({ name: rawName, namespace: ns, data, createdAt: now });
        else c.secrets.push({ name: rawName, namespace: ns, data, exposed: false, createdAt: now });
        return ok(`${type === 'cm' ? 'configmap' : 'secret'}/${rawName} created`);
      }
      if (type === 'svc' && pos[1] === 'clusterip') {
        const name = pos[2];
        if (!name) return fail('error: NAME is required');
        const port = parseInt((val(f, '--tcp') ?? '80:80').split(':')[0], 10) || 80;
        if (c.services.some((s) => s.name === name && s.namespace === ns)) return fail(`Error from server (AlreadyExists): services "${name}" already exists`);
        c.services.push({ name, namespace: ns, selector: {}, clusterIP: `10.96.${40 + c.seq}.${10 + c.seq}`, port, createdAt: now });
        c.seq++;
        return ok(`service/${name} created`);
      }
      return fail('error: create supports namespace, configmap, secret generic, service clusterip');
    }

    /* ================= run ================= */
    case 'run': {
      const name = pos[0];
      const image = val(f, '--image');
      if (!name) return fail('error: NAME is required for run');
      if (!image) return fail('error: required flag(s) "image" not set');
      if (!nsExists(ns)) return notFound('namespaces', ns);
      if (findPod(name)) return fail(`Error from server (AlreadyExists): pods "${name}" already exists`);
      const l = val(f, '--labels');
      const labels = l ? parseKV(l) : { run: name };
      if (!labels) return fail(`error: invalid labels "${l}"`);
      c.pods.push(newPod(c, { name, namespace: ns, image, labels }, now));
      return ok(`pod/${name} created`, 'A Pod is created. The scheduler picks a node and the kubelet starts the container (Pending, ContainerCreating, Running).');
    }

    /* ================= label ================= */
    case 'label': {
      const [rRaw, inline] = split(pos[0]);
      if (ALIASES[rRaw] !== 'pod') return fail('error: this simulator supports labeling pods only');
      const items = pos.slice(1);
      const name = inline ?? items.shift();
      if (!name) return fail('error: resource name may not be empty');
      const pod = findPod(name);
      if (!pod) return notFound('pods', name);
      if (!items.length) return fail('error: at least one label update is required');
      for (const kv of items) {
        if (kv.endsWith('-') && !kv.includes('=')) {
          delete pod.labels[kv.slice(0, -1)];
          continue;
        }
        const i = kv.indexOf('=');
        if (i < 1) return fail(`error: unknown label format "${kv}"`);
        const k = kv.slice(0, i);
        const v = kv.slice(i + 1);
        if (k in pod.labels && pod.labels[k] !== v && !has(f, '--overwrite')) return fail(`error: '${k}' already has a value (${pod.labels[k]}), and --overwrite is false`);
        pod.labels[k] = v;
      }
      c.flags.relabeled = true;
      return ok(`pod/${name} labeled`, 'Labels are plain key/value metadata. Services find pods only by matching labels, never by name.');
    }

    /* ================= expose ================= */
    case 'expose': {
      const [rRaw, inline] = split(pos[0]);
      if (ALIASES[rRaw] !== 'pod') return fail('error: expose supports pods only in this simulator');
      const pod = findPod(inline ?? pos[1]);
      if (!pod) return notFound('pods', inline ?? pos[1] ?? '');
      const name = val(f, '--name') ?? pod.name;
      if (c.services.some((s) => s.name === name && s.namespace === ns)) return fail(`Error from server (AlreadyExists): services "${name}" already exists`);
      const selector = val(f, '--selector') ? parseKV(val(f, '--selector') as string) : { ...pod.labels };
      if (!selector) return fail('error: invalid selector');
      c.services.push({ name, namespace: ns, selector, clusterIP: `10.96.${40 + c.seq}.${10 + c.seq}`, port: parseInt(val(f, '--port') ?? '80', 10) || 80, createdAt: now });
      c.seq++;
      return ok(`service/${name} exposed`);
    }

    /* ================= delete ================= */
    case 'delete': {
      const [rRaw, inline] = split(pos[0]);
      const type = ALIASES[rRaw];
      const name = inline ?? pos[1];
      if (!type || !name) return fail('error: usage: kubectl delete TYPE NAME');
      if (type === 'ns') {
        if (['default', 'kube-system'].includes(name)) return fail(`Error from server (Forbidden): namespaces "${name}" is forbidden: this namespace may not be deleted`);
        if (!nsExists(name)) return notFound('namespaces', name);
        c.namespaces = c.namespaces.filter((n) => n.name !== name);
        c.pods = c.pods.filter((p) => p.namespace !== name);
        c.services = c.services.filter((s) => s.namespace !== name);
        c.configMaps = c.configMaps.filter((x) => x.namespace !== name);
        c.secrets = c.secrets.filter((x) => x.namespace !== name);
        return ok(`namespace "${name}" deleted`, 'Deleting a namespace deletes everything inside it.');
      }
      if (type === 'pod') {
        const p = findPod(name);
        if (!p) return notFound('pods', name);
        if (p.owner) {
          replacePod(p);
          return ok(`pod "${name}" deleted`, 'The Deployment immediately created a replacement pod. The new container re-reads its config.');
        }
        p.status = 'Terminating';
        p.readyAt = now + 1200;
        return ok(`pod "${name}" deleted`);
      }
      const bucket = type === 'svc' ? 'services' : type === 'cm' ? 'configMaps' : type === 'secret' ? 'secrets' : null;
      if (!bucket) return fail('error: cannot delete this resource type');
      const arr = c[bucket] as { name: string; namespace: string }[];
      if (!arr.some((x) => x.name === name && x.namespace === ns)) return notFound(PLURAL[type], name);
      (c[bucket] as unknown) = arr.filter((x) => !(x.name === name && x.namespace === ns));
      return ok(`${PLURAL[type].replace(/s$/, '')} "${name}" deleted`);
    }

    /* ================= patch ================= */
    case 'patch': {
      const [rRaw, inline] = split(pos[0]);
      const type = ALIASES[rRaw];
      const name = inline ?? pos[1];
      const body = val(f, '-p', '--patch');
      if (!type || !name || !body) return fail("error: usage: kubectl patch TYPE NAME -p '{...}'");
      let obj: any;
      try {
        obj = JSON.parse(body);
      } catch {
        return fail(`error: unable to parse "${body}": invalid JSON`);
      }
      if (type === 'cm') {
        const cm = c.configMaps.find((x) => x.name === name && x.namespace === ns);
        if (!cm) return notFound('configmaps', name);
        for (const [k, v] of Object.entries(obj.data ?? {})) {
          if (v === null) delete cm.data[k];
          else cm.data[k] = String(v);
        }
        if (c.pods.some((p) => p.mode === 'volume' && p.configMap === name && p.namespace === ns)) c.syncAt = now + 5000;
        return ok(`configmap/${name} patched`, 'Only the ConfigMap object changed. Running containers are NOT restarted, and env vars are never updated in place.');
      }
      if (type === 'secret') {
        const s = c.secrets.find((x) => x.name === name && x.namespace === ns);
        if (!s) return notFound('secrets', name);
        for (const [k, v] of Object.entries(obj.stringData ?? {})) {
          const enc = b64(String(v));
          if (k === 'password' && s.data[k] !== enc) c.flags.rotated = true;
          s.data[k] = enc;
        }
        for (const [k, v] of Object.entries(obj.data ?? {})) s.data[k] = String(v);
        if (c.flags.rotated && c.flags.fixed) s.exposed = false;
        return ok(`secret/${name} patched`, 'The Secret now holds a new password. Running pods keep the old value until they restart.');
      }
      if (type === 'svc') {
        const s = c.services.find((x) => x.name === name && x.namespace === ns);
        if (!s) return notFound('services', name);
        for (const [k, v] of Object.entries(obj.spec?.selector ?? {})) {
          if (v === null) delete s.selector[k];
          else s.selector[k] = String(v);
        }
        c.flags.relabeled = true;
        return ok(`service/${name} patched`, 'Selector changed. Endpoints are recalculated immediately.');
      }
      return fail('error: patch supports configmap, secret and svc');
    }

    /* ================= exec ================= */
    case 'exec': {
      const name = pos[0];
      if (!name) return fail('error: expected POD_NAME and COMMAND');
      const p = findPod(name);
      if (!p) return notFound('pods', name);
      if (p.status !== 'Running') return fail(`error: unable to upgrade connection: container not found ("main"), pod status is ${p.status}`);
      const cmd = rest[0];
      if (cmd === 'env' || cmd === 'printenv') {
        const cm = c.configMaps.find((x) => x.name === p.configMap && x.namespace === p.namespace);
        if (cm && p.mode === 'env' && p.env.API_URL !== cm.data.API_URL) c.flags.sawStale = true;
        return ok(Object.entries(p.env).sort().map(([k, v]) => `${k}=${v}`).join('\n'), 'Environment variables are fixed when the container starts. This pod still has the value from when it started.');
      }
      if (cmd === 'cat' && rest[1]?.startsWith('/etc/config/')) {
        const key = rest[1].replace('/etc/config/', '');
        if (p.mode === 'volume' && key in p.mounted) return ok(p.mounted[key], 'Mounted ConfigMap files are refreshed by the kubelet after a short delay (no restart needed).');
        return fail(`cat: ${rest[1]}: No such file or directory`);
      }
      return fail(`error: this simulator supports: exec POD -- env | cat /etc/config/KEY`);
    }

    /* ================= logs ================= */
    case 'logs': {
      const p = findPod(pos[0] ?? '');
      if (!p) return notFound('pods', pos[0] ?? '');
      c.flags.viewedLogs = true;
      return ok(p.logs.join('\n'), 'Logs are whatever the app writes to stdout. Never print secrets here.');
    }

    /* ================= rollout ================= */
    case 'rollout': {
      if (pos[0] !== 'restart') return fail('error: usage: kubectl rollout restart deployment/NAME');
      const [, inline] = split(pos[1]);
      const name = inline ?? pos[2];
      const pods = c.pods.filter((p) => p.owner === name && p.namespace === ns && p.status !== 'Terminating');
      if (!pods.length) return fail(`Error from server (NotFound): deployments.apps "${name ?? ''}" not found`);
      pods.forEach((p) => replacePod(p));
      return ok(`deployment.apps/${name} restarted`, 'The pods are recreated, so the new containers read the current ConfigMap and Secret values.');
    }

    /* ================= apply ================= */
    case 'apply': {
      const file = val(f, '-f', '--filename');
      if (file === 'api-fixed.yaml') {
        const p = c.pods.find((x) => x.owner === 'api' && x.namespace === ns && x.status !== 'Terminating');
        if (!p) return notFound('deployments.apps', 'api');
        const fresh = replacePod(p);
        fresh.logs = ['Server listening on :8080', 'Connected to database', 'Loaded credentials from Secret (not logged)'];
        c.flags.fixed = true;
        const s = c.secrets.find((x) => x.name === p.secret && x.namespace === p.namespace);
        if (s && c.flags.rotated) s.exposed = false;
        return ok('deployment.apps/api configured', 'Redeployed with the logging line removed. Rotating the password is still needed because the old one was exposed.');
      }
      if (file === 'web-volume.yaml' || file === 'web-env.yaml') {
        const p = c.pods.find((x) => x.owner === 'web' && x.namespace === ns && x.status !== 'Terminating');
        if (!p) return notFound('deployments.apps', 'web');
        const fresh = replacePod(p, { mode: file === 'web-volume.yaml' ? 'volume' : 'env' });
        snapshot(c, fresh);
        return ok('deployment.apps/web configured', file === 'web-volume.yaml' ? 'The ConfigMap is now mounted as a file volume at /etc/config.' : 'The ConfigMap is now injected as environment variables.');
      }
      return fail(`error: the path "${file ?? ''}" does not exist`);
    }

    /* ================= config ================= */
    case 'config': {
      if (pos[0] === 'set-context' && has(f, '--namespace', '-n')) {
        c.ctxNs = val(f, '--namespace', '-n') ?? 'default';
        return ok('Context "kubelab" modified.', `Later commands now default to the ${c.ctxNs} namespace.`);
      }
      return fail('error: supported: kubectl config set-context --current --namespace=NS');
    }
  }

  const near = VERBS.map((v) => [v, lev(verb, v)] as const).sort((a, b) => a[1] - b[1])[0];
  return fail(`error: unknown command "${verb}" for "kubectl"${near[1] <= 3 ? `\n\nDid you mean this?\n\t${near[0]}` : ''}`);
}
