## 1. Dashboard Design
### 1.1 Features
- Real-time status updates via **WebSocket push**.  
- Countdown timer showing certificate validity period.  
- Certificate lifecycle visualization:
  - **Submitted**
  - **Approved**
  - **Issued & Stored in Vault**
  - **Auto-renewal in progress**
  - **Revoked** (if applicable)

### 1.2 Mock UI Elements
- **Status Timeline**: "Request Submitted → Approved → Issued → Stored → Active".  
- **Countdown Timer**: `Expires in: 25 days 14h 03m`.  
- **Notifications/Alerts**:  
  - Certificate issued successfully.  
  - Renewal scheduled.  
  - Expiration warning (within 7 days).  
