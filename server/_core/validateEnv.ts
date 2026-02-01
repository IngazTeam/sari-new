/**
 * Environment Validation Module for Sari
 * Ensures all required environment variables are present before server starts
 */

interface EnvConfig {
    name: string;
    required: boolean;
    description: string;
}

/**
 * List of all environment variables with their requirements
 */
const ENV_CONFIGS: EnvConfig[] = [
    // Critical - Server will not start without these
    { name: 'DATABASE_URL', required: true, description: 'MySQL database connection string' },
    { name: 'JWT_SECRET', required: true, description: 'Secret key for JWT token signing (min 32 chars)' },

    // Important - Core features won't work without these
    { name: 'OPENAI_API_KEY', required: true, description: 'OpenAI API key for AI features' },
    { name: 'GREEN_API_INSTANCE_ID', required: false, description: 'Green API instance ID for WhatsApp' },
    { name: 'GREEN_API_TOKEN', required: false, description: 'Green API token for WhatsApp' },

    // Payment - Required for payment processing
    { name: 'TAP_SECRET_KEY', required: false, description: 'Tap Payments secret key' },
    { name: 'TAP_PUBLIC_KEY', required: false, description: 'Tap Payments public key' },

    // Email - Required for email notifications
    { name: 'SMTP2GO_API_KEY', required: false, description: 'SMTP2GO API key for email delivery' },
    { name: 'SMTP_FROM', required: false, description: 'Default from email address' },

    // Optional
    { name: 'PORT', required: false, description: 'Server port (default: 3000)' },
    { name: 'NODE_ENV', required: false, description: 'Environment mode (development/production)' },
];

/**
 * Validation result
 */
interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validates environment variables
 * @throws Error if required variables are missing
 */
export function validateEnv(): ValidationResult {
    const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
    };

    console.log('[ENV] Validating environment variables...');

    for (const config of ENV_CONFIGS) {
        const value = process.env[config.name];

        if (!value || value.trim() === '') {
            if (config.required) {
                result.valid = false;
                result.errors.push(`❌ Missing required env: ${config.name} - ${config.description}`);
            } else {
                result.warnings.push(`⚠️  Missing optional env: ${config.name} - ${config.description}`);
            }
        } else {
            // Additional validation for specific variables
            if (config.name === 'JWT_SECRET' && value.length < 32) {
                result.valid = false;
                result.errors.push(`❌ JWT_SECRET must be at least 32 characters long (current: ${value.length})`);
            }

            if (config.name === 'DATABASE_URL' && !value.startsWith('mysql://')) {
                result.warnings.push(`⚠️  DATABASE_URL should start with 'mysql://' for MySQL`);
            }
        }
    }

    // Print results
    if (result.warnings.length > 0) {
        console.log('\n[ENV] Warnings:');
        result.warnings.forEach(w => console.log(`  ${w}`));
    }

    if (result.errors.length > 0) {
        console.log('\n[ENV] Errors:');
        result.errors.forEach(e => console.log(`  ${e}`));
    }

    if (result.valid) {
        console.log('[ENV] ✅ Environment validation passed');
    } else {
        console.log('[ENV] ❌ Environment validation failed');

        // In production, throw error to prevent server from starting
        if (process.env.NODE_ENV === 'production') {
            throw new Error(`Missing required environment variables: ${result.errors.join(', ')}`);
        } else {
            console.log('[ENV] ⚠️  Running in development mode - continuing despite errors');
        }
    }

    return result;
}

/**
 * Get a required environment variable
 * @throws Error if variable is not set
 */
export function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === '') {
        throw new Error(`Required environment variable ${name} is not set`);
    }
    return value;
}

/**
 * Get an optional environment variable with fallback
 */
export function getOptionalEnv(name: string, fallback: string = ''): string {
    return process.env[name] || fallback;
}
