from fastapi import FastAPI, Depends
from fastapi.security import OAuth2PasswordBearer

app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.get("/api/v1/users")
def get_users():
    return {"users": []}

@app.post("/api/v1/users")
def create_user():
    return {"created": True}

@app.get("/api/v1/users/{user_id}")
def get_user(user_id: int):
    return {"user_id": user_id}

@app.delete("/api/v1/users/{user_id}")
def delete_user(user_id: int, token: str = Depends(oauth2_scheme)):
    return {"deleted": True}

@app.get("/api/v1/payments")
def get_payments(token: str = Depends(oauth2_scheme)):
    return {"payments": []}

@app.post("/api/v1/payments")
def create_payment():
    return {"payment": "created"}

@app.get("/internal/debug")
def debug():
    return {"debug": True}

@app.get("/health")
def health():
    return {"status": "ok"}


