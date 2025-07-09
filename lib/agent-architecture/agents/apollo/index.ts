import { z } from 'zod';
import { AgentBase, AgentInput, AgentOutput } from '../../agent-base';
import { enrichCompanyByDomain } from '../../../apollo-client';

// Define the Zod schema for the data you expect from Apollo's company endpoint
export const ApolloCompanySchema = z.object({
    name: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    linkedin_url: z.string().url().optional().nullable(),
    website_url: z.string().url().optional().nullable(),
    estimated_num_employees: z.number().optional().nullable(),
    keywords: z.array(z.string()).optional().nullable(),
    // Add other fields from Apollo as needed
}).passthrough(); // Allows other fields to pass through without error

export class ApolloAgent implements AgentBase {
    name: string = "ApolloAgent";

    async enrich(input: AgentInput): Promise<AgentOutput> {
        // This agent specifically requires a company domain
        if (!input.companyDomain) {
            return { source: this.name, data: null, error: "Input must include a companyDomain." };
        }

        const apolloData = await enrichCompanyByDomain(input.companyDomain);

        if (!apolloData) {
            return { source: this.name, data: null, error: "No data found in Apollo." };
        }

        // Validate the received data against our Zod schema
        const validationResult = ApolloCompanySchema.safeParse(apolloData);

        if (!validationResult.success) {
            console.error(`${this.name}: Zod validation failed`, validationResult.error);
            return { source: this.name, data: null, error: "Invalid data structure from Apollo." };
        }

        return { source: this.name, data: validationResult.data };
    }
}