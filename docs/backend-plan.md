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
# Certificate Management System Architecture

## System Flow Overview

```
┌─────────────────────┐
│ User/ServiceNow     │
│ Portal              │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                              │
│                (Orchestrator & API Gateway)                     │
│                                                                 │
│  ┌─────────────────────┐    ┌──────────────────────────────┐    │
│  │ 1. Receive &        │    │ 2. Auth & Authorization      │    │
│  │    Validate Request │───▶│                              │    │
│  └─────────────────────┘    └──────────────┬───────────────┘    │
│                                            │                    │
│  ┌─────────────────────┐    ┌──────────────▼───────────────┐    │
│  │ 4. Submit CSR       │    │ 3. Generate CSR via          │    │
│  │    to CA            │◀───┤    Vault API                 │    │
│  └──────────┬──────────┘    └──────────────────────────────┘    │
│             │                                                   │
│  ┌──────────▼──────────┐    ┌──────────────────────────────┐    │
│  │ 5. Store certs in   │    │ 6. Cache status &            │    │
│  │    Vault & Persist  │───▶│    quick queries (Redis)     │    │
│  │    metadata to DB   │    └──────────────────────────────┘    │
│  └──────────┬──────────┘                                        │
│             │                                                   │
│  ┌──────────▼──────────┐    ┌──────────────────────────────┐    │
│  │ 7. Audit & Logging  │    │ 8. Notify ServiceNow/        │    │
│  │                     │───▶│    Caller                    │    │
│  └─────────────────────┘    └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐        ┌─────────────────────┐
│ Certificate         │        │ ServiceNow          │
│ Authority           │        │ Notification        │
│ (KeyFactor/AWS ACM) │        │ System              │
└─────────────────────┘        └─────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Storage Layer                               │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ HashiCorp Vault │  │ PostgreSQL/     │  │ Audit Logs      │  │
│  │ (Certificates)  │  │ MongoDB         │  │ Storage         │  │
│  │                 │  │ (Metadata)      │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           ▲
           │
┌─────────────────────┐
│ Applications        │
│ (Fetch certs via    │
│ Vault Agent or      │
│ FastAPI calls)      │
└─────────────────────┘
```
