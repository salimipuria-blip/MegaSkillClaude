# Third-party notices

This repository ships **third-party skill content** and a small number of
third-party fonts. Nothing here is relicensed by our MIT `LICENSE`.

Generated from `library/github-skills/PROVENANCE.json` (`python3 scripts/audit/skill_provenance.py`). Do not hand-edit: regenerate.

* Indexed skills: **3011** (present locally: 3011, missing: 0)
* Source repositories: **29**
* Total vendored bytes: **118.4 MB**
* Every skill folder has a SHA-256 in `PROVENANCE.json`; every repository is pinned to the upstream commit that was resolved when that file was generated.

## Vendored skill repositories

| # | Repository | License | Skills | Upstream commit |
| --- | --- | --- | ---: | --- |
| 1 | `sickn33/agentic-awesome-skills` | MIT | 1389 | `a66414d271abb5d028d685083c9efd8afeef8021` |
| 2 | `alirezarezvani/claude-skills` | MIT | 302 | `c85b17e1fb621ba760478baaacc4fcb9be225e74` |
| 3 | `affaan-m/ECC` | MIT | 279 | `b38be6a7f6350964d59328b52f0624e1d1d552d1` |
| 4 | `github/awesome-copilot` | MIT | 270 | `8178d1939a203f691067073dcab2a3f1e14072d3` |
| 5 | `K-Dense-AI/scientific-agent-skills` | MIT | 170 | `a25cf9ec00e2745d03f8704acf6f6919694ccd9a` |
| 6 | `browser-act/skills` | MIT | 98 | `11c057b03f92101642cadc9f840564574120d184` |
| 7 | `wshobson/agents` | MIT | 98 | `7e2fb559cf4b824b27f1fec49fe88f7511066d26` |
| 8 | `Orchestra-Research/AI-Research-SKILLs` | MIT | 86 | `773a52944ba4747a18bd4ae9ade53fff041adcbc` |
| 9 | `wanshuiyin/Auto-claude-code-research-in-sleep` | MIT | 72 | `f76ec8d6b77792e2242cca049e08d0cbb7d54e19` |
| 10 | `Jeffallan/claude-skills` | MIT | 55 | `078a25cc5bfd8011459be7b91d004e900c1d02d3` |
| 11 | `SnailSploit/Claude-Red` | MIT | 34 | `a8de813edc9f66f60d44cfe42d47750e89d9930b` |
| 12 | `mattpocock/skills` | MIT | 31 | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` |
| 13 | `phuryn/pm-skills` | MIT | 27 | `2a12295a7717569baa7be181b4cfebe3ca38a6bb` |
| 14 | `addyosmani/agent-skills` | MIT | 23 | `301b02b12bff98e4688e6984af6556802322bbde` |
| 15 | `JimLiu/baoyu-skills` | MIT | 19 | `5792c7dc8d09a28d6969e8970166c5eb090ce6ad` |
| 16 | `obra/superpowers` | MIT | 13 | `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` |
| 17 | `Leonxlnx/taste-skill` | MIT | 11 | `12af471f627f866411b4bd785b19646d3672784c` |
| 18 | `AgriciDaniel/claude-obsidian` | MIT | 10 | `2e545563172f97f02ecaaaab376ceea1246a0583` |
| 19 | `OthmanAdi/planning-with-files` | MIT | 6 | `0fa6c79885e14534074cb7df8535e1efa3dc7149` |
| 20 | `Egonex-AI/Understand-Anything` | MIT | 5 | `4e6d3299017a7432da15957874992837a315c5b4` |
| 21 | `zenstory-ai/oh-story-claudecode` | MIT | 3 | `3fde437b1af762f0b9c383c6e1a309f84d99ba83` |
| 22 | `kepano/obsidian-skills` | MIT | 2 | `3ccff5338ea700537839b21900aa5358a0402c98` |
| 23 | `shanraisshan/claude-code-best-practice` | MIT | 2 | `af996886c3aefc93919494fe1933aa48a6dffb8e` |
| 24 | `DietrichGebert/ponytail` | MIT | 1 | `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` |
| 25 | `cathrynlavery/diagram-design` | MIT | 1 | `f24d98b05e2d7a5e68c2dedfe46e5b7173f50118` |
| 26 | `nidhinjs/prompt-master` | MIT | 1 | `49b3a72469b1e7287d66387004ccfcca90e5968a` |
| 27 | `titanwings/distilly` | MIT | 1 | `0afc45c29c360ba7bc8260f1bb0bf34e9155f4fa` |
| 28 | `tt-a1i/archify` | MIT | 1 | `a4065941f12be7967436261d9934784e381d423c` |
| 29 | `virgiliojr94/book-to-skill` | MIT | 1 | `e7bb659d3261491c8b28793dcb9102fa64a46c22` |

## Repositories without a declared licence

None: every vendored repository declares a licence.

## Fonts (self-hosted, `psk/public/puria/fonts/`)

| Font | Files | Licence |
| --- | --- | --- |
| Inter | `inter-latin-*-normal.woff2` | SIL Open Font License 1.1 (`fonts/LICENSE-Inter-OFL.txt`) |
| IBM Plex Sans Arabic | `ibm-plex-sans-arabic-arabic-*-normal.woff2` | SIL OFL 1.1 (`fonts/LICENSE-IBMPlexSansArabic-OFL.txt`) |
| Bodoni Moda | `bodoni-moda-latin-500-italic.woff2` | SIL OFL 1.1 (`fonts/LICENSE-BodoniModa-OFL.txt`) |

Served from this origin since 2026.11.0; the previous Google Fonts `@import` was removed so the Content-Security-Policy can stay `font-src 'self'`.


## Vendored reference material outside `library/`

* `plugins/mega-skills-router/skills/**` — third-party Azure/Terraform/GitOps skill instructions kept as reference prose. Not executed by any runtime in this repo; several of them show `curl`-to-shell install snippets that **we do not run**.

## npm / build dependencies

The full machine-readable inventory (name, version, purl, integrity hash) is `docs/audit/sbom.cdx.json` (CycloneDX 1.5, 363 packages across `fjcod`, `bison-brand-book`, `hermes`, `lithos`). `psk` has **zero** runtime dependencies.

## Reporting

If you believe content here infringes your licence, open an issue or mail `salimipuria@gmail.com`; the entry will be removed or corrected and the provenance file regenerated.

