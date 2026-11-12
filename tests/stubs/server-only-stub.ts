// No-op stand-in for the `server-only` package, aliased in vitest.config.ts.
//
// `server-only`'s real implementation always throws unless resolved through
// the `react-server` export condition, which Next.js's server compiler sets
// but Vitest does not — so any module marked `import "server-only"` throws
// immediately when imported by a test, regardless of test environment
// (node vs jsdom; this is a module-resolution-condition issue, not an
// environment one). This stub only affects the Vitest test run; production
// builds still resolve the real package via Next's own bundler, so the
// actual server/client boundary enforcement is unchanged.
export {};
