"""
Central place for talking to CognoDB. Every route imports run_query()
from here rather than opening its own driver, so connection handling
and error behaviour stay consistent across the whole app.
"""
import os
from dotenv import load_dotenv
from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError, ServiceUnavailable

load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "")
NEO4J_USER = os.getenv("NEO4J_USER", "")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")

if not (NEO4J_URI and NEO4J_USER and NEO4J_PASSWORD):
    print(
        "[db] Missing NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD env vars. "
        "Copy .env.example to .env and fill in your CognoDB Cloud credentials."
    )

# A harmless placeholder lets the driver object be constructed even if env
# vars are missing, so the Flask app can still boot. verify_connection()
# and every query will then fail cleanly instead of crashing at startup.
driver = GraphDatabase.driver(
    NEO4J_URI or "bolt://localhost:7687",
    auth=(NEO4J_USER or "", NEO4J_PASSWORD or ""),
)


def run_query(cypher, **params):
    """Runs a parameterized Cypher statement in a managed session and
    always closes the session, even on error."""
    with driver.session() as session:
        result = session.run(cypher, **params)
        return [record.data() for record in result]


def verify_connection():
    try:
        driver.verify_connectivity()
        return True
    except (ServiceUnavailable, Neo4jError, Exception) as err:
        print(f"[db] Could not connect to CognoDB: {err}")
        return False
