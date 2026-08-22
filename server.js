import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { runQuery, verifyConnection } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Central error responder: if CognoDB is unreachable, tell the client
// clearly instead of leaking a stack trace or hanging.
function dbErrorHandler(res, err) {
  console.error('[api] query failed:', err.message);
  res.status(503).json({
    error: 'database_unreachable',
    message: 'SkillPath could not reach the graph database. Please try again shortly.'
  });
}

app.get('/api/health', async (_req, res) => {
  const ok = await verifyConnection();
  res.status(ok ? 200 : 503).json({ ok });
});

// All skills, for the sidebar list.
app.get('/api/skills', async (_req, res) => {
  try {
    const records = await runQuery(
      `MATCH (s:Skill)
       RETURN s.id AS id, s.name AS name, s.category AS category, s.level AS level
       ORDER BY s.category, s.level, s.name`
    );
    res.json(records.map(r => r.toObject()));
  } catch (err) {
    dbErrorHandler(res, err);
  }
});

// Courses that teach a given skill.
app.get('/api/skills/:id/courses', async (req, res) => {
  try {
    const records = await runQuery(
      `MATCH (c:Course)-[:TEACHES]->(s:Skill {id: $id})
       RETURN c.id AS id, c.name AS name, c.provider AS provider, c.hours AS hours`,
      { id: req.params.id }
    );
    res.json(records.map(r => r.toObject()));
  } catch (err) {
    dbErrorHandler(res, err);
  }
});

// Multi-hop traversal: the full prerequisite trail down to root skills
// (skills with no further prerequisites), ordered furthest-first.
app.get('/api/skills/:id/trail', async (req, res) => {
  try {
    const records = await runQuery(
      `MATCH path = (target:Skill {id: $id})-[:REQUIRES*0..6]->(ancestor:Skill)
       WITH path, ancestor, length(path) AS depth
       ORDER BY depth DESC
       WITH collect({id: ancestor.id, name: ancestor.name, category: ancestor.category,
                      level: ancestor.level, depth: depth}) AS nodes
       RETURN nodes`,
      { id: req.params.id }
    );
    const nodes = records[0]?.get('nodes') ?? [];
    // De-duplicate while keeping the furthest-first (root-first) order.
    const seen = new Set();
    const trail = [];
    for (const n of nodes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        trail.push(n);
      }
    }
    res.json(trail);
  } catch (err) {
    dbErrorHandler(res, err);
  }
});

// Recommendation query: skills you're NOT already known-in, but where
// every direct prerequisite IS already known. This "every neighbour must
// satisfy a condition, across a variable number of neighbours" pattern is
// a natural Cypher subquery and an awkward multi-join + HAVING-COUNT
// exercise in SQL.
app.post('/api/recommend', async (req, res) => {
  const known = Array.isArray(req.body.known) ? req.body.known : [];
  try {
    const records = await runQuery(
      `MATCH (s:Skill)
       WHERE NOT s.id IN $known
         AND NOT EXISTS {
           MATCH (s)-[:REQUIRES]->(req:Skill)
           WHERE NOT req.id IN $known
         }
       RETURN s.id AS id, s.name AS name, s.category AS category, s.level AS level
       ORDER BY s.category, s.name`,
      { known }
    );
    res.json(records.map(r => r.toObject()));
  } catch (err) {
    dbErrorHandler(res, err);
  }
});

// Full graph (nodes + edges) for the visualization panel.
app.get('/api/graph', async (_req, res) => {
  try {
    const nodeRecords = await runQuery(
      `MATCH (s:Skill) RETURN s.id AS id, s.name AS name, 'Skill' AS type, s.category AS category`
    );
    const edgeRecords = await runQuery(
      `MATCH (a:Skill)-[:REQUIRES]->(b:Skill) RETURN a.id AS from, b.id AS to`
    );
    res.json({
      nodes: nodeRecords.map(r => r.toObject()),
      edges: edgeRecords.map(r => r.toObject())
    });
  } catch (err) {
    dbErrorHandler(res, err);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`SkillPath listening on http://localhost:${port}`);
});
