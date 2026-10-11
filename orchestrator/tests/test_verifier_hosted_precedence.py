from pathlib import Path
import re

SRC = Path('supabase/functions/github-llm-verifier/index.ts')


def compact(text: str) -> str:
    return re.sub(r'\s+', '', text)


def test_hosted_endpoint_precedes_self_hosted_classification():
    text = compact(SRC.read_text(encoding='utf-8'))
    hosted = 'if((hostedSignal||baseUrl||modelsUrl||chatUrl)&&openaiCompatible)kind="hosted_inference_api";'
    self_hosted = 'elseif(selfHosted&&(gatewaySignal||openaiCompatible))kind="self_hosted_gateway";'
    assert hosted in text
    assert self_hosted in text
    assert text.index(hosted) < text.index(self_hosted)


def test_selftest_contains_hybrid_hosted_regression_case():
    assert 'hybrid_hosted_precedence' in SRC.read_text(encoding='utf-8')


def test_verify_one_live_baseline_selector_is_explicitly_captured():
    text = compact(SRC.read_text(encoding='utf-8'))
    assert 'repo_id=${Number(body.repo_id)}orfull_name=${String(body.full_name||"")}' in text
