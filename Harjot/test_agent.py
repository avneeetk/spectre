import json
from agent.agent_loop import run_agent

with open("data/mock_apis.json") as f:
    apis = json.load(f)

results = []

print("Running agent loop on all endpoints...\n")

for api in apis:
    print(f"Processing: {api['endpoint']} [{api['state']}]")
    result = run_agent(api)
    results.append(result)
    print(f"  Severity: {result['severity']}")
    print(f"  Action:   {result['action_type']}")
    print(f"  Summary:  {result['risk_summary'][:80]}...")
    print()

with open("data/agent_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("Done. Results saved to data/agent_results.json")