# Documentation

- [architecture.md](architecture.md) — how the shared-scenario / adapter /
  harness design fits together, and the fixture-vs-real-surface target model.
- [writing-scenarios.md](writing-scenarios.md) — how to add a scenario or a new
  adapter capability; the driver-agnostic rules and the `evaluate` expression
  convention.
- [cross-browser-and-drivers.md](cross-browser-and-drivers.md) — the driver ×
  engine matrix and the specific normalisations that keep scenarios from
  branching on the driver.
- [remote-grids.md](remote-grids.md) — running the drivers against the remote
  browser servers (Selenium Grid / Playwright server / browserless) deployed in
  the `k8s-cluster` on AWS and Hetzner.
- [coverage.md](coverage.md) — the full scenario catalogue, the driver-specific
  tests, and the known gaps.

The adapter contract itself lives next to the code in
[`../src/drivers/interface.md`](../src/drivers/interface.md).
