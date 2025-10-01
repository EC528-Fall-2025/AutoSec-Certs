# Configuration and Environment Variables

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # FastAPI
    PORT: int = 8000
    API_KEY: str = "secret-key-123"
    
    VAULT_ADDR: str = "http://localhost:8200"
    VAULT_TOKEN: str = "dev-token"
    VAULT_PKI_PATH: str = "pki"
    
    SERVICENOW_INSTANCE: str = "https://dev12345.service-now.com"
    SERVICENOW_USERNAME: str = "admin"
    SERVICENOW_PASSWORD: str = "password"
    SERVICENOW_TABLE: str = "x_custom_cert_requests"
    
    class Config:
        env_file = ".env"

settings = Settings()