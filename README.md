# KubeLab

An interactive, fully client-side Kubernetes simulator for seminars. Every UI action redraws a visual cluster **and** shows the equivalent `kubectl` command with realistic output in a terminal beside it. You can also type kubectl commands yourself.

No backend, no real cluster, no env vars. About 109 kB first-load JS.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000   (use ?lab=1..4 to jump to a lab)
```

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Vercel -> Add New Project -> import the repo.
3. Click Deploy (framework is auto-detected as Next.js, no settings needed).

## The four labs

| Lab | What participants do |
| --- | --- |
| 1 Namespace isolation | Create a namespace, deploy a Pod, compare resource lists per namespace |
| 2 Labels & selectors | Relabel Pods, watch Service endpoints change |
| 3 ConfigMaps | Edit config, see stale env vars, restart, try a volume mount (5 s sync) |
| 4 Secrets | Leak credentials into logs, identify it, rotate and redeploy, decode Base64 |

Presenter mode enlarges text, hides hints and shows an "Ask the audience" question.
Shortcuts: `Ctrl/Cmd+K` focus terminal, `Tab` complete, up/down history, `?` cheat sheet.

## Supported commands

`get` (ns, pods, svc, endpoints, cm, secrets, nodes, deploy; `-n -A -o wide|yaml -l --show-labels`), `describe` (pod, svc), `create` (namespace, configmap, secret generic, service clusterip), `run`, `label`, `expose`, `delete`, `patch` (configmap, secret, svc), `exec -- env | cat /etc/config/KEY`, `logs`, `rollout restart`, `apply -f api-fixed.yaml | web-volume.yaml | web-env.yaml`, `config set-context --current --namespace=NS`, `echo X | base64 -d`, `help`, `clear`.

## Add a lab

Add one object to `LABS` in `lib/sim/labs.ts` (`title`, `goal`, `initial`, `steps`, `ask`, `takeaway`) and, if it needs custom buttons, a small panel in `components/Controls.tsx`.

## Structure

- `lib/sim/engine.ts` pure cluster logic (derived endpoints, env snapshots, lifecycle ticks)
- `lib/sim/kubectl.ts` tokenizer, parser and command executor
- `lib/sim/labs.ts` lab definitions and checklist rules (they check cluster state, not typed commands)
- `components/` Sidebar, LabPanel, Cluster, Controls, Terminal
