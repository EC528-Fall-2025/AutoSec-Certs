# Example Vault automation script for ServiceNow integration

#!/bin/bash
set -e

# ========================== CONFIG =========================
export VAULT_ADDR="";
export VAULT_NAMESPACE="admin"
export VAULT_TOKEN=$(curl -s --header "X-Vault-Namespace: $VAULT_NAMESPACE" \
    --request POST --data '{}' \
     $VAULT_ADDR/v1/auth/approle/login | jq -r '.auth.client_token' )
# ===========================================================

echo "=========================================="
echo "ServiceNow to Vault Automation Script"
echo "=========================================="

# Check arguments
if [ "$#" -lt 6 ]; then
    echo "Usage: $0 <user_id> <common_name> <organization> <country> <state> <locality> [ttl]"
    echo ""
    echo "Example:"
    echo "  $0 alice app.example.com MyCompany US MA Boston 720h"
    exit 1
fi

USER_ID=$1
COMMON_NAME=$2
ORG=$3
COUNTRY=$4
STATE=$5
LOCALITY=$6
TTL=${7:-"720h"}

# Set Vault environment
export VAULT_ADDR=$VAULT_ADDR
export VAULT_NAMESPACE=$VAULT_NAMESPACE
export VAULT_TOKEN=$VAULT_ADMIN_TOKEN

echo "[*] Processing request for user: $USER_ID"
echo "[*] Common Name: $COMMON_NAME"

# ============================================================
# Step 1: Check if user policy exists, create if not
# ============================================================
echo "[*] Checking if user policy exists..."

if vault policy read ${USER_ID}-policy > /dev/null 2>&1; then
    echo "[+] Policy ${USER_ID}-policy already exists"
else
    echo "[*] Creating policy for user: $USER_ID"
    
    # Create user-specific policy
    cat > ${USER_ID}-policy.hcl <<EOF
# PKI: Allow user to issue certs
path "pki/issue/${USER_ID}-role" {
  capabilities = ["create", "update"]
}

# KV: Allow user to access ONLY their certs
path "secret/data/certs/${USER_ID}/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/certs/${USER_ID}/*" {
  capabilities = ["list", "read", "delete"]
}

# Deny access to other users' certs
path "secret/data/certs/*" {
  capabilities = ["deny"]
}
EOF

    vault policy write ${USER_ID}-policy ${USER_ID}-policy.hcl
    echo "[+] Policy created successfully"
fi

# ============================================================
# Step 2: Check if PKI role exists for user, create if not
# ============================================================
echo "[*] Checking if PKI role exists..."

if vault read pki/roles/${USER_ID}-role > /dev/null 2>&1; then
    echo "[+] PKI role ${USER_ID}-role already exists"
else
    echo "[*] Creating PKI role for user: $USER_ID"
    
    vault write pki/roles/${USER_ID}-role \
        allowed_domains="*" \
        allow_subdomains=true \
        allow_any_name=true \
        enforce_hostnames=false \
        max_ttl="8760h" > /dev/null
    
    echo "[+] PKI role created successfully"
fi

# ============================================================
# Step 3: Create or retrieve user token
# ============================================================
echo "[*] Generating user token..."

USER_TOKEN=$(vault token create \
    -policy="${USER_ID}-policy" \
    -ttl="720h" \
    -display-name="${USER_ID}" \
    -format=json | jq -r '.auth.client_token')

echo "[+] User token generated: ${USER_TOKEN:0:20}..."

# Save token to file for user reference
echo "$USER_TOKEN" > ${USER_ID}-token.txt
echo "[+] Token saved to ${USER_ID}-token.txt"

# ============================================================
# Step 4: Issue certificate using PKI
# ============================================================
echo "[*] Issuing certificate from PKI..."

vault write -format=json pki/issue/${USER_ID}-role \
    common_name="$COMMON_NAME" \
    ttl="$TTL" \
    organization="$ORG" \
    country="$COUNTRY" \
    province="$STATE" \
    locality="$LOCALITY" > cert_data.json

if [ $? -eq 0 ]; then
    echo "[+] Certificate issued successfully"
else
    echo "[!] Failed to issue certificate"
    exit 1
fi

# Extract certificate components
jq -r '.data.certificate' cert_data.json > ${USER_ID}-cert.pem
jq -r '.data.private_key' cert_data.json > ${USER_ID}-key.pem
jq -r '.data.issuing_ca' cert_data.json > ${USER_ID}-ca.pem
SERIAL_NUMBER=$(jq -r '.data.serial_number' cert_data.json)

echo "[+] Certificate files extracted"

# ============================================================
# Step 5: Store certificate in KV at user-specific path
# ============================================================
echo "[*] Storing certificate in Vault KV..."

# Generate unique cert name based on common name and timestamp
CERT_NAME=$(echo "$COMMON_NAME" | tr '.' '-' | tr '[:upper:]' '[:lower:]')-$(date +%s)

vault kv put secret/certs/${USER_ID}/${CERT_NAME} \
    certificate=@${USER_ID}-cert.pem \
    private_key=@${USER_ID}-key.pem \
    ca_cert=@${USER_ID}-ca.pem \
    common_name="$COMMON_NAME" \
    organization="$ORG" \
    country="$COUNTRY" \
    state="$STATE" \
    locality="$LOCALITY" \
    serial_number="$SERIAL_NUMBER" \
    created_at="$(date -Iseconds)" \
    ttl="$TTL" > /dev/null

if [ $? -eq 0 ]; then
    echo "[+] Certificate stored successfully"
else
    echo "[!] Failed to store certificate"
    exit 1
fi

# ============================================================
# Step 6: Verify user can access their cert
# ============================================================
echo "[*] Verifying user access..."

# Switch to user token
export VAULT_TOKEN=$USER_TOKEN

if vault kv get secret/certs/${USER_ID}/${CERT_NAME} > /dev/null 2>&1; then
    echo "[+] User can successfully access their certificate"
else
    echo "[!] Warning: User cannot access certificate"
fi

# Switch back to admin token
export VAULT_TOKEN=$VAULT_ADMIN_TOKEN

# ============================================================
# Summary and Output
# ============================================================
echo ""
echo "=========================================="
echo "SUCCESS! Certificate Request Completed"
echo "=========================================="
echo "User ID:        $USER_ID"
echo "Common Name:    $COMMON_NAME"
echo "Vault Path:     secret/certs/${USER_ID}/${CERT_NAME}"
echo "Serial Number:  $SERIAL_NUMBER"
echo "User Token:     ${USER_TOKEN:0:30}... (saved to ${USER_ID}-token.txt)"
echo ""
echo "Certificate files created:"
echo "  - ${USER_ID}-cert.pem"
echo "  - ${USER_ID}-key.pem"
echo "  - ${USER_ID}-ca.pem"
echo ""
echo "=========================================="
echo "User Retrieval Commands:"
echo "=========================================="
echo "export VAULT_ADDR=$VAULT_ADDR"
echo "export VAULT_NAMESPACE=$VAULT_NAMESPACE"
echo "export VAULT_TOKEN=\$(cat ${USER_ID}-token.txt)"
echo ""
echo "# List all certs for user"
echo "vault kv list secret/certs/${USER_ID}/"
echo ""
echo "# Get this specific cert"
echo "vault kv get secret/certs/${USER_ID}/${CERT_NAME}"
echo ""
echo "# Download certificate"
echo "vault kv get -field=certificate secret/certs/${USER_ID}/${CERT_NAME} > my-cert.pem"
echo "=========================================="

# Cleanup temp files (optional)
# rm -f cert_data.json ${USER_ID}-policy.hcl