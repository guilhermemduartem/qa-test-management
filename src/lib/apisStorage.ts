import type { ApisConfig, ApiEnvironment, ApiService } from '../types/apis';
import { supabase } from './supabase';

const KEY = 'qar_apis_config';
const VERSION = 7; // incrementar para forçar reset dos defaults

// Config compartilhada (linha única global na tabela qa_apis_config).
const REMOTE_TABLE = 'qa_apis_config';
const REMOTE_ID = 'global';

const DEFAULT_ENVS: ApiEnvironment[] = [
  { id: 'dev-orion', name: 'Dev Orion K8S', token: '', proxyUrl: '' },
  { id: 'dev-polaris', name: 'Dev Polaris K8S', token: '', proxyUrl: '' },
  { id: 'qa', name: 'QA K8S', token: '', proxyUrl: '' },
  { id: 'tst-azul', name: 'TST Azul', token: '', proxyUrl: '' },
  { id: 'stg', name: 'STG K8S', token: '', proxyUrl: '' },
  { id: 'prod', name: 'Produção', token: '', proxyUrl: '' },
];

const DEFAULT_SERVICES: ApiService[] = [
  {
    id: 'accounting', name: 'Accounting', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://accounting-api.miketec.com.br',
      'dev-orion': 'https://accounting-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://accounting-api.dev.miketec.com.br',
      'qa': 'https://accounting-api.qapolarisk8.miketec.com.br',
      'stg': 'https://accounting-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'activity', name: 'Activity', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://activity-api.miketec.com.br',
      'dev-orion': 'https://activity-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://activity-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://activity-api.qapolarisk8.miketec.com.br',
      'stg': 'https://activity-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://acc-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'air', name: 'Air', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://air-api.miketec.com.br',
      'dev-orion': 'https://air-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://air-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://air-api.qapolarisk8.miketec.com.br',
      'stg': 'https://air-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://air-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'allotment', name: 'Allotment', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://allotment-api.miketec.com.br',
      'dev-orion': 'https://allotment-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://allotment-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://allotment-api.qapolarisk8.miketec.com.br',
      'stg': 'https://allotment-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'backoffice', name: 'Backoffice', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://backoffice-api.miketec.com.br',
      'dev-orion': 'https://backoffice-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://backoffice-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://backoffice-api.qapolarisk8.miketec.com.br',
      'stg': 'https://backoffice-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://bko-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'bank', name: 'Bank', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://bank-api.miketec.com.br',
      'dev-orion': 'https://bank-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://bank-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://bank-api.qapolarisk8.miketec.com.br',
      'stg': 'https://bank-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'bi', name: 'BI', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://bi-api.miketec.com.br',
      'dev-orion': 'https://bi-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://bi-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://bi-api.qapolarisk8.miketec.com.br',
      'stg': 'https://bi-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://bii-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'broker', name: 'Broker', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://broker-api.miketec.com.br',
      'dev-orion': 'https://broker-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://broker-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://broker-api.qapolarisk8.miketec.com.br',
      'stg': 'https://broker-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://brk-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'car', name: 'Car', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://car-api.miketec.com.br',
      'dev-orion': 'https://car-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://car-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://car-api.qapolarisk8.miketec.com.br',
      'stg': 'https://car-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://car-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'conciliation-supplier', name: 'Conciliation Supplier', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://conciliation-supplier-api.miketec.com.br',
      'dev-orion': 'https://conciliation-supplier-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://conciliation-supplier-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://conciliation-supplier-api.qapolarisk8.miketec.com.br',
      'stg': 'https://conciliation-supplier-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'dynamicpackage', name: 'Dynamic Package', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://dynamic-package-api.miketec.com.br',
      'dev-orion': 'https://dynamic-package-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://dynamic-package-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://dynamic-package-api.qapolarisk8.miketec.com.br',
      'stg': 'https://dynamic-package-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://dyp-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'financial', name: 'Financial', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://financial-api.miketec.com.br',
      'dev-orion': 'https://financial-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://financial-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://financial-api.qapolarisk8.miketec.com.br',
      'stg': 'https://financial-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://fin-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'hotel', name: 'Hotel', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://hotel-api.miketec.com.br',
      'dev-orion': 'https://hotel-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://hotel-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://hotel-api.qapolarisk8.miketec.com.br',
      'stg': 'https://hotel-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://htl-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'integration', name: 'Integration', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://integration-api.miketec.com.br',
      'dev-orion': 'https://integration-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://integration-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://integration-api.qapolarisk8.miketec.com.br',
      'stg': 'https://integration-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://int-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'log', name: 'Log', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://log-api.miketec.com.br',
      'dev-orion': 'https://log-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://log-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://log-api.qapolarisk8.miketec.com.br',
      'stg': 'https://log-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'loyalty', name: 'Loyalty', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://loyalty-api.miketec.com.br',
      'dev-orion': 'https://loyalty-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://loyalty-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://loyalty-api.qapolarisk8.miketec.com.br',
      'stg': 'https://loyalty-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://lyl-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'package', name: 'Package', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://package-api.miketec.com.br',
      'dev-orion': 'https://package-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://package-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://package-api.qapolarisk8.miketec.com.br',
      'stg': 'https://package-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://pkg-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'pdf', name: 'PDF', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://pdf-api.miketec.com.br',
      'dev-orion': 'https://pdf-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://pdf-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://pdf-api.qapolarisk8.miketec.com.br',
      'stg': 'https://pdf-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'promocode-backoffice', name: 'Promocode Backoffice', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://promocode-backoffice-api.miketec.com.br',
      'dev-orion': 'https://promocode-backoffice-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://promocode-backoffice-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://promocode-backoffice-api.qapolarisk8.miketec.com.br',
      'stg': 'https://promocode-backoffice-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'promocode-engine', name: 'Promocode Engine', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://promocode-engine-api.miketec.com.br',
      'dev-orion': 'https://promocode-engine-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://promocode-engine-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://promocode-engine-api.qapolarisk8.miketec.com.br',
      'stg': 'https://promocode-engine-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'promocode-sell', name: 'Promocode Sell', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://promocode-sell-api.miketec.com.br',
      'dev-orion': 'https://promocode-sell-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://promocode-sell-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://promocode-sell-api.qapolarisk8.miketec.com.br',
      'stg': 'https://promocode-sell-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'road', name: 'Road', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://road-api.miketec.com.br',
      'dev-orion': 'https://road-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://road-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://road-api.qapolarisk8.miketec.com.br',
      'stg': 'https://road-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://rod-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'sell', name: 'Sell', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://sell-api.miketec.com.br',
      'dev-orion': 'https://sell-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://sell-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://sell-api.qapolarisk8.miketec.com.br',
      'stg': 'https://sell-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://sel-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'sell-change', name: 'Sell Change', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://sell-change-api.miketec.com.br',
      'dev-orion': 'https://sell-change-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://sell-change-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://sell-change-api.qapolarisk8.miketec.com.br',
      'stg': 'https://sell-change-api.stgpolarisk8.miketec.com.br',
    },
  },
  {
    id: 'service', name: 'Service', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://service-api.miketec.com.br',
      'dev-orion': 'https://service-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://service-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://service-api.qapolarisk8.miketec.com.br',
      'stg': 'https://service-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://ser-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'synchronization', name: 'Synchronization', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://synchronization-api.miketec.com.br',
      'dev-orion': 'https://synchronization-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://synchronization-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://synchronization-api.qapolarisk8.miketec.com.br',
      'stg': 'https://synchronization-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://syn-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'ticket', name: 'Ticket', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://ticket-api.miketec.com.br',
      'dev-orion': 'https://ticket-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://ticket-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://ticket-api.qapolarisk8.miketec.com.br',
      'stg': 'https://ticket-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://tkt-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'tour', name: 'Tour', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://tour-api.miketec.com.br',
      'dev-orion': 'https://tour-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://tour-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://tour-api.qapolarisk8.miketec.com.br',
      'stg': 'https://tour-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://tur-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'transfer', name: 'Transfer', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://transfer-api.miketec.com.br',
      'dev-orion': 'https://transfer-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://transfer-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://transfer-api.qapolarisk8.miketec.com.br',
      'stg': 'https://transfer-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://trf-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'travelassistance', name: 'Travel Assistance', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://travel-assistance-api.miketec.com.br',
      'dev-orion': 'https://travel-assistance-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://travel-assistance-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://travel-assistance-api.qapolarisk8.miketec.com.br',
      'stg': 'https://travel-assistance-api.stgpolarisk8.miketec.com.br',
      'tst-azul': 'http://tas-api-tst.aws.voeazul.com.br',
    },
  },
  {
    id: 'workflow', name: 'Workflow', healthPath: '/HealthCheck', method: 'GET', body: '', headers: {},
    envUrls: {
      'prod': 'https://workflow-api.miketec.com.br',
      'dev-orion': 'https://workflow-api.dev-orionk8.miketec.com.br',
      'dev-polaris': 'https://workflow-api.dev-polarisk8.miketec.com.br',
      'qa': 'https://workflow-api.qapolarisk8.miketec.com.br',
      'stg': 'https://workflow-api.stgpolarisk8.miketec.com.br',
    },
  },
];

