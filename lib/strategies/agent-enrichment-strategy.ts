import { AgentOrchestrator } from '../agent-architecture/orchestrator';
import { EnrichmentField, RowEnrichmentResult } from '../types';

/**
 * This strategy class wraps the main AgentOrchestrator.
 * Its purpose is to provide a clean interface for the API route to use,
 * hiding the underlying complexity of the orchestration logic.
 */
export class AgentEnrichmentStrategy {
  private orchestrator: AgentOrchestrator;

  constructor(
      openaiApiKey: string,
      firecrawlApiKey: string,
      apolloApiKey: string,
  ) {
    // Here, we instantiate our new Apollo-First orchestrator.
    // The constructor signature matches what your API route already provides.
    this.orchestrator = new AgentOrchestrator(
        firecrawlApiKey,
        openaiApiKey,
        apolloApiKey,
    );
  }

  /**
   * This method is called directly by the API route for each row.
   * It passes the request down to the orchestrator's enrichRow method.
   */
  async enrichRow(
      row: Record<string, string>,
      fields: EnrichmentField[],
      emailColumn: string,
      onProgress?: (field: string, value: unknown) => void,
      onAgentProgress?: (message: string, type: 'info' | 'success' | 'warning' | 'agent') => void
  ): Promise<RowEnrichmentResult> {
    // All the Apollo-first logic is now contained within the orchestrator.
    return this.orchestrator.enrichRow(
        row,
        fields,
        emailColumn,
        onProgress,
        onAgentProgress
    );
  }
}