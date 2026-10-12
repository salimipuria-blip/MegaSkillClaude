import { createGithubAdminHandler } from './handler.mjs';

Deno.serve(createGithubAdminHandler({ getEnv: (name: string) => Deno.env.get(name) }));
