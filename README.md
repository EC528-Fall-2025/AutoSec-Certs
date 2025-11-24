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
### 2.1 Primary User Roles:**  
  - Application Teams: Will want to request and retrieve certificates and rely on automated renewal of certificates to avoid outages.  
  - Security Teams: Can manage and monitor certificate issuance, review and approve requests, and monitor activity logs. 

### 2.2 Team Roles (5 Members)  
- **Backend Engineer (Certificates & Vault Integration)** @[Siyuan Jing](https://github.com/ChingSsuyuan)  
  - Responsible for the end-to-end certificate lifecycle: CSR generation, certificate issuance, and secure storage in Vault.  
  - Act as the bridge between Vault and ServiceNow, ensuring seamless integration and data flow between both systems.  

- **Platform Engineer (Cloud & IAM Integration)**  
  - Configure IAM roles, enforce access policies, set up cloud infrastructure.  

- **Frontend / ServiceNow Engineer**  
  - Build ServiceNow request form, integrate approval workflow with backend APIs.  

- **DevOps Engineer (CI/CD & Automation)**  
  - Implement CI/CD pipeline, automated certificate renewal and rotation, deployment automation.  

- **Security Engineer (Audit & Compliance)**  
  - Ensure certificate policies follow org standards.  
  - Monitor issuance and access logs, set up alerting for anomalies.  

---

## 3. Scope and Features of the Project
### In-Scope Features  
- Automated certificate request submission via **ServiceNow form integration**  
- Certificate issuance and secure storage using **Keyfactor + HashiCorp Vault**  
- Application access to certificates and private keys from **Vault**, validated through **IAM Roles**  

### Out-of-Scope Features  
- **Manual certificate management** (outside of the automated workflow)  
-  



---

## 4. Solution Concept

### 4.1 Certificate Lifecycle Pipeline
```mermaid
graph TB
    subgraph USER["USER INPUT"]
        A1[Certificate Information<br/>- Name<br/>- Common/Domain Name<br/>- Organization<br/>- Country<br/>- State<br/>- Locality<br/>- Time to Live]
        A2[AWS Account Information<br/>- AWS Account ID<br/>- AWS IAM Role]
        A3[Client Information<br/>- Email]
    end

    subgraph SNOW["ServiceNow Backend"]
        B1[SNOW Role + Policy]
        B2[Generate User Policy + Role<br/>for Security]
        B3[Assume User Role]
        B4[Generate Certificate]
        
        D1[HashiCorp Vault API]
        
        B6[Register AWS Account<br/>for Authentication]
        B7[Add Vault Access Policy<br/>for User]
    end

    subgraph AWS["AWS EC2 Instance"]
        C1[EC2 Instance<br/>Preconfigured Permissions]
        C2[Authenticate to Vault<br/>via AWS IAM]
        C3[Retrieve Certificate<br/>from User Directory]
    end

    A1 --> B1
    A2 --> B1
    
    B1 --> B2
    B1 --> B6
    
    B2 --> B3
    B3 --> B4
    B4 -->|Store Certificate| D1
    
    B6 --> B7
    B7 -->|Configure Access| D1
    
    SNOW --> C1
    C1 --> C2
    C2 -->|Access| D1
    D1 --> C3

    style USER fill:#1d1c40,stroke:#10739e,stroke-width:2px
    style SNOW fill:#1f1f1f,stroke:#6c8ebf,stroke-width:2px
    style AWS fill:#19103d,stroke:#9673a6,stroke-width:2px
    style D1 fill:#373752,stroke:#ffa500,stroke-width:3px
```
[To find detailed flowchart](https://ec528-fall-2025.github.io/AutoSec-Certs/)
<!-- #### 4.1.1 Backend Responsibilities

- Generate key pair (public/private key)  
- Securely store the private key  
- Create a CSR (Certificate Signing Request)  
- Submit CSR to the Certificate Authority (CA) and receive the certificate  
- Store both the certificate and private key in HashiCorp Vault   -->
### 4.1 Global Architectural Structure of the Project
#### 4.1.1 Certificate Lifecycle

A typical certificate lifecycle consists of the following stages:

1. **Request** – Generate a key pair and submit a Certificate Signing Request (CSR) to a Certificate Authority (CA).  
2. **Issue** – The CA signs the CSR and returns the certificate.  
3. **Application Use** – The application uses the certificate for encryption (TLS/SSL) and authentication.  
4. **Renew** – The certificate must be replaced with a new one before it expires.  
5. **Revoke** – The certificate can be canceled if compromised or no longer needed.

#### 412.2 How This Applies to Our Project

Our project automates the above lifecycle using cloud-native tooling:

- **Request** – User submits a certificate request via **ServiceNow**.  
- **Issue** – Certificate and private key are generated using **ServiceNow**.  
- **Store** – The issued certificate and private key are securely stored in **HashiCorp Vault and ServiceNow**.  
- **Access** – Applications retrieve the certificate and key from Vault, validated via **AWS IAM roles**.  
- **Rotate** – New certificates are automatically issued before expiration and updated in HashiCorp Vault.



### 4.3 Design Implications and Discussion
- Rationale for design decisions  
- How architecture supports scalability, maintainability, and user experience
- Security is the first priority: Private keys are never exposed outside of Vault and are accessed only by authenticated, authorized, entities.

---
### 4.4 Servicenow Implementation Details

#### 4.4.1 Certificate Request Table Schema
- A database table in ServiceNow that stores all certificate request information, a centralized area to track certificate lifecycle from request to issuance 
- Schema
- Serial #: unique identifier linked to the private key 
- Private key - the secret cryptographic key(stored securely) 
- Digital certificate- the actual signed certificate 
- Request status- reflects the current status of the certificate( e.g., pending, approved, issued, rejected) 
- User Credentials- information about who requested the certificate

#### 4.4.2 Service Portal Widgets (User Interface)
- 5 GUI pages for the certificate request workflow
- Restructured the page layouts by adding new HTML code, added new css code to improve visual styling and formatting, no backend logic changes, purely frontend GUI improvements, this provides user-friendly interface for the certificate request process 


#### 4.4.3 VaultAPIClient Script
- Server side javascript class that handles hashicorp vault integration 
- This establishes connection with HashiCorp Vault, handles authentication and API communication
- Updates the certificate request table, writes data back to ServiceNow database after Vault operations 
- This will help document connection/authentication to vault, API calls to Vault endpoints, parsing vault responses,updating SNOW table records 
- ServiceNow workflows calls this script Include, script include makes REST API calls to Vault, receives responses(CSR, private keys, etc), updates the certificate request table with the results which acts as the bridge between ServiceNow and HashiCorp Vault enabling automated certificate management 

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
## Sprint 1: Project Setup & Exploration (9/24 – 10/1)
Scrum Master: Ethan Liang
- Familiarized ourselves with the overall project goals.  
- Developed a clear and detailed project description.  
- Outlined the workflow pipeline for the system.  
- Began experimentation with the ServiceNow Developer Program environment.
- [Video](.assets/video2710124989.mp4)  
- [Slides](https://docs.google.com/presentation/d/1PIYamKVhi-m9k4DFpzvKhFeDj9LKj33SVk3x0rdOPUo/edit?usp=sharing)

## Sprint 2:Workflow & Integration Foundations (10/2 - 10/15)
Scrum Master: Logan Lechuga

Goals: Establish core workflows for certificate lifecycle management, focusing on request, approval, issuance, and storage.
-	Design and implement ServiceNow workflow for certificate requests and approvals.
-	Determine how we will scrape ServiceNow forms for user inputted information and sending that info to backend.
-	Prototype Vault integration for keypair generation, CSR submission, and certificate storage.
-	Document certificate renewal and rotation flow (including CSR regeneration and switchover period).
-	Add admin user persona to capture monitoring, auditing, and operational needs.
-	Update system architecture diagrams to reflect detailed flows, specifically the Hashicorp vault section of our project flow.
-	Begin testing workflow execution end-to-end.
-	[Video](https://youtu.be/Tumgo1tA8KM)
-	[Slides](https://docs.google.com/presentation/d/1KC3eZ6x6bfZiHKM66gRQ6SQdzIA8WmrqmExs-7UX6r0/edit?slide=id.g38c4c02e76d_0_0#slide=id.g38c4c02e76d_0_0)

## Sprint 3: Establishing Communication between Applications (10/16-10/29)
Scrum Master: Siyuan Jing

Goals: Deploy a Hashicorp server to the cloud to enable communication between SNOW and hashicorp
- For this sprint our end goal was to set up an end-to-end demo from certificate request in SNOW to generating a key via Hashicorp.
- GUI for SNOW was updated to make the form more aesthetically pleasing.
- Generated and securely stored user credentials in SNOW database so that they can login and view their request(s) status.
- Deployed a Hashicorp server to the cloud for testing the full pipeline.
- Created a new SNOW script-include that establishes a connection with HashiCorp and updates the SNOW databse with relevant information received from Hashicorp.
- Tested the pipeline to try and find any bugs and to handle edge cases.
- Updated documentation for SNOW and Hashicorp Vault
- [Video](https://drive.google.com/file/d/1VVZDoW-i39UJ_Zsa7D4sPOL4M2X6e3ko/view?usp=sharing)
- [Slides](https://docs.google.com/presentation/d/1C5Q92Lw8--OSz_SLpbPFEDN9oCDwH8GVcfYVub6Qexc/edit?slide=id.g39e0393301b_1_111#slide=id.g39e0393301b_1_111)

## Sprint 4: Pivoting to connection with AWS
Scrum Master: Aarush Duvvuri

Goals: Establish communication between AWS accounts and Hashicorp cloud instance
- For this sprint our end goal was to establish communication between AWS and Hashicorp so that users could view their private keys
  from their AWS accounts (via an EC2 instance)
- GUI for SNOW was updated to prompt users for the AWS account ID.
- Updated the AppRoles in HashiCorp to be user specific.
- Created a VaultRole for AWS accounts that provides them with restricted privileges, in this case to only view their private key.
- Tested the pipleine to look for any discrepancies for the logic between SNOW and hashicorp.
- Worked on authenticating AWS accounts accessing private keys but encountered setbacks.
- [Video](https://www.youtube.com/watch?v=-2qdLIakimQ)
- [Slides](https://docs.google.com/presentation/d/1vAktVZfDj_IIzJEIMDabUJMM8wLFmot6a85i_a7I4LU/edit?slide=id.g3a286d58f66_0_0#slide=id.g3a286d58f66_0_0)

## Sprint 5: AWS Authentication and Certificate Retrieval
- For this sprint we wanted to ensure we were able to retrieve certificate information from a user's AWS account.
- We were able to authenticate individual user accounts from AWS with our application.
- Updated the GUI to provide more details and information the user can digest.
- Implemented the revocation scheme to allow users to revoke certificates if they no longer need them. This calls a revoke API via hashicorp directly from the SNOW backend
- Worked on adding a auto-renewal process in EC2 instances when certificates are updated so that users always have their latest certificate.
- [Video](https://youtu.be/uU5UmmiCaWU)
- [Slides](https://docs.google.com/presentation/d/17eIUfChpgMU3zHvkpkt6drcIUEuHpbUIxZGkd5uSkNA/edit?slide=id.g3a912a14aee_0_0#slide=id.g3a912a14aee_0_0)
---

## Appendix 
- References  
