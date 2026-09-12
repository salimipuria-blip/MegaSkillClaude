export function compileSkillMessages(skill, prompt) {
  const skillKey = String(skill?.skill_key ?? '').trim();
  const instructions = String(skill?.instructions ?? '');
  const userPrompt = String(prompt ?? '');
  return [
    {
      role: 'system',
      content: `You are executing the preinstalled skill '${skillKey}'. Follow its instructions faithfully when applicable.\n\nSKILL INSTRUCTIONS:\n${instructions}`,
    },
    { role: 'user', content: userPrompt },
  ];
}

export function selectSkillKey(explicitKey, candidates) {
  const explicit = String(explicitKey ?? '').trim();
  if (explicit) return explicit;
  const first = Array.isArray(candidates) ? candidates[0] : null;
  return String(first?.skill_key ?? '').trim();
}

export function normalizeExecutionOptions(input = {}) {
  const maxTokensRaw = Number(input.max_tokens ?? 1024);
  const temperatureRaw = Number(input.temperature ?? 0.2);
  const max_tokens = Number.isFinite(maxTokensRaw)
    ? Math.max(16, Math.min(maxTokensRaw, 8192))
    : 1024;
  const temperature = Number.isFinite(temperatureRaw)
    ? Math.max(0, Math.min(temperatureRaw, 2))
    : 0.2;
  return {
    task: String(input.task || 'general'),
    max_tokens,
    temperature,
    allow_account_free_tiers: input.allow_account_free_tiers === true,
    allow_trial_credits: input.allow_trial_credits === true,
    allow_slow_community_fallback: input.allow_slow_community_fallback === true,
  };
}
