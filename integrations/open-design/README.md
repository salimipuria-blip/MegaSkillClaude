# Open Design for Infinity Mega Skill
Upstream: https://github.com/nexu-io/open-design
License: Apache-2.0; check third-party media and model licenses separately.
Pinned revision: 59e4f2ae85de7e7318a5e6bdcf3a34584c4b7582.

## Objective
Use Open Design as an independent design-agent workspace supporting HTML portfolio production, scene prototyping and 3D/motion art direction. The integration is isolated: NO vendor code is copied to the IMS repo and NO API secret is committed.

## Install / start
On a trusted Linux/macOS/WSL2 environment with Docker Compose v2, Git, OpenSSL, Python3 and curl:

    bash integrations/open-design/install.sh

This script clones the exact pinned commit, creates an unprinted random auth token, starts the official Docker deployment and validates HTTP health. The app is bound to the host and must NOT be exposed publicly without a secured proxy, authentication and TLS. For iPhone access, use a private SSH tunnel or authenticated reverse proxy.

## Connect to IMS
- IDE CLI runtimes: OpenCode, Codex and Claude Code are supported upstream; the daemon discovers binaries in its own PATH.
- Models: configure a supported BYOK provider in the Open Design UI or daemon. Arena API compatibility must be verified before enabling; do NOT put tokens in front-end HTML, Git or build logs.
- Design: Figma editable concept https://www.figma.com/design/UZroGnYAvl8KkOrj8uDoQO
- Site source is maintained separately under brands/puria-salimi-portfolio/.

## Proof requirements
A committed setup script is NOT evidence that a daemon is running. Confirm by inspecting `docker compose ps`, an authenticated `/api/health` check, render a real design and export an HTML artifact. The authorized Desktop Commander target was offline and the sandbox used for drafting lacked Docker at authoring time, so runtime execution was not verified.
