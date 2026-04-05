from fastapi import FastAPI
from api.routes import router

app = FastAPI(
    title="SPECTRE AI Layer",
    description="API threat classification and analysis service",
    version="1.0.0"
)

app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)