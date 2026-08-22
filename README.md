# SkillPath

A small web app for tracing the exact route of prerequisites behind any skill — and figuring out what to learn next — backed by **CognoDB**, a managed graph database, via the official Neo4j driver.

## The use case

Learning paths in tech (and most other fields) are not a flat list — they're a dependency graph. "Transformers & LLMs" quietly depends on NLP basics, which depends on deep learning basics, which depends on supervised learning, which depends on ML basics, which depends on NumPy and probability, which depend on Python basics and statistics basics. SkillPath lets a learner:

1. Pick any skill and see its **full prerequisite trail**, in order, down to the foundational skills it ultimately rests on.
2. See which **courses teach** each stop along that trail.
3. Check off the skills they already have, and get a list of exactly what they're **ready to learn next** — skills where every direct prerequisite is already checked off.

### Why a graph database?

The interesting questions here are entirely about *relationships between skills*, not about rows: "what's the full chain behind X", and "given what I already know, what's newly unlocked". Both require walking a variable number of hops through the same relationship type.

In a relational schema, the first question needs a recursive CTE, and the second needs an anti-join across a self-referencing table where the number of prerequisite rows per skill varies — doable, but it turns into a wall of SQL that's hard to read and easy to get subtly wrong. In Cypher, both are short, declarative pattern matches: `(skill)-[:REQUIRES*1..6]->(ancestor)` for the trail, and a `NOT EXISTS { }` subquery for "every prerequisite is already known". The graph model isn't just a nicer syntax here — it's the natural shape of the data: skills genuinely form a directed graph, not a table.

## Data model

```
(:Skill {id, name, category, level})
(:Course {id, name, provider, hours})

(:Skill)-[:REQUIRES]->(:Skill)     // a skill's direct prerequisite
(:Course)-[:TEACHES]->(:Skill)     // a course teaches a skill
```

- `Skill.level` is a rough 1–5 depth indicator (1 = no prerequisites).
- `REQUIRES` points from a skill to its *direct* prerequisite — chains of these form the trail.
- A single course can teach several skills; a skill can be taught by several courses.

```
 python-basics ──▶ oop-python ──▶ flask-basics ──▶ api-design
       │                                              ▲
       ▼                                          sql-basics
   numpy, pandas
       │
       ▼
  ml-basics ──▶ supervised-learning ──▶ deep-learning-basics ──▶ nlp-basics ──▶ transformers
       ▲                                        ▲
  probability                            model-evaluation
       ▲
  stats-basics
```
(arrows show `REQUIRES`, pointing from a skill to its prerequisite)

Seed data: 20 skills across 6 categories and 10 courses — enough to demonstrate multi-hop chains up to 6 levels deep, comfortably inside the free-tier instance limits.

## Setup

### 1. Create your CognoDB Cloud instance
1. Sign up at [console.cognodb.com/signup](https://console.cognodb.com/signup) (free tier, no card needed).
2. Create a free (c0) instance and pick a region.
3. Copy the generated `bolt+s://...` URI and the password for user `cognodb` — the password is shown once.

### 2. Configure the app
```bash
cp .env.example .env
# then edit .env with your NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD
```

### 3. Install, seed, run
```bash
npm install
npm run seed    # loads the skill/course graph into your CognoDB instance
npm start        # serves the app at http://localhost:3000
```

Visit `http://localhost:3000`. The status dot in the top bar shows whether the app can currently reach CognoDB.

## The main queries

All queries are parameterized through the official `neo4j-driver` package — no string-concatenated Cypher anywhere in the codebase (`server.js`, `seed.js`).

**Multi-hop prerequisite trail** (`GET /api/skills/:id/trail`) — walks 1 to 6 `REQUIRES` hops from the target skill out to its root prerequisites:
```cypher
MATCH path = (target:Skill {id: $id})-[:REQUIRES*0..6]->(ancestor:Skill)
WITH ancestor, length(path) AS depth
ORDER BY depth DESC
...
```

**"What can I learn next"** (`POST /api/recommend`) — the query a relational schema would find awkward: for every skill *not* already known, none of its direct prerequisites may be missing from the known set. This is a universal-quantification check over a variable-length neighbor list:
```cypher
MATCH (s:Skill)
WHERE NOT s.id IN $known
  AND NOT EXISTS {
    MATCH (s)-[:REQUIRES]->(req:Skill)
    WHERE NOT req.id IN $known
  }
RETURN s.id, s.name, s.category, s.level
```

## Engineering notes

- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` are read from environment variables only (`.env`, git-ignored) — never committed.
- `db.js` centralizes the driver and session handling; every route closes its session in a `finally` block.
- If CognoDB is unreachable, every API route returns a `503` with a clear JSON error instead of crashing or hanging — the UI surfaces this as a status dot and inline error banners rather than a blank screen.
- The skill list and skill-detail views have explicit loading (skeletons), empty (no results / no courses), and error states.

## Project structure

```
skillpath/
├── server.js         # Express app + API routes
├── db.js             # CognoDB driver + query helper
├── seed.js           # Loads skill/course graph data
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .env.example
└── README.md
```

## Screenshots

_Add screenshots of the running app here before submitting: the skill directory, a selected skill's trail, and the "plan your next move" recommendation panel._

## Demo

_Add your hosted deployment link and a short screen recording link here before submitting._
