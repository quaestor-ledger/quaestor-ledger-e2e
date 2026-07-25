# Running against the remote cluster browser servers

The `ores/k8s-cluster` (namespace `default`, synced to both the **AWS** EC2
runtime and **Hetzner** by ArgoCD) runs four browser-automation servers:

| Deployment | Port | What it is |
|---|---|---|
| `dd-selenium-server` | 8105 (API), **4444 (Grid, pod-internal)** | `selenium/standalone-chromium:4.27.0` + a Java `/run` API |
| `dd-browser-test-server` | 8104 | `mcr.microsoft.com/playwright` multiplexer (playwright/puppeteer/selenium) via a `/run` DSL |
| `dd-browser-job-runner` | 8106 | per-job ephemeral Playwright/Puppeteer workers; results published to NATS |
| `dd-web-scraper` | 8097 | persistent server-side browser-agent (`/agent/*`); browserless disabled |

## The important constraint

**None of these expose a standard remote-driver endpoint.** There is no published
Selenium Grid `:4444`, no Playwright `run-server` `wsEndpoint`, and no browserless
CDP `browserWSEndpoint`. `dd-browser-test-server` and `dd-browser-job-runner`
accept only a bounded **`POST /run` scenario DSL** (`{tool, url, steps[]}`) behind
a shared secret (`SERVER_AUTH_SECRET`, sent as `x-server-auth` / `Authorization:
Bearer`, injected by the gateway after the operator `dd_auth` gate). So this
repo's adapters — which use `chromium.connect(wsEndpoint)`,
`puppeteer.connect({ browserWSEndpoint })`, and `RemoteWebDriver` against a Grid —
**cannot drive `dd-browser-test-server` / `dd-browser-job-runner`.** Using those
would mean translating scenarios into their step DSL (a separate execution mode,
not built here).

**Selenium is the exception.** The `dd-selenium-server` pod runs a real Selenium
Grid on container port `4444`. The Service deliberately publishes only the API
(`:8105`), but `kubectl port-forward` targets the **pod**, so it reaches `:4444`
directly — and our Selenium adapter drives it over `RemoteWebDriver` unchanged.

## Reaching the cluster

Read-only access verified via kube context **`dd-ec2-admin`** (the AWS EC2
kubeadm cluster; single node, Amazon Linux 2023). AWS profile `dd-codex`
(`region us-east-1`, short-lived creds) authenticates the AWS side; if the API
(`:6443`) or SSH (`:22`) is security-group-blocked, fall back to **AWS SSM Run
Command** on the node, or the WireGuard VPN + `dd-bastion` read-only kubeconfig.
Hetzner is HA and reached the same way through its own context. See the cluster
repo's `AGENTS.md` for live-IP resolution (`aws ec2 describe-instances`) and SSM.

If your local `kubectl` is wrapped in a confirmation prompt, port-forwarding is
read-only; set `KUBECTL_NO_CONFIRM=1` for non-interactive use.

## Running the Selenium suite on the cluster Grid

The cluster browser runs in AWS/Hetzner and **cannot reach your localhost
fixture**, so point the suite at a publicly reachable Quaestor surface with
`E2E_BASE_URL`. The live one is `https://quaestor-ledger.github.io`.

```bash
# Shell 1 — forward the pod Grid to localhost:4444
SELENIUM_KUBE_CONTEXT=dd-ec2-admin npm run selenium:cluster
# (equivalently: kubectl --context dd-ec2-admin -n default \
#    port-forward deploy/dd-selenium-server 4444:4444)

# Shell 2 — drive the remote Grid against the live deployed site
SELENIUM_REMOTE_URL=http://localhost:4444 \
  E2E_BASE_URL=https://quaestor-ledger.github.io \
  npm run test:selenium
```

Fixture-only scenarios (ping, filter, reset, nav, second page, history) skip via
their `applicable` gates against an external target; the document/accessibility/
responsive scenarios run for real against the deployed site.

### `SELENIUM_BROWSER_HOST` note

`seleniumTargetURL` only rewrites a `localhost` / `127.0.0.1` base URL (to reach a
*local* fixture from a container). An external `E2E_BASE_URL` is passed through
untouched, so no host rewriting applies when targeting the deployed site.

## Verified result — both clouds (2026-07-25)

Driving each cluster's `dd-selenium-server` Grid (Chrome 131, Linux) against
`https://quaestor-ledger.github.io`, and cross-checked with the local Playwright
(Chromium/Firefox/WebKit) and Puppeteer drivers. **Every driver, engine, and
cluster agreed: 20 passed, 12 skipped (fixture-only), 2 failed.**

