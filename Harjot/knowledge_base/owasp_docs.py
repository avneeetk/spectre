owasp_chunks = [
    {
        "id": "API2",
        "title": "Broken Authentication",
        "content": (
            "API2:2023 Broken Authentication occurs when authentication mechanisms are missing, "
            "improperly implemented, or bypassable. An endpoint with no authentication allows "
            "any caller to access it without credentials. "
            "Symptoms: missing Authorization headers, no token validation, endpoint returns 200 "
            "to completely unauthenticated requests. "
            "Common in zombie APIs because authentication middleware is never applied to legacy routes. "
            "Fix: Implement JWT or OAuth2 validation middleware on every single endpoint. "
            "Return HTTP 401 for missing credentials. Return HTTP 403 for invalid or expired tokens. "
            "Never allow an endpoint to process a request before identity is confirmed."
        )
    },
    {
        "id": "API4",
        "title": "Unrestricted Resource Consumption",
        "content": (
            "API4:2023 covers missing rate limiting and resource controls. "
            "An endpoint with no rate limiting can be called unlimited times by any client. "
            "This makes it trivially easy to launch DoS attacks, credential stuffing, or brute force attacks. "
            "Symptoms: no HTTP 429 Too Many Requests responses, no X-RateLimit headers in responses, "
            "no request quotas enforced per IP or per user. "
            "Zombie APIs are especially vulnerable because rate limiting is never configured on abandoned routes. "
            "Fix for Nginx: use limit_req_zone directive. "
            "Fix for FastAPI: use the slowapi library. "
            "Fix for Kong gateway: enable the rate-limiting plugin on the route."
        )
    },
    {
        "id": "API8",
        "title": "Security Misconfiguration",
        "content": (
            "API8:2023 covers misconfigured security settings that expose internal system details. "
            "Includes: missing TLS (endpoint accessible over plain HTTP), "
            "overly permissive CORS headers that allow any origin, "
            "verbose error messages that reveal stack traces or internal file paths, "
            "unnecessary HTTP methods enabled such as DELETE or PUT on read-only endpoints, "
            "and missing security headers like Strict-Transport-Security. "
            "Old debug endpoints and zombie APIs are especially prone to this because they were "
            "built quickly and never hardened for production. "
            "Fix: Enforce HTTPS on all routes. Set strict CORS policy. "
            "Return generic error messages in production, never stack traces. "
            "Disable all HTTP methods not explicitly needed."
        )
    },
    {
        "id": "API9",
        "title": "Improper Inventory Management",
        "content": (
            "API9:2023 is the foundational vulnerability that SPECTRE is built to solve. "
            "It occurs when an organization does not maintain a complete, accurate, and up-to-date "
            "inventory of all API endpoints. "
            "Shadow APIs are undocumented endpoints that receive live traffic but appear nowhere "
            "in the official API gateway or OpenAPI specification. "
            "Zombie APIs are endpoints that were once legitimate but have been abandoned — "
            "no traffic in 90+ days, no assigned owner, not in any current spec, but still reachable. "
            "Rogue APIs are endpoints created deliberately to bypass official governance. "
            "API9 is a gateway vulnerability: an endpoint that nobody tracks will also have "
            "broken authentication, no rate limiting, and outdated TLS — because nobody is maintaining it. "
            "Fix: Maintain a live API registry. Require gateway registration for all new endpoints. "
            "Run automated discovery scans regularly. Decommission all endpoints with no owner or traffic."
        )
    }
]

import chromadb

def build_knowledge_base():
    client = chromadb.Client()
    
    try:
        client.delete_collection("owasp")
    except:
        pass
    
    collection = client.create_collection("owasp")
    
    for chunk in owasp_chunks:
        collection.add(
            documents=[chunk["content"]],
            metadatas=[{"id": chunk["id"], "title": chunk["title"]}],
            ids=[chunk["id"]]
        )
    
    print(f"Knowledge base loaded. {len(owasp_chunks)} OWASP entries stored.")
    return collection


def get_collection():
    client = chromadb.Client()
    
    try:
        return client.get_collection("owasp")
    except:
        return build_knowledge_base()


if __name__ == "__main__":
    build_knowledge_base()