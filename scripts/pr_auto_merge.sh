#!/usr/bin/env bash
set -euo pipefail

# Create/find an open PR for a branch. Merging is opt-in; --merge (or MERGE=1)
# attempts an immediate merge and will fail if branch protection/checks block it.
# Run from anywhere inside the repository:
#   ./scripts/pr_auto_merge.sh
#   ./scripts/pr_auto_merge.sh feature/security-deploy-docs --merge
#   BRANCH=feature/security-deploy-docs BASE=main ./scripts/pr_auto_merge.sh

usage() {
  cat <<'USAGE'
Usage: scripts/pr_auto_merge.sh [BRANCH] [--merge]

Creates a pull request from BRANCH to BASE, or reuses an existing open PR.
BRANCH defaults to the current local branch. Merging is opt-in.

Environment:
  BRANCH         Source branch (overridden by a positional BRANCH)
  BASE           Target branch (default: main)
  TITLE          PR title
  BODY           PR body
  MERGE=1        Attempt an immediate merge after finding/creating the PR
  MERGE_METHOD   squash, merge, or rebase (default: squash)
USAGE
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

BRANCH="${BRANCH:-}"
BASE="${BASE:-main}"
TITLE="${TITLE:-chore(security): harden CHAM, Hermes, and repository tooling}"
MERGE_REQUESTED=false
POSITIONAL_BRANCH=""

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    --merge)
      MERGE_REQUESTED=true
      ;;
    --*)
      die "Unknown option: $arg (use --help for usage)"
      ;;
    *)
      if [[ -n "$POSITIONAL_BRANCH" ]]; then
        die 'Only one positional branch may be provided.'
      fi
      POSITIONAL_BRANCH="$arg"
      ;;
  esac
done

if [[ -n "$POSITIONAL_BRANCH" ]]; then
  BRANCH="$POSITIONAL_BRANCH"
fi

if ! command -v git >/dev/null 2>&1; then
  die "git is required."
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  die 'Run this script from inside the repository working tree.'
fi
REPO_ROOT=$(git rev-parse --show-toplevel)
cd -- "$REPO_ROOT"

if [[ -z "$BRANCH" ]]; then
  BRANCH=$(git branch --show-current)
fi
if [[ -z "$BRANCH" ]]; then
  die 'Unable to determine the source branch; pass BRANCH explicitly.'
fi
if ! git check-ref-format --branch "$BRANCH" >/dev/null 2>&1; then
  die "Invalid branch name: $BRANCH"
fi
if ! git check-ref-format --branch "$BASE" >/dev/null 2>&1; then
  die "Invalid base branch name: $BASE"
fi
if [[ "$BRANCH" == "$BASE" ]]; then
  die 'Source and base branches must be different.'
fi

case "${MERGE:-false}" in
  1|true|TRUE|yes|YES|on|ON) MERGE_REQUESTED=true ;;
  0|false|FALSE|no|NO|off|OFF|'') ;;
  *) die 'MERGE must be one of: 1, 0, true, false, yes, no, on, off.' ;;
esac
MERGE_METHOD="${MERGE_METHOD:-squash}"
case "$MERGE_METHOD" in
  squash|merge|rebase) ;;
  *) die 'MERGE_METHOD must be squash, merge, or rebase.' ;;
esac

if [[ -z "${BODY:-}" ]]; then
  BODY=$(cat <<'PRBODY'
## Required GitHub secrets
- `TELEGRAM_BOT_TOKEN`
- `GITHUB_ADMIN_USER_IDS`

## Deployment steps
### Vercel
1. Connect the repository to Vercel.
2. For each app, set the Root Directory to its project folder.
3. Add the required environment variables.
4. Trigger deployment from `main` or `staging`.

### Hermes
1. Configure the Cloudflare account.
2. Export the required secrets.
3. Validate with:
   ```sh
   npm run check --prefix hermes
   npm test --prefix hermes
   ```

### Orchestrator
1. Ensure the Supabase environment variables are configured.
2. Run:
   ```sh
   cd orchestrator
   python scripts/audit/check_repository_contract.py
   ```

## Rollback plan
- Revert the last successful deployment.
- Restore a database snapshot if required.
- Re-run smoke tests.

## Scope
- CHAM schema/RLS baseline and review plan; migration is not applied to a live database.
- Hermes booking rate-limit helper with fail-closed behavior when KV is unavailable.
- Orchestrator security and release guidance, plus repository verification tooling.
PRBODY
)
fi