// Normaliza/preenche campos novos a partir de um objeto bruto (localStorage ou remoto).
function migrateConfig(parsed: Partial<ApisConfig>): ApisConfig {
  return {
    environments: parsed.environments?.length ? parsed.environments : DEFAULT_ENVS,
    services: parsed.services?.length ? parsed.services : DEFAULT_SERVICES,
    hosts: parsed.hosts ?? [],
    endpoints: (parsed.endpoints ?? []).map((ep) => {
      const e = { folder: '', ...ep };
      return {
        ...e,
        headers: e.headers ?? {},
        body: e.body ?? '',
        hostId: e.hostId ?? '',
        path: e.path ?? '',
      };
    }),
    folders: parsed.folders ?? [],
  };
}

export function loadApisConfig(): ApisConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ApisConfig & { _v?: number };
      const v = parsed._v ?? 1;
      const migrated = migrateConfig(parsed);

      if (v < VERSION) {
        // Salva migração com nova versão
        localStorage.setItem(KEY, JSON.stringify({ ...migrated, _v: VERSION }));
      }
      return migrated;
    }
  } catch { /* ignore */ }
  return { environments: DEFAULT_ENVS, services: DEFAULT_SERVICES, hosts: [], endpoints: [], folders: [] };
}

/**
 * Busca a config COMPARTILHADA do Supabase (linha global). Atualiza o cache
 * local (localStorage) quando encontra. Retorna null se não há linha ainda
 * ou se o Supabase está indisponível — nesse caso o chamador continua com o
 * cache local.
 */
export async function fetchSharedApisConfig(): Promise<ApisConfig | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(REMOTE_TABLE)
      .select('config')
      .eq('id', REMOTE_ID)
      .maybeSingle();
    if (error || !data?.config) return null;
    const migrated = migrateConfig(data.config as Partial<ApisConfig>);
    localStorage.setItem(KEY, JSON.stringify({ ...migrated, _v: VERSION }));
    return migrated;
  } catch {
    return null;
  }
}

/**
 * Grava a config COMPARTILHADA no Supabase (upsert na linha global), de modo
 * que todos os usuários enxerguem as mesmas alterações.
 */
export async function pushSharedApisConfig(config: ApisConfig): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase indisponível' };
  try {
    const { error } = await supabase
      .from(REMOTE_TABLE)
      .upsert({ id: REMOTE_ID, config, updated_at: new Date().toISOString() });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export function resetApisConfig(): void {
  localStorage.removeItem(KEY);
}

export function saveApisConfig(config: ApisConfig): void {
  localStorage.setItem(KEY, JSON.stringify({ ...config, _v: VERSION }));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
