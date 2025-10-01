
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router
from app.config import settings

# Creating a FastAPI application
app = FastAPI(
    title="Certificate Management API",
    description="Certificate Management Service",
    version="1.0.0"
)

# CORS 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routes
app.include_router(router, prefix="/api")

@app.get("/")
async def root():
    """健康检查"""
    return {
        "service": "Certificate Management API",
        "status": "running",
        "version": "1.0.0"
    }

# Startup Configuration
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True
    )