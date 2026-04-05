import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from knowledge_base.owasp_docs import build_knowledge_base

_collection = None

def get_collection():
    global _collection
    if _collection is None:
        _collection = build_knowledge_base()
    return _collection


def retrieve_owasp_context(owasp_flags: list) -> str:
    if not owasp_flags:
        return "No OWASP violations detected for this endpoint."
    
    collection = get_collection()
    
    valid_flags = [f for f in owasp_flags if f in ["API2", "API4", "API8", "API9"]]
    
    if not valid_flags:
        return "No matching OWASP documentation found for the provided flags."
    
    results = collection.get(ids=valid_flags)
    
    context_parts = []
    for i, doc in enumerate(results["documents"]):
        flag_id = results["metadatas"][i]["id"]
        flag_title = results["metadatas"][i]["title"]
        context_parts.append(f"[{flag_id} — {flag_title}]\n{doc}")
    
    return "\n\n---\n\n".join(context_parts)


if __name__ == "__main__":
    test_flags = ["API2", "API9"]
    print("Testing retrieval for flags:", test_flags)
    print()
    result = retrieve_owasp_context(test_flags)
    print(result)