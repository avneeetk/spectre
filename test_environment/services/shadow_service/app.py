from fastapi import FastAPI

app = FastAPI()

# This endpoint is NOT in any Nginx or Kong config.
# It is a shadow API — only discoverable via traffic capture.
@app.get("/api/v2/internal/users")
def shadow_endpoint():
    return {"data": "this is a shadow api"}

# This one IS in the Nginx config — should appear in both sources
@app.get("/api/v1/users")
def known_endpoint():
    return {"users": []}

@app.get("/health")
def health():
    return {"status": "ok"}