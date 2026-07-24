// Serve the bundled fixture site standalone for manual poking:
//   npm run fixture        -> prints the URL and serves until Ctrl-C
import { startFixtureServer } from '../src/fixture-server.mjs';

const port = Number(process.env.PORT || 4321);
const fixture = await startFixtureServer({ host: '127.0.0.1', port });
console.log(`Quaestor fixture site serving at ${fixture.baseURL}`);
console.log('Press Ctrl-C to stop.');

const shutdown = async () => {
  await fixture.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
