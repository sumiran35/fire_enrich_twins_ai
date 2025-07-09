import axios from 'axios';

// Ensure the API key is loaded from your .env.local file
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const BASE_URL = 'https://api.apollo.io/v1';

if (!APOLLO_API_KEY) {
    throw new Error('Apollo API key is missing. Please set APOLLO_API_KEY in your environment variables.');
}

// Create a reusable Axios instance for Apollo
const apolloApi = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
    },
});

/**
 * Enriches a company's profile using its domain.
 * @param domain The domain of the company to enrich (e.g., "google.com").
 * @returns The company's data from Apollo or null if not found.
 * @param apiKey ::::: DUH
 */
export const enrichCompanyByDomain = async (domain: string, apiKey: string) => {
    // If the user somehow didn't provide a key, don't make the call.
    if (!apiKey) {
        console.warn('Apollo Client: enrichCompanyByDomain called without an API key.');
        return null;
    }

    try {
        const response = await apolloApi.post('/organizations/enrich', {
            api_key: apiKey, // Use the key passed into the function
            domain: domain,
        });
        return response.data.organization;
    } catch (error: any) {
        console.error(`Apollo Client Error for domain ${domain}:`, error.response?.data || error.message);
        return null;
    }
};