# Certificate Management Backend

This repository contains the backend services for the Certificate Management System.  
Responsibilities are divided between **ServiceNow** and **FastAPI** :

## 🟢 FastAPI Responsibilities 

The FastAPI backend focuses solely on **certificate lifecycle management**:

- **Certificate Operations**
  - Issue, renew, and revoke certificates
  - Track request and certificate metadata
- **CA Integration**
  - Submit CSR to Certificate Authorities (KeyFactor or AWS PCA)
  - Receive issued certificates
- **Vault Integration**
  - Generate keypairs and CSR in Vault
  - Store certificates and private keys securely
  - Provide certificate access to applications via Vault IAM
- **Automatic Renewal & Rotation**
  - Periodically check certificate validity and renew if needed
- **Audit Logging**
  - Track certificate requests, issuance, and revocation events

---

## 🟢 ServiceNow Responsibilities 

ServiceNow now handles the following features:

- **User Management**
  - Registration, authentication, and permission management
- **Request Management**
  - Submit and track certificate requests
- **Approval Workflow**
  - Automated or manual approvals
- **Workflow Engine**
  - Orchestration of business processes
- **User Interface**
  - Self-service portal for end users
- **Reporting & Analytics**
  - Generate reports and track KPIs
- **Permissions & Access Control**
  - Role-based access management for users and applications

---

