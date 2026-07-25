#!/usr/bin/env bash
# Port-forward the cluster's dedicated Selenium Grid to localhost:4444 so the
# Selenium suite can drive it via RemoteWebDriver.
#
# The dd-selenium-server Service exposes ONLY the authenticated Java API on
# :8105 — the Grid on :4444 is intentionally never published. kubectl
# port-forward targets the pod directly, so it can still reach :4444 for local,
# authenticated-by-kubeconfig development use.
#
# Usage:
#   npm run selenium:cluster            # forwards 4444 -> pod :4444, stays in foreground
#   SELENIUM_REMOTE_URL=http://localhost:4444 npm run test:selenium   # in another shell
set -euo pipefail

NAMESPACE="${SELENIUM_NAMESPACE:-default}"
DEPLOYMENT="${SELENIUM_DEPLOYMENT:-deploy/dd-selenium-server}"
LOCAL_PORT="${SELENIUM_LOCAL_PORT:-4444}"
GRID_PORT="${SELENIUM_GRID_PORT:-4444}"
# The cluster's kube context. The AWS EC2 runtime cluster is `dd-ec2-admin`.
KUBE_CONTEXT="${SELENIUM_KUBE_CONTEXT:-}"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl not found on PATH. Install it or set your kubeconfig to reach the cluster." >&2
  exit 1
fi

CTX_ARGS=()
if [ -n "${KUBE_CONTEXT}" ]; then
  CTX_ARGS=(--context "${KUBE_CONTEXT}")
fi

# If a local kubectl wrapper prompts for confirmation (no TTY under scripts),
# allow bypass for this read-only port-forward.
export KUBECTL_NO_CONFIRM="${KUBECTL_NO_CONFIRM:-1}"

echo "Forwarding ${DEPLOYMENT} :${GRID_PORT} -> localhost:${LOCAL_PORT}" \
     "(namespace: ${NAMESPACE}${KUBE_CONTEXT:+, context: ${KUBE_CONTEXT}})"
echo "Then, in another shell (against the live deployed site, since the cluster"
echo "browser cannot reach your localhost fixture):"
echo "  SELENIUM_REMOTE_URL=http://localhost:${LOCAL_PORT} \\"
echo "    E2E_BASE_URL=https://quaestor-ledger.github.io npm run test:selenium"
echo
exec kubectl "${CTX_ARGS[@]}" -n "${NAMESPACE}" port-forward "${DEPLOYMENT}" "${LOCAL_PORT}:${GRID_PORT}"
