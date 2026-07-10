/* ═══════════════════════════════════════════════════════════
   types/azure.ts — Tipos do módulo de integração Azure DevOps.
   ═══════════════════════════════════════════════════════════ */

export interface AzureConfig {
  id: string;
  name: string;
  organization: string;
  project: string;
  createdBy: string | null;
  createdAt: string;
}

export interface AzureUserSettings {
  userId: string;
  azureEmail: string;
  pat: string;
  updatedAt: string;
}

export type AzureFieldType = 'text' | 'textarea' | 'dropdown' | 'integer';

export interface AzureTemplateField {
  referenceName: string;
  label: string;
  type: AzureFieldType;
  options: string[];
  required: boolean;
  defaultValue: string;
}

export interface AzureTemplate {
  id: string;
  name: string;
  azureConfigId: string;
  fields: AzureTemplateField[];
  createdBy: string | null;
  createdAt: string;
}

export interface AzureWorkItemField {
  referenceName: string;
  name: string;
  type: string;
  isCustomField: boolean;
  allowedValues: string[];
}

export interface AzureComment {
  id: number;
  text: string;
  createdBy: { displayName: string; id?: string };
  createdDate: string;
}
