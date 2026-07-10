export interface ApiEnvironment {
  id: string;
  name: string;
  token: string;
  proxyUrl: string;
}

export interface ApiService {
  id: string;
  name: string;
  healthPath: string;
  method: 'GET' | 'POST';
  body: string;
  headers: Record<string, string>;
  envUrls: Record<string, string>;
}

export interface ApiHost {
  id: string;
  name: string;
  envUrls: Record<string, string>;
}

export interface ApiEndpoint {
  id: string;
  name: string;
  folder?: string;
  hostId: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body: string;
}

export interface ApisConfig {
  environments: ApiEnvironment[];
  services: ApiService[];
  hosts: ApiHost[];
  endpoints: ApiEndpoint[];
  folders: string[];
}

export interface MonitorEntry {
  key: string;
  value: string;
}

export interface CheckResult {
  status: number;
  ok: boolean;
  elapsed: number;
  healthStatus?: string;
  version?: string;
  machineName?: string;
  serverIP?: string;
  datetime?: string;
  monitors?: MonitorEntry[];
  error?: string;
  rawBody?: string;
}
