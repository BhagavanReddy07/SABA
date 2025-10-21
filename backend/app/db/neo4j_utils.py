from app.config import settings
from neo4j import GraphDatabase

driver = GraphDatabase.driver(
    settings.NEO4J_URI,
    auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
)

def save_fact_neo4j(key: str, value: str, user_id: int | None = None):
    if user_id is not None:
        query = "MERGE (u:User {id: $user_id}) MERGE (f:Fact {key: $key}) SET f.value = $value MERGE (u)-[:OWNS]->(f)"
        params = {"user_id": user_id, "key": key, "value": value}
    else:
        query = "MERGE (f:Fact {key: $key}) SET f.value = $value"
        params = {"key": key, "value": value}
    with driver.session() as session:
        session.run(query, **params)

def get_fact_neo4j(key: str, user_id: int | None = None):
    if user_id is not None:
        query = "MATCH (u:User {id: $user_id})-[:OWNS]->(f:Fact {key: $key}) RETURN f.value AS value"
        params = {"user_id": user_id, "key": key}
    else:
        query = "MATCH (f:Fact {key: $key}) RETURN f.value AS value"
        params = {"key": key}
    with driver.session() as session:
        record = session.run(query, **params).single()
        return record["value"] if record else None
def get_facts_neo4j(user_id: int | None = None):
    """Fetch all facts from Neo4j as a list of key-value dicts"""
    if user_id is not None:
        query = "MATCH (u:User {id: $user_id})-[:OWNS]->(f:Fact) RETURN f.key AS key, f.value AS value"
        params = {"user_id": user_id}
    else:
        query = "MATCH (f:Fact) RETURN f.key AS key, f.value AS value"
        params = {}
    with driver.session() as session:
        result = session.run(query, **params)
        return [{"key": record["key"], "value": record["value"]} for record in result]
