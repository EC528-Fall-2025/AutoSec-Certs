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


# Backend Integration Memo  

This project requires configuration for both **HashiCorp Vault** and **ServiceNow** in order for the backend (`FastAPI`) to work properly.  

---

## 1. HashiCorp Vault Requirements  

- **Vault Address (`VAULT_ADDR`)**  
  - A Vault instance must already be running and accessible at `http://localhost:8200` or another configured URL.  
  - For team use, **Vault should be deployed centrally** (e.g., on one teammate’s machine, a Docker container, or a VM in the cloud).  

- **Vault Token (`VAULT_TOKEN`)**  
  - In development mode: you can use the `root` or `dev` token generated when Vault is initialized.  
  - In production: use proper **authentication methods** (Userpass, OIDC, Kubernetes, AppRole, etc.) to generate an **application-specific token**, not the root token.  

- **PKI Path (`VAULT_PKI_PATH`)**  
  - The **PKI secrets engine** must be enabled at the given path, for example:  
    ```bash
    vault secrets enable -path=pki pki
    ```  
  - A CA and at least one role should be configured (e.g., `vault write pki/roles/my-role ...`) so that the backend can issue certificates.  

---

## 2. ServiceNow Requirements  

- **Instance URL (`SERVICENOW_INSTANCE`)**  
  - Provided by the ServiceNow administrator (e.g., `https://dev12345.service-now.com`).  

- **Account Credentials**  
  - Either username + password (for Basic Auth), or an API Key / OAuth token.  
  - The account must have permissions to **call ServiceNow REST APIs**.  

- **API Permissions**  
  - The account must be granted **read/write permissions** on the target table (e.g., `pm_project` or a custom table like `x_custom_project`).  
  - The ServiceNow administrator must ensure the **Table API** (or custom API) is enabled.  

---

