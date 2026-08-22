import neo4j from 'neo4j-driver';
import 'dotenv/config';

const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  console.warn(
    '[db] Missing NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD env vars. ' +
    'Copy .env.example to .env and fill in your CognoDB Cloud credentials.'
  );
}

// Fall back to a harmless placeholder URI when env vars are missing so the
// driver can be constructed and the app can still boot; verifyConnection()
// and every query will then fail cleanly with a clear 503 instead of
// crashing the process at startup.
export const driver = neo4j.driver(
  NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(NEO4J_USER || '', NEO4J_PASSWORD || ''),
  { disableLosslessIntegers: true }
);

// Runs a Cypher statement in a managed session and always closes the
// session, even on error. Callers get either the query result or a
// clearly-typed error they can turn into a 503 for the client.
export async function runQuery(cypher, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

export async function verifyConnection() {
  try {
    await driver.verifyConnectivity();
    return true;
  } catch (err) {
    console.error('[db] Could not connect to CognoDB:', err.message);
    return false;
  }
}
