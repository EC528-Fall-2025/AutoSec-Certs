## Backend (Python + FastAPI)

The backend service will be built using **FastAPI** to provide REST/gRPC APIs for certificate lifecycle management.  
It acts as the central orchestrator that connects all components:

- **Core Functions**:
  - Handle certificate requests (issue, renew, revoke).  
  - Communicate with HashiCorp Vault for secure storage and retrieval.  
  - Integrate with external Certificate Authorities 
  - Expose APIs to ServiceNow or self-service portals.  
  - Maintain audit logs and request status in the database.

- **Tech Stack**:
  - Python + FastAPI (API server)  
  - PostgreSQL / MongoDB (persistence)  
  - Redis (caching and sessions)  
  - Deployed on Cloud Run with CI/CD automation  

---

## System Architecture Diagram
flowchart LR
    U[User / ServiceNow Portal] --> Start[Receive & validate request]

    subgraph FastAPI["FastAPI Backend<br>(Orchestrator & API Gateway)"]
        direction TB
        Start[Receive & validate request]
        Auth["Auth & Authorization<br>(JWT, IAM, RBAC)"]
        CSR[Generate CSR via Vault API]
        Submit[Submit CSR to CA]
        Vault[HashiCorp Vault]
        Store[Store certs in Vault<br>Persist metadata to DB]
        Cache[Cache status & quick queries<br>(Redis)]
        Audit[Audit & Logging]
        Notify[Notify ServiceNow / Caller]
    end

    Start --> Auth
    Auth --> CSR
    CSR --> Submit
    Submit --> CA[Certificate Authority<br>(KeyFactor / AWS ACM)]
    CSR --> Vault
    Vault --> Store
    Submit --> Store
    Store --> DB[(PostgreSQL / MongoDB)]
    Store --> Audit
    Start --> Cache
    Cache --> Store
    Notify --> SN[ServiceNow]
    Audit --> Logs[(Audit Logs)]
    Apps[Applications] -->|Fetch certs via Vault Agent<br>or call FastAPI| Vault