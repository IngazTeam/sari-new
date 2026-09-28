// Canonical registration shared by appRouter and direct router consumers.
export { testSariRouter } from './routers-test-workspace';
export type TestSariRouter = typeof import('./routers-test-workspace').testSariRouter;
