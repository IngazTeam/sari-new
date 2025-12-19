export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  tapSecretKey: process.env.TAP_SECRET_KEY ?? "",
  tapPublicKey: process.env.TAP_PUBLIC_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  // SMTP2GO API Configuration
  smtp2goApiKey: process.env.SMTP2GO_API_KEY ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "noreply@sary.live",
  // Google OAuth Configuration
  googleClientId: process.env.VITE_GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
};

