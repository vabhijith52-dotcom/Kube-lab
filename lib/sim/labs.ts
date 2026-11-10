import type { Cluster } from './types';
import { appValue, b64, endpointsOf, newPod } from './engine';

export interface Step {
  text: string;
  hint: (c: Cluster) => string;
  done: (c: Cluster) => boolean;
  optional?: boolean;
}
export interface Lab {
  id: number;
  title: string;
  short: string;
  goal: string;
  steps: Step[];
  ask: string;
  takeaway: string;
  initial: (now: number) => Cluster;
}

const DAY = 864e5;
const base = (now: number, extra: string[] = []): Cluster => ({
  namespaces: [
    { name: 'default', createdAt: now - 12 * DAY },
    { name: 'kube-system', createdAt: now - 12 * DAY },
    ...extra.map((name) => ({ name, createdAt: now - 3 * DAY })),
  ],
  pods: [], services: [], configMaps: [], secrets: [], seq: 0, ctxNs: 'default', flags: {}, syncAt: null,
});

const web = (c: Cluster) => c.pods.find((p) => p.owner === 'web' && p.status !== 'Terminating');
const webSvc = (c: Cluster) => c.services.find((s) => s.name === 'web-svc');

export const LABS: Lab[] = [
  {
    id: 1,
    title: 'Namespace isolation',
    short: 'Separate resource lists',
    goal: 'Create a namespace, deploy a Pod into it, and see that every namespace keeps its own list of resources.',
    ask: 'Two pods are both named "web". Why does Kubernetes allow that? And can a pod in development still call a pod in production?',
    takeaway: 'Namespaces give logical separation and scope names. They do not block traffic or access: use RBAC for permissions and NetworkPolicy for network isolation.',
    initial: (now) => {
      const c = base(now, ['development', 'production']);
      c.pods.push(newPod(c, { name: 'web', namespace: 'development', image: 'nginx:1.25', labels: { app: 'web' } }, now - 2 * DAY, true));
      c.pods.push(newPod(c, { name: 'web', namespace: 'production', image: 'nginx:1.25', labels: { app: 'web' } }, now - 2 * DAY, true));
      return c;
    },
    steps: [
      { text: 'Create a namespace called testing', hint: () => 'kubectl create namespace testing', done: (c) => c.namespaces.some((n) => n.name === 'testing') },
      { text: 'Deploy a Pod into testing', hint: () => 'kubectl run web --image=nginx:1.25 -n testing', done: (c) => c.pods.some((p) => p.namespace === 'testing') },
      {
        text: 'Compare the pods in development, production and testing',
        hint: (c) => `kubectl get pods -n ${['development', 'production', 'testing'].find((n) => !c.flags[`viewed:${n}`]) ?? 'testing'}`,
        done: (c) => ['development', 'production', 'testing'].every((n) => c.flags[`viewed:${n}`]),
      },
      { text: 'Run kubectl get pods with no namespace. Why is it empty?', hint: () => 'kubectl get pods', done: (c) => !!c.flags['viewed:default'] },
    ],
  },
  {
    id: 2,
    title: 'Labels & selectors',
    short: 'How Services find Pods',
    goal: 'Change a Pod label and watch the Service endpoints change, even though the Pod name stays the same.',
    ask: 'The Pod name never changed. Why did the Service stop sending traffic to it?',
    takeaway: 'A Service never looks at Pod names. It continuously matches label selectors and routes only to Running pods that match.',
    initial: (now) => {
      const c = base(now, ['development']);
      const mk = (name: string, app: string) => c.pods.push(newPod(c, { name, namespace: 'development', image: `acme/${app}:1.0`, labels: { app } }, now - DAY, true));
      mk('frontend-7d9f8b-x4k2p', 'frontend');
      mk('frontend-7d9f8b-q9w2z', 'frontend');
      mk('backend-5c6b7d-h3m8n', 'backend');
      c.services.push({ name: 'web-svc', namespace: 'development', selector: { app: 'frontend' }, clusterIP: '10.96.40.12', port: 80, createdAt: now - DAY });
      return c;
    },
    steps: [
      { text: 'Look at the Service endpoints', hint: () => 'kubectl get endpoints web-svc -n development', done: (c) => !!c.flags['viewed:endpoints'] },
      {
        text: 'Relabel one frontend Pod to app=backend',
        hint: (c) => `kubectl label pod ${c.pods.find((p) => p.labels.app === 'frontend')?.name ?? 'frontend-7d9f8b-x4k2p'} app=backend --overwrite -n development`,
        done: (c) => !!c.flags.shrunk,
      },
      {
        text: 'Restore two endpoints (relabel it back or change the selector)',
        hint: (c) => `kubectl label pod ${c.pods.find((p) => p.name.startsWith('frontend') && p.labels.app !== 'frontend')?.name ?? 'frontend-7d9f8b-x4k2p'} app=frontend --overwrite -n development`,
        done: (c) => {
          const s = webSvc(c);
          return !!c.flags.shrunk && !!s && endpointsOf(c, s).length >= 2;
        },
      },
    ],
  },
  {
    id: 3,
    title: 'ConfigMaps',
    short: 'Why config looks stale',
    goal: 'Change application configuration and see exactly when the running application picks up the new value.',
    ask: 'The ConfigMap now says v2, but the app still calls v1. Where is the old value stored, and why does a restart fix it?',
    takeaway: 'Environment variables are read once when the container starts, so editing a ConfigMap never restarts pods. Mounted volumes do update, after a short delay.',
    initial: (now) => {
      const c = base(now, ['development']);
      c.configMaps.push({ name: 'app-config', namespace: 'development', data: { API_URL: 'https://api.v1.example.com', LOG_LEVEL: 'info' }, createdAt: now - DAY });
      c.pods.push(newPod(c, { name: 'web-6c8d9f-k2x7p', namespace: 'development', image: 'acme/web:1.0', labels: { app: 'web' }, configMap: 'app-config', owner: 'web' }, now - DAY, true));
      return c;
    },
    steps: [
      {
        text: 'Change API_URL in the ConfigMap to the v2 endpoint',
        hint: () => `kubectl patch configmap app-config -n development -p '{"data":{"API_URL":"https://api.v2.example.com"}}'`,
        done: (c) => c.configMaps[0]?.data.API_URL?.includes('v2') ?? false,
      },
      { text: 'Check the running Pod. It still shows the OLD value', hint: (c) => `kubectl exec ${web(c)?.name ?? 'web'} -n development -- env`, done: (c) => !!c.flags.sawStale },
      {
        text: 'Restart the Pod so it picks up the new value',
        hint: () => 'kubectl rollout restart deployment/web -n development',
        done: (c) => {
          const p = web(c);
          return !!c.flags.sawStale && !!p && p.status === 'Running' && appValue(p) === c.configMaps[0]?.data.API_URL;
        },
      },
      {
        text: 'Bonus: mount as a volume, edit the ConfigMap, wait about 5 s',
        hint: () => 'kubectl apply -f web-volume.yaml -n development',
        done: (c) => !!c.flags.volumeSynced,
        optional: true,
      },
    ],
  },
  {
    id: 4,
    title: 'Secrets',
    short: 'Base64 is not encryption',
    goal: 'Find an exposed credential, fix the leak, rotate the password and prove why Base64 gives no protection.',
    ask: 'Why is it not enough that the Secret object is Base64-encoded?',
    takeaway: 'Base64 is encoding, not encryption. Real protection is RBAC, encryption at rest, an external secret manager, and never logging secrets.',
    initial: (now) => {
      const c = base(now, ['production']);
      c.secrets.push({ name: 'db-credentials', namespace: 'production', data: { username: b64('admin'), password: b64('S3cr3t!') }, exposed: false, createdAt: now - DAY });
      const p = newPod(c, { name: 'api-5f7c8d-p4n2v', namespace: 'production', image: 'acme/api:2.1', labels: { app: 'api' }, secret: 'db-credentials', owner: 'api', logs: ['Server listening on :8080', 'Connected to database'] }, now - DAY, true);
      c.pods.push(p);
      c.ctxNs = 'production';
      return c;
    },
    steps: [
      { text: 'Simulate the bug: the app logs its credentials', hint: () => 'Click "Simulate bug" in the Actions panel', done: (c) => !!c.flags.leaked },
      { text: 'Identify the security problem (answer the quiz)', hint: () => 'Look at the log lines on the api Pod card', done: (c) => !!c.flags.quizPassed },
      {
        text: 'Rotate the exposed password',
        hint: () => `kubectl patch secret db-credentials -p '{"stringData":{"password":"N3wP@ss#2026"}}'`,
        done: (c) => !!c.flags.rotated,
      },
      { text: 'Redeploy the app with logging fixed', hint: () => 'kubectl apply -f api-fixed.yaml', done: (c) => !!c.flags.fixed },
      {
        text: 'Bonus: decode the Secret to prove Base64 is not encryption',
        hint: (c) => `echo ${c.secrets[0]?.data.password ?? ''} | base64 -d`,
        done: (c) => !!c.flags.decoded,
        optional: true,
      },
    ],
  },
];
