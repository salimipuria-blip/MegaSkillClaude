// Vercel mirror of the Netlify proxy: the same handler, no second implementation to drift.
// The handler speaks the web Request/Response API, which is exactly what the edge runtime gives it.
export const config = { runtime: 'edge' };
export { default } from '../netlify/functions/llm.mjs';
