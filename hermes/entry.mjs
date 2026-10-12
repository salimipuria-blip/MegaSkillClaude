// Cloudflare entrypoint; keeping its runtime-only import here lets Node unit tests load worker.mjs.
import { DurableObject } from 'cloudflare:workers';
import { ConversationStore } from './conversation.mjs';
export { default } from './worker.mjs';

export class HermesConversation extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.conversation = new ConversationStore(ctx, env);
  }
  fetch(request) { return this.conversation.fetch(request); }
}
