// Defines the input structure for any agent
export interface AgentInput {
    companyDomain?: string;
    email?: string;
    url?: string; // For agents like Firecrawl
    [key: string]: any; // Allow other properties
}

// Defines the output structure for any agent
export interface AgentOutput {
    source: string; // e.g., "ApolloAgent" or "FirecrawlAgent"
    data: { [key: string]: any } | null;
    error?: string;
}

// Defines the common interface every agent must implement
export interface AgentBase {
    name: string;
    enrich(input: AgentInput): Promise<AgentOutput>;
}