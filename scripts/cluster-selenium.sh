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

if ! command -v kubectl >/dev/null 2>&1; then
  echo "kubectl not found on PATH. Install it or set your kubeconfig to reach the cluster." >&2
  exit 1
fi

echo "Forwarding ${DEPLOYMENT} :${GRID_PORT} -> localhost:${LOCAL_PORT} (namespace: ${NAMESPACE})"
echo "Then, in another shell:"
echo "  SELENIUM_REMOTE_URL=http://localhost:${LOCAL_PORT} npm run test:selenium"
echo
exec kubectl -n "${NAMESPACE}" port-forward "${DEPLOYMENT}" "${LOCAL_PORT}:${GRID_PORT}"
