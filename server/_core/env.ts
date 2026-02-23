// Use getters so process.env is read at access time, not at module init
// (the inline .env loader in index.ts runs after ESM imports are evaluated)
export const ENV = {
  get cookieSecret() { return process.env.JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.BUILT_IN_FORGE_API_URL ?? ""; },
  get forgeApiKey() { return process.env.BUILT_IN_FORGE_API_KEY ?? ""; },
  get tapSecretKey() { return process.env.TAP_SECRET_KEY ?? ""; },
  get tapPublicKey() { return process.env.TAP_PUBLIC_KEY ?? ""; },
  get openaiApiKey() { return process.env.OPENAI_API_KEY ?? ""; },
  // SMTP2GO API Configuration
  get smtp2goApiKey() { return process.env.SMTP2GO_API_KEY ?? ""; },
  get smtpFrom() { return process.env.SMTP_FROM ?? "noreply@sary.live"; },
  // Google OAuth Configuration
  get googleClientId() { return process.env.VITE_GOOGLE_CLIENT_ID ?? ""; },
  get googleClientSecret() { return process.env.GOOGLE_CLIENT_SECRET ?? ""; },
};

