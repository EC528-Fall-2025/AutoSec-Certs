# Automated and Secure Digital Certificate Management


## 1. Vision and Goals of the Project
- **Vision Statement:**  
  To build an automated and secure digital certificate management service tailored for highly regulated financial firms, ensuring compliance, reliability, and ease of use.  

- **Key Goals:**  
  - Goal 1  
  - Goal 2  
  - Goal 3  

### Project Priorities (P0–P3)

| Priority | Description | Status |
|----------|-------------|--------|
| **P0 (Must-Have: Core MVP)** | - Automate certificate requests and approvals through ServiceNOW.<br>- Ensure certificates and private keys are securely generated and stored (via Keyfactor + HashiCorp Vault ). | Core requirements |
| **P1 (High Priority: Security & Access Control)** | - Provide controlled access to certificates through HashiCorp Vault with IAM-based validation (using Google Cloud IAM roles ). | Core requirements |
| **P2 (Future: Lifecycle Enhancements)** | - Support seamless certificate lifecycle management, including issuance, renewal, rotation, and revocation (e.g., Cloud Scheduler + Vault APIs). | Future work |
| **P3 (Future: Reliability & Compliance)** | - Minimize operational risks of expired or compromised certificates in production systems.<br>- Implement monitoring, logging, and auditing (Google Cloud Monitoring, ServiceNOW logs, Vault audit logs). | Future work |
---

## 2. Users / Personas of the Project
- **Primary User Roles:**  
  - Role A: key characteristics, needs, expectations  
  - Role B: key characteristics, needs, expectations  
  - Role C: key characteristics, needs, expectations  

### Certificate Lifecycle Pipeline
1. **Request**
   - User submits a certificate request through **ServiceNow**.
   - Request includes required metadata (application, environment, owner, etc.).

   ➡️ **Output:** Certificate Signing Request (CSR) generated.

---

2. **Issuance**
   - CSR is sent to the **Certificate Authority (CA)** (e.g., via **KeyFactor**).
   - The CA signs the certificate and returns the certificate + private key.

   ➡️ **Output:** Valid certificate and private key pair.

---

3. **Storage**
   - The issued certificate and private key are securely stored in **HashiCorp Vault**.
   - Vault enforces **AWS IAM-based access control** for applications and services.

   ➡️ **Output:** Certificate and private key available in Vault with restricted access.

---

4. **Application Use**
   - Applications retrieve certificates and private keys securely from **Vault**.
   - Certificates are used for:
     - **Encryption (TLS/SSL)**  
     - **Authentication (mutual TLS, service identity)**  

   ➡️ **Output:** Application runs with valid TLS certificates.

---

5. **Renewal / Rotation**
   - Before certificate expiration, Vault or KeyFactor initiates **automatic renewal**.
   - New certificate + key pair issued and stored in Vault.
   - Application reloads the new certificate without downtime.

   ➡️ **Output:** Continuous certificate availability without expiry risk.

---

6. **Revocation**
   - If a certificate is compromised or no longer needed:
     - Revoke certificate via **KeyFactor CA**.
     - Update Vault to mark certificate invalid and remove access.

   ➡️ **Output:** Revoked certificate cannot be used in production.

---

### End-to-End Pipeline Flow

```mermaid
flowchart TD
    A[ServiceNow Request] --> B[Generate CSR]
    B --> C[KeyFactor CA Issues Certificate]
    C --> D[Store in HashiCorp Vault]
    D --> E[Application Secure Access via IAM]
    E --> F[Use for TLS/Authentication]
    F --> G[Renewal/Rotation before Expiry]
    F --> H[Revocation if Compromised]

---

## 3. Scope and Features of the Project
- **In-Scope Features:**  
  - Feature A  
  - Feature B  
  - Feature C  

- **Out-of-Scope Features:**  
  - Feature X  
  - Feature Y  



---

## 4. Solution Concept

### 4.1 Global Architectural Structure of the Project
- **High-Level Architecture:**  
  (Insert conceptual diagram or system architecture figure here)  
- **Walkthrough Explanation:**  
  _Describe the main components, their interactions, and overall workflow._  

### 4.2 Design Implications and Discussion
- Rationale for design decisions  
- How architecture supports scalability, maintainability, and user experience  

---

## 5. Acceptance Criteria
- **Minimum Acceptance Criteria:**  
  - [ ] The system shall ...  
  - [ ] The feature shall ...  
- **Stretch Goals:**  
  - [ ] Advanced capability A  
  - [ ] Extended feature B  

---

## 6. Release Planning
- **Release Strategy:**  

- **Planned Iterations:**  
  - Iteration 1: (Features / User Stories)  
  - Iteration 2: (Features / User Stories)  
  - Iteration 3: (Features / User Stories)  

- **Higher-Level Details for the First Iteration:**  
  - User Story 1  
  - User Story 2  
  - User Story 3  

---

## Appendix 
- References  
