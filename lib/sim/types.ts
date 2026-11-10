export type PodStatus = 'Pending' | 'ContainerCreating' | 'Running' | 'Terminating';

export interface Pod {
  name: string;
  namespace: string;
  image: string;
  labels: Record<string, string>;
  status: PodStatus;
  restarts: number;
  ip: string;
  env: Record<string, string>; // snapshot taken when the container starts
  mounted: Record<string, string>; // files mounted from a ConfigMap volume
  mode: 'env' | 'volume';
  configMap?: string;
  secret?: string;
  owner?: string; // Deployment name, if any
  logs: string[];
  createdAt: number;
  readyAt?: number;
}

export interface Service {
  name: string;
  namespace: string;
  selector: Record<string, string>;
  clusterIP: string;
  port: number;
  createdAt: number;
}

export interface ConfigMap {
  name: string;
  namespace: string;
  data: Record<string, string>;
  createdAt: number;
}

export interface Secret {
  name: string;
  namespace: string;
  data: Record<string, string>; // base64
  exposed: boolean;
  createdAt: number;
}

export interface Cluster {
  namespaces: { name: string; createdAt: number }[];
  pods: Pod[];
  services: Service[];
  configMaps: ConfigMap[];
  secrets: Secret[];
  seq: number;
  ctxNs: string;
  flags: Record<string, boolean>;
  syncAt: number | null;
}

export interface ExecResult {
  cluster: Cluster;
  output: string;
  error?: boolean;
  explain?: string;
  display?: string;
  clear?: boolean;
}
