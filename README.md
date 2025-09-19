# Automated and Secure Digital Certificate Management


## 1. Vision and Goals of the Project
### 1.1 Vision Statement
  To build an automated, secure, and scalable digital certificate management system tailored for highly regulated financial firms, ensuring compliance, reliability, and ease of use. This system will streamline the entire PKI lifecycle from certificate creation to renewal.

### 1.2 Key Goals  
  - Automated: Minimize need for manual input/direction to speed up delivery.  
  - Secure: Ensure private keys are securely generated, stored, and accessed only by those with authorization.
  - Intuitive: Users should be able to request and manage certificates via a user-friendly ServiceNow form.

### 1.3 Project Priorities (P0–P3)

| Priority | Description | Status |
|----------|-------------|--------|
| **P0 (Must-Have: Core MVP)** | - Automate certificate requests and approvals through ServiceNOW.<br>- Ensure certificates and private keys are securely generated and stored (via Keyfactor + HashiCorp Vault ). | Core requirements |
| **P1 (High Priority: Security & Access Control)** | - Provide controlled access to certificates through HashiCorp Vault with IAM-based validation (using Google Cloud IAM roles ). | Core requirements |
| **P2 (Future: Lifecycle Enhancements)** | - Support seamless certificate lifecycle management, including issuance, renewal, rotation, and revocation (e.g., Cloud Scheduler + Vault APIs). | Future work |
| **P3 (Future: Reliability & Compliance)** | - Minimize operational risks of expired or compromised certificates in production systems.<br>- Implement monitoring, logging, and auditing (Google Cloud Monitoring, ServiceNOW logs, Vault audit logs). | Future work |
---

## 2. Users / Personas of the Project
- **Primary User Roles:**  
  - Application Teams: Will want to request and retrieve certificates and rely on automated renewal of certificates to avoid outages.  
  - Security Teams: Can manage and monitor certificate issuance, review and approve requests, and monitor activity logs. 


---

## 3. Scope and Features of the Project
### In-Scope Features  
- Automated certificate request submission via **ServiceNow form integration**  
- Certificate issuance and secure storage using **Keyfactor + HashiCorp Vault**  
- Application access to certificates and private keys from **Vault**, validated through **IAM Roles**  

### Out-of-Scope Features  
-  
-  



---

## 4. Solution Concept

### 4.1 Certificate Lifecycle Pipeline
```mermaid
flowchart TD
    A[User Request via ServiceNow] --> B[Generate CSR]
    B --> C[KeyFactor CA Issues Certificate]
    C --> D[Store in HashiCorp Vault]
    D --> E[Application Access via Vault IAM]
    E --> F[Use for TLS and Authentication]
    F --> G[Automatic Renewal / Rotation]
    F --> H[Revocation if Compromised]
```

### 4.2 Global Architectural Structure of the Project
#### Certificate Lifecycle

A typical certificate lifecycle consists of the following stages:

1. **Request** – Generate a key pair and submit a Certificate Signing Request (CSR) to a Certificate Authority (CA).  
2. **Issue** – The CA signs the CSR and returns the certificate.  
3. **Application Use** – The application uses the certificate for encryption (TLS/SSL) and authentication.  
4. **Renew** – The certificate must be replaced with a new one before it expires.  
5. **Revoke** – The certificate can be canceled if compromised or no longer needed.

#### How This Applies to Our Project

Our project automates the above lifecycle using cloud-native tooling:

- **Request** – User submits a certificate request via **ServiceNow**.  
- **Issue** – Certificate and private key are generated using **Keyfactor** (or AWS PCA).  
- **Store** – The issued certificate and private key are securely stored in **HashiCorp Vault**.  
- **Access** – Applications retrieve the certificate and key from Vault, validated via **AWS IAM roles**.  
- **Rotate** – New certificates are automatically issued before expiration and updated in Vault.



### 4.3 Design Implications and Discussion
- Rationale for design decisions  
- How architecture supports scalability, maintainability, and user experience
- Security is the first priority: Private keys are never exposed outside of Vault and are accessed only by authenticated, authorized, entities.

---

## 5. Acceptance Criteria
- **Minimum Acceptance Criteria:**  
  - [ ] Users can submit cerficiate requests with ServiceNow
  - [ ] Certificates and private keys successfully issued by certificate authorities
  - [ ] Certiifcate and private keys are stored securely in Vault
  - [ ] Only authorized applications can access certificates from Vault
  - [ ] Activity logs are maintained so suspicious events can be spotted
- **Stretch Goals:**  
  - [ ] Automated renewal/rotation of certificates to avoid downtime

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