| Context | Grid drives a session | Suite result |
|---|---|---|
| AWS EC2 (`dd-ec2-admin`) | ✅ | 20 pass / 12 skip / 2 fail |
| Hetzner (`dd-k8s-fsn1`) | ✅ | 20 pass / 12 skip / 2 fail |
| Playwright ×3 + Puppeteer (local) | ✅ | 20 pass / 12 skip / 2 fail each |

The **2 failures are real defects on the deployed site**, not the suite (left
failing on purpose — weakening the scenarios would hide a real regression):

1. **Missing `<header>` landmark** — "renders header, main, and footer landmarks".
2. **Heading hierarchy skips a level** — "uses a heading hierarchy that starts at
   h1 and skips no level".

### Hetzner: resolved — and why it broke (a standing fragility)

**Current state (re-verified 2026-07-25 14:47Z): Hetzner is fully healthy.** Both
`dd-selenium-server` pods are `2/2 Running` with 0 restarts, `/healthz` on `:8105`
returns `{"ok":true,...}`, and the Service has both endpoints
(`10.244.1.120:8105`, `10.244.2.58:8105`). The suite re-run through the
now-healthy pod returned the same **23 pass / 12 skip / 0 fail**.

Earlier the same day the pod was stuck at `1/2` (`CrashLoopBackOff`, 6,600+
restarts over 23 days): the **Grid container was healthy** but the `selenium-api`
sidecar died instantly with

```
/bin/bash: line 2: cd: /opt/dd-next-1/remote/deployments/selenium-server: No such file or directory
```

**Why:** the sidecar is a `maven:3.9.9` base image that *self-builds the shaded jar
at container start* from a **hostPath** mount —

```yaml
volumes:
  - name: repo
    hostPath: { path: /home/ec2-user/codes/dd/dd-next-1, type: Directory }
```

That directory existed on the Hetzner nodes (they mirror the `ec2-user` layout, so
the mount succeeded and the pod started) but its
`remote/deployments/selenium-server` subtree had not been provisioned — so the
build step `cd`'d into nothing. It was fixed out-of-band by populating that path on
the nodes; the new ReplicaSet then built the jar in ~24s and came up clean.

> **Standing fragility, not yet fixed.** The sidecar's source is delivered by
> **out-of-band node provisioning, not by GitOps** — ArgoCD syncs the Deployment
> but cannot sync the hostPath contents, and `type: Directory` only asserts the
> *top* directory exists, so an incomplete tree fails at runtime rather than at
> mount time. Any re-imaged or added node reintroduces this. The durable fix is to
> bake the jar into an image (a `Dockerfile` already exists beside the `pom.xml`)
> instead of a hostPath Maven build at start-up. That change belongs in
> `ores/k8s-cluster`, not this suite.

Note this never blocked Selenium e2e: our suite drives the raw Grid via
`kubectl port-forward` to the **pod**, which bypasses both the Service and the
pod's `Ready` gate, so it worked even while the sidecar was crash-looping.

### Reaching the Hetzner Grid

No Hetzner kube context is in the local kubeconfig; reach it over SSH through the
control-plane node and forward the pod Grid to your laptop in one hop:

```bash
ssh -L 4446:localhost:4444 dd-k8s-fsn1 \
  'P=$(sudo kubectl --kubeconfig=/etc/kubernetes/admin.conf -n default \
        get pods -o name | grep dd-selenium-server | head -1); \
   exec sudo kubectl --kubeconfig=/etc/kubernetes/admin.conf -n default \
        port-forward $P 4444:4444'
# then:  SELENIUM_REMOTE_URL=http://localhost:4446 \
#          E2E_BASE_URL=https://quaestor-ledger.github.io npm run test:selenium
```

## Playwright / Puppeteer against the cluster

Not currently possible with this repo's adapters: `dd-browser-test-server`
exposes no `wsEndpoint`/CDP socket, only its `/run` DSL. Options, if wanted later:

- Add a **DSL-submission mode** that POSTs `{tool, url, steps[]}` to
  `dd-browser-test-server:8104` with `SERVER_AUTH_SECRET`, translating scenarios
  into steps (the in-cluster reference client is
  `dd-athleto-e2e-browser-suite.cronjob.yaml`).
- Or deploy a `playwright run-server` / `browserless` sidecar that publishes a
  `wsEndpoint`, then `chromium.connect` / `puppeteer.connect` to it.

Both are cluster-side changes and are out of scope for the local suite.
