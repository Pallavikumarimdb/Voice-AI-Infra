/**
 * Unified Client Data Service.
 * Attempts to fetch live data from /api; falls back automatically to
 * /sample-data/ if the API is unreachable, providing a seamless reviewer experience.
 */

import {
  CallSummaryItem,
  CallDetail,
  PersonaDefinition,
  HumanLabel,
  EvalVariantSummary,
  AuditVerifyResult,
} from './types.ts';
import {
  parseSummaryCsv,
  parseLabelsCsv,
  parsePersonaYaml,
} from './loaders.ts';
import { verifyHashChain } from './hashChain.ts';

export interface ApiResult<T> {
  data: T;
  isSampleData: boolean;
  error?: string;
}

export class ApiClient {
  private sampleDataActive = false;

  public isUsingSampleData(): boolean {
    return this.sampleDataActive;
  }

  /**
   * Fetches list of all calls (live and simulated).
   */
  async getCalls(): Promise<ApiResult<CallSummaryItem[]>> {
    try {
      const res = await fetch('/api/calls');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.sampleDataActive = false;
      return { data, isSampleData: false };
    } catch {
      // Fallback to static sample data
      this.sampleDataActive = true;
      const res = await fetch('/sample-data/calls.json');
      const data = await res.json();
      return { data, isSampleData: true };
    }
  }

  /**
   * Fetches detailed record for a specific call.
   */
  async getCallDetail(id: string): Promise<ApiResult<CallDetail>> {
    try {
      const res = await fetch(`/api/calls/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      this.sampleDataActive = false;

      const hashChain: AuditVerifyResult = verifyHashChain(raw.auditLog || []);
      const personaObj = raw.persona?.content ? parsePersonaYaml(raw.persona.content) : null;

      const detail: CallDetail = {
        id: raw.id,
        source: raw.source || 'sim',
        variant: raw.variant || 'v2_graph',
        personaId: raw.personaId || 'cooperative',
        auditLog: raw.auditLog || [],
        handoff: raw.handoff || null,
        runData: raw.runData || null,
        persona: personaObj,
        hashChain,
      };

      return { data: detail, isSampleData: false };
    } catch {
      // Fallback to sample call details
      this.sampleDataActive = true;
      const res = await fetch(`/sample-data/calls/${encodeURIComponent(id)}.json`);
      if (!res.ok) {
        throw new Error(`Call record '${id}' not found in sample data.`);
      }
      const raw = await res.json();
      const hashChain = verifyHashChain(raw.auditLog || []);
      const personaObj = raw.persona?.content ? parsePersonaYaml(raw.persona.content) : null;

      const detail: CallDetail = {
        id: raw.id,
        source: raw.source || 'sim',
        variant: raw.variant || 'v2_graph',
        personaId: raw.personaId || 'cooperative',
        auditLog: raw.auditLog || [],
        handoff: raw.handoff || null,
        runData: raw.runData || null,
        persona: personaObj,
        hashChain,
      };

      return { data: detail, isSampleData: true };
    }
  }

  /**
   * Fetches evaluation summary tables, markdown report, and Pareto curve.
   */
  async getSummary(): Promise<ApiResult<{ variants: EvalVariantSummary[]; markdown: string; pareto: any }>> {
    try {
      const res = await fetch('/api/results/summary');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      this.sampleDataActive = false;

      const variants = parseSummaryCsv(raw.csv || '');
      return {
        data: {
          variants,
          markdown: raw.markdown || '',
          pareto: raw.pareto || null,
        },
        isSampleData: false,
      };
    } catch {
      this.sampleDataActive = true;
      const res = await fetch('/sample-data/summary.json');
      const raw = await res.json();
      const variants = parseSummaryCsv(raw.csv || '');
      return {
        data: {
          variants,
          markdown: raw.markdown || '',
          pareto: raw.pareto || null,
        },
        isSampleData: true,
      };
    }
  }

  /**
   * Fetches persona definitions.
   */
  async getPersonas(): Promise<ApiResult<PersonaDefinition[]>> {
    try {
      const res = await fetch('/api/personas');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawList: Array<{ id: string; rawYaml: string }> = await res.json();
      this.sampleDataActive = false;

      const personas = rawList.map((item) => parsePersonaYaml(item.rawYaml));
      return { data: personas, isSampleData: false };
    } catch {
      this.sampleDataActive = true;
      const res = await fetch('/sample-data/personas.json');
      const rawList: Array<{ id: string; rawYaml: string }> = await res.json();
      const personas = rawList.map((item) => parsePersonaYaml(item.rawYaml));
      return { data: personas, isSampleData: true };
    }
  }

  /**
   * Fetches human labels from CSV.
   */
  async getLabels(): Promise<ApiResult<HumanLabel[]>> {
    try {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      this.sampleDataActive = false;
      const labels = parseLabelsCsv(raw.csv || '');
      return { data: labels, isSampleData: false };
    } catch {
      this.sampleDataActive = true;
      const res = await fetch('/sample-data/labels.json');
      const raw = await res.json();
      const labels = parseLabelsCsv(raw.csv || '');
      return { data: labels, isSampleData: true };
    }
  }

  /**
   * Appends a new human label row.
   */
  async saveLabel(label: HumanLabel): Promise<{ success: boolean; isSampleData: boolean; error?: string }> {
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(label),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      return { success: true, isSampleData: false };
    } catch (err: any) {
      console.warn('[ApiClient] Failed to save label to backend API, simulating local save:', err.message);
      return { success: true, isSampleData: true };
    }
  }
}

export const apiClient = new ApiClient();
