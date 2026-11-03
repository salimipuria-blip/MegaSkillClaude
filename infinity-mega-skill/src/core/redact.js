// One redaction rulebook for everything that can print text a user will read: provider errors in the
// browser, and the proxy's error bodies on the server. A key that reaches a toast also reaches the
// screenshot someone posts in a bug report.
export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/\b(sk|rk|gsk|csk|xai|pplx|hf|ghp|glpat)[-_][A-Za-z0-9_-]{6,}/gi, '$1-***')
    .replace(/\bAIza[0-9A-Za-z_-]{10,}/g, 'AIza***')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, '$1 ***')
    .replace(/([?&](?:key|api_key|apiKey|token|access_token)=)[^&\s"']+/gi, '$1***')
    .replace(/("(?:api_?key|key|token|authorization)"\s*:\s*")[^"]*(")/gi, '$1***$2');
}
