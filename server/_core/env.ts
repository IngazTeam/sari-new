export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  tapSecretKey: process.env.TAP_SECRET_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  // SMTP2GO Configuration
  smtpHost: process.env.SMTP_HOST ?? "mail.smtp2go.com",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "2525"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "noreply@sary.live",
};