if ! command -v gh >/dev/null 2>&1; then
  die "GitHub CLI (gh) is required. Install it and authenticate with 'gh auth login'."
fi
if ! gh auth status >/dev/null 2>&1; then
  die "gh is not authenticated. Run 'gh auth login' and try again."
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  die "Git remote 'origin' is not configured."
fi

printf 'Branch: %s\n' "$BRANCH"
printf 'Base: %s\n' "$BASE"
printf 'PR title: %s\n' "$TITLE"

# Refresh refs, then push only if the source branch exists locally and is not
# present on origin. A pre-existing remote branch is left untouched.
git fetch --prune origin
REMOTE_REF="refs/heads/$BRANCH"
if ! REMOTE_REFS=$(git ls-remote --heads origin "$REMOTE_REF"); then
  die "Unable to check origin for branch '$BRANCH'."
fi
if [[ -z "$REMOTE_REFS" ]]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    printf "Remote branch origin/%s not found; pushing local branch.\n" "$BRANCH"
    git push --set-upstream origin "$BRANCH"
  else
    die "Branch '$BRANCH' was not found locally or on origin."
  fi
else
  printf 'Remote branch origin/%s exists.\n' "$BRANCH"
fi

lookup_open_pr() {
  gh pr list \
    --head "$BRANCH" \
    --base "$BASE" \
    --state open \
    --json number,url \
    --jq '.[0] | if . == null then empty else [.number, .url] | @tsv end'
}

PR_INFO=$(lookup_open_pr)
PR_NUMBER=""
PR_URL=""
if [[ -n "$PR_INFO" ]]; then
  IFS=$'\t' read -r PR_NUMBER PR_URL <<< "$PR_INFO"
  printf 'Open PR #%s already exists: %s\n' "$PR_NUMBER" "$PR_URL"
else
  printf 'Creating PR from %s to %s...\n' "$BRANCH" "$BASE"
  if PR_URL=$(gh pr create \
    --base "$BASE" \
    --head "$BRANCH" \
    --title "$TITLE" \
    --body "$BODY"); then
    printf 'Created PR: %s\n' "$PR_URL"
    # gh pr create prints the URL (not JSON); query it to get an explicit number.
    PR_INFO=$(gh pr view "$PR_URL" --json number,url --jq '"\(.number)\t\(.url)"')
    IFS=$'\t' read -r PR_NUMBER PR_URL <<< "$PR_INFO"
  else
    CREATE_STATUS=$?
    printf 'PR creation failed; checking whether an open PR was created concurrently.\n' >&2
    PR_INFO=$(lookup_open_pr)
    if [[ -z "$PR_INFO" ]]; then
      exit "$CREATE_STATUS"
    fi
    IFS=$'\t' read -r PR_NUMBER PR_URL <<< "$PR_INFO"
    printf 'Using concurrently created PR #%s: %s\n' "$PR_NUMBER" "$PR_URL"
  fi
fi

if [[ ! "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  die 'Could not determine a valid PR number.'
fi

if [[ "$MERGE_REQUESTED" == true ]]; then
  printf 'Attempting immediate %s merge of PR #%s...\n' "$MERGE_METHOD" "$PR_NUMBER"
  gh pr merge "$PR_NUMBER" "--$MERGE_METHOD"
else
  printf 'PR ready: %s\n' "$PR_URL"
  printf 'Not merging. Re-run with --merge or MERGE=1 to attempt an immediate merge.\n'
fi
