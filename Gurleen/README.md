# SPECTRE - API Threat Classification Platform

---

## 4.2 Stage 2: Classification
Each discovered API endpoint is processed through a **rule-based core engine**. We use deterministic rules (instead of a machine learning model) to ensure explainability and transparency. The classification logic is designed so that developers can easily verify why an API is labeled as "Zombie," "Shadow," "Active," or "Rogue."

### Key Inputs for Classification:
- Presence in a known spec/gateway configuration
- Last recorded traffic timestamp
- Detectable authentication mechanisms
- Route path conflicts

### Classification Logic:
- **Active**: Endpoint is documented, receives recent traffic, and has an assigned owner.
- **Shadow**: Endpoint receives live traffic but is not documented in any gateway or spec.
- **Zombie**: Endpoint has no traffic for 90+ days, lacks an owner, is not in any spec, but is still reachable.
- **Rogue**: Endpoint is suspected to be created to bypass controls (not registered, no auth, mimics/conflicts with known endpoints).

---

## 4.3 Stage 3: OWASP Security Checks
Each classified endpoint undergoes automated security checks based on the **OWASP API Security Top 10 (2023)**. While **API9: Improper Inventory Management** is the primary focus, we also check for vulnerabilities commonly found in forgotten or unmonitored APIs.

### Automated Checks:
   **OWASP ID** | **Risk**                     | **How We Check**                                                                                     | **Why It Matters**                                      |
 |--------------|------------------------------|------------------------------------------------------------------------------------------------------|---------------------------------------------------------|
 | API2         | Broken Authentication        | Check if the endpoint requires an auth header. Send a request with no credentials and observe the response. | Most zombie APIs lack authentication.                  |
 | API4         | No Rate Limiting             | Send repeated requests and check for `429` responses or throttling headers.                        | Forgotten APIs rarely have rate-limiting policies.      |
 | API8         | Security Misconfiguration     | Check TLS presence, CORS headers, allowed HTTP methods, and error response verbosity.               | Old debug configs are common in zombie APIs.           |
 | API9         | Improper Inventory Management| Cross-reference every discovered endpoint against known gateway configs, specs, and owner records.  | Foundational vulnerability SPECTRE addresses.         |

---

## Repository Architecture

```mermaid
graph TD
    A[SPECTRE] --> B[classification/]
    A --> C[owasp/]
    A --> D[tests/]
    A --> E[venv/]

    B --> B1[classifier.py]
    B --> B2[risk.py]
    B --> B3[sensitivity.py]

    C --> C1[checker.py]

    D --> D1[test_classifier.py]
    D --> D2[test_risk.py]
    D --> D3[test_sensitivity.py]

    E --> E1[Dockerfile]
    E --> E2[main.py]
    E --> E3[mock_endpoints.json]
    E --> E4[models.py]
    E --> E5[pipeline.py]
    E --> E6[requirements.txt]