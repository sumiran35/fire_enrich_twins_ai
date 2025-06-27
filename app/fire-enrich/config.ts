// Check if running in unlimited mode (when cloned/self-hosted)
const isUnlimitedMode = process.env.FIRE_ENRICH_UNLIMITED === 'true' ||
    process.env.NODE_ENV === 'development';

// Configuration for Fire Enrich
export const FIRE_ENRICH_CONFIG = {
  // CSV upload limits
  CSV_LIMITS: {
    MAX_ROWS: Infinity,  // Set to Infinity for unlimited rows
    MAX_COLUMNS: Infinity,  // Set to Infinity for unlimited columns
  },

  // Processing configuration
  PROCESSING: {
    DELAY_BETWEEN_ROWS_MS: 1000,
    MAX_RETRIES: 3,
  },

  // Request limits
  REQUEST_LIMITS: {
    MAX_BODY_SIZE_MB: 50,  // Adjust if needed
    MAX_FIELDS_PER_ENRICHMENT: 50,  // Adjust if needed
  },

  // Feature flags
  FEATURES: {
    IS_UNLIMITED: true,  // Set to true to indicate unlimited mode
  }
} as const;

// Error messages
export const ERROR_MESSAGES = {
  TOO_MANY_ROWS: `CSV file contains too many rows. Maximum allowed: Unlimited`,
  TOO_MANY_COLUMNS: `CSV file contains too many columns. Maximum allowed: Unlimited`,
  UPGRADE_PROMPT: '',  // No upgrade prompt needed for unlimited mode
} as const;
