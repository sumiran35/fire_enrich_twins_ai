import axios from 'axios';

// This is the base URL for the Apollo API
const BASE_URL = 'https://api.apollo.io/v1';

// We create a reusable Axios instance here. This part is safe.
const apolloApi = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
    },
});

/**
 * Enriches a company's profile using its domain.
 * @param domain The domain of the company to enrich.
 * @param apiKey The user-provided Apollo API key passed from the browser.
 * @returns The company's data from Apollo or null if not found.
 */
export const enrichCompanyByDomain = async (domain: string, apiKey: string) => {
    // If the user somehow didn't provide a key, don't make the call.
    if (!apiKey) {
        console.warn('Apollo Client: enrichCompanyByDomain called without an API key.');
        return null;
    }

    try {
        // The API call only happens here, at runtime, using the user's key.
        const response = await apolloApi.post('/organizations/enrich', {
            api_key: apiKey,
            domain: domain,
        });
        return response.data.organization;
    } catch (error: any) {
        console.error(`Apollo Client Error for domain ${domain}:`, error.response?.data || error.message);
        return null;
    }
};
