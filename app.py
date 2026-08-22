import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from db import run_query, verify_connection

load_dotenv()

app = Flask(__name__, static_folder="public", static_url_path="")
CORS(app)


def db_error(err):
    """Central error responder: if CognoDB is unreachable, tell the
    client clearly instead of leaking a stack trace or hanging."""
    print(f"[api] query failed: {err}")
    return jsonify({
        "error": "database_unreachable",
        "message": "SkillPath could not reach the graph database. Please try again shortly."
    }), 503


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/health")
def health():
    ok = verify_connection()
    return jsonify({"ok": ok}), (200 if ok else 503)


@app.route("/api/skills")
def list_skills():
    try:
        records = run_query(
            """
            MATCH (s:Skill)
            RETURN s.id AS id, s.name AS name, s.category AS category, s.level AS level
            ORDER BY s.category, s.level, s.name
            """
        )
        return jsonify(records)
    except Exception as err:
        return db_error(err)


@app.route("/api/skills/<skill_id>/courses")
def skill_courses(skill_id):
    try:
        records = run_query(
            """
            MATCH (c:Course)-[:TEACHES]->(s:Skill {id: $id})
            RETURN c.id AS id, c.name AS name, c.provider AS provider, c.hours AS hours
            """,
            id=skill_id,
        )
        return jsonify(records)
    except Exception as err:
        return db_error(err)


@app.route("/api/skills/<skill_id>/trail")
def skill_trail(skill_id):
    """Multi-hop traversal: the full prerequisite trail down to root
    skills (skills with no further prerequisites), root-first."""
    try:
        records = run_query(
            """
            MATCH path = (target:Skill {id: $id})-[:REQUIRES*0..6]->(ancestor:Skill)
            WITH ancestor, length(path) AS depth
            ORDER BY depth DESC
            RETURN collect({id: ancestor.id, name: ancestor.name, category: ancestor.category,
                             level: ancestor.level, depth: depth}) AS nodes
            """,
            id=skill_id,
        )
        nodes = records[0]["nodes"] if records else []
        seen = set()
        trail = []
        for n in nodes:
            if n["id"] not in seen:
                seen.add(n["id"])
                trail.append(n)
        return jsonify(trail)
    except Exception as err:
        return db_error(err)


@app.route("/api/recommend", methods=["POST"])
def recommend():
    """Skills you're NOT already known-in, but where every direct
    prerequisite IS already known. A natural Cypher subquery; an awkward
    multi-join + HAVING-COUNT exercise in SQL."""
    body = request.get_json(silent=True) or {}
    known = body.get("known", [])
    if not isinstance(known, list):
        known = []
    try:
        records = run_query(
            """
            MATCH (s:Skill)
            WHERE NOT s.id IN $known
              AND NOT EXISTS {
                MATCH (s)-[:REQUIRES]->(req:Skill)
                WHERE NOT req.id IN $known
              }
            RETURN s.id AS id, s.name AS name, s.category AS category, s.level AS level
            ORDER BY s.category, s.name
            """,
            known=known,
        )
        return jsonify(records)
    except Exception as err:
        return db_error(err)


@app.route("/api/graph")
def graph():
    try:
        nodes = run_query(
            "MATCH (s:Skill) RETURN s.id AS id, s.name AS name, 'Skill' AS type, s.category AS category"
        )
        edges = run_query(
            "MATCH (a:Skill)-[:REQUIRES]->(b:Skill) RETURN a.id AS `from`, b.id AS `to`"
        )
        return jsonify({"nodes": nodes, "edges": edges})
    except Exception as err:
        return db_error(err)


if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    app.run(host="0.0.0.0", port=port, debug=False)
