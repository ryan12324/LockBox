/**
 * Password rotation — site-specific adapters + orchestration agent.
 */

// Adapter types & helpers
export type { RotationStep, RotationPlan, RotationResult, SiteAdapter } from './adapters/base.js';
export { extractDomain, domainMatches } from './adapters/base.js';

// Concrete adapters
export { googleAdapter } from './adapters/google.js';
export { githubAdapter } from './adapters/github.js';
export { amazonAdapter } from './adapters/amazon.js';
export { genericAdapter } from './adapters/generic.js';

// Agent
export type { RotationRequest, RotationAgent } from './agent.js';
export { createRotationAgent } from './agent.js';
