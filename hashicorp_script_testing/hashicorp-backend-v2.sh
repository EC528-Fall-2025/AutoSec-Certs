#!/bin/bash
set -e

# Enable debug mode if DEBUG env var is set
if [ -n "$DEBUG" ]; then
    set -x
fi

echo "[DEBUG] Starting HCP Vault AWS Integration Script"

# Load credentials from environment file
if [ ! -f "cred.env" ]; then
    echo "[ERROR] cred.env file not found"
    exit 1
fi

source cred.env
echo "[DEBUG] Loaded credentials from cred.env"
echo "[DEBUG] Username: $HASHICORP_USERNAME"

# Validate credentials are loaded
if [ -z "$HASHICORP_USERNAME" ] || [ -z "$HASHICORP_PASSWORD" ]; then
    echo "[ERROR] HASHICORP_USERNAME or HASHICORP_PASSWORD not set in cred.env"
    exit 1
fi

# Validate arguments
if [ "$#" -lt 10 ]; then
    echo "Usage: $0 <owner> <common_name> <organization> <country> <state> <locality> <ttl> <aws_account_id> <aws_iam_role> <certificate_name>"
    echo "Example: $0 test-owner test-common org US CA San-Francisco 24h 123456789012 MyAppRole MyCert"
    echo "[ERROR] Insufficient arguments provided. Expected 10, got $#"
    exit 1
fi

# Parse arguments
OWNER=$1
COMMON_NAME=$2
ORG=$3
COUNTRY=$4
STATE=$5
LOCALITY=$6
TTL=$7
AWS_ACCOUNT_ID=$8
AWS_IAM_ROLE=$9
CERT_NAME=${10}

echo "[DEBUG] Arguments parsed:"
echo "  Owner: $OWNER"
echo "  Common Name: $COMMON_NAME"
echo "  Organization: $ORG"
echo "  Country: $COUNTRY"
echo "  State: $STATE"
echo "  Locality: $LOCALITY"
echo "  TTL: $TTL"
echo "  AWS Account ID: $AWS_ACCOUNT_ID"
echo "  AWS IAM Role: $AWS_IAM_ROLE"

# Configure Vault connection
VAULT_ADDR="https://main-cluster-public-vault-19db5664.417ab8a8.z1.hashicorp.cloud:8200"
VAULT_NAMESPACE="admin"

export VAULT_ADDR
export VAULT_NAMESPACE

echo "[DEBUG] Vault configuration:"
echo "  Address: $VAULT_ADDR"
echo "  Namespace: $VAULT_NAMESPACE"

# Authenticate to Vault and capture token
echo "[*] Authenticating to HCP Vault..."

LOGIN_JSON=$(vault login \
    -method=userpass \
    username="$HASHICORP_USERNAME" \
    password="$HASHICORP_PASSWORD" \
    -format=json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to authenticate to Vault"
    exit 1
fi

export VAULT_TOKEN=$(echo "$LOGIN_JSON" | jq -r '.auth.client_token')

if [ -z "$VAULT_TOKEN" ]; then
    echo "[ERROR] VAULT_TOKEN not received from login"
    exit 1
fi

echo "[SUCCESS] Authenticated to Vault successfully"
echo "[DEBUG] Vault token obtained"

# Generate policy for the AWS account + role
POLICY_NAME="${AWS_ACCOUNT_ID}-${AWS_IAM_ROLE}-policy"
echo "[*] Creating policy: $POLICY_NAME"

cat > policy.hcl <<EOF
# Policy for AWS Account $AWS_ACCOUNT_ID, IAM Role $AWS_IAM_ROLE
# Allows reading certificates stored in the KV secrets engine

path "secret/data/certs/${AWS_ACCOUNT_ID}/${AWS_IAM_ROLE}/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/certs/${AWS_ACCOUNT_ID}/${AWS_IAM_ROLE}/*" {
  capabilities = ["read", "list"]
}
EOF

echo "[DEBUG] Policy file created:"
cat policy.hcl

vault policy write "$POLICY_NAME" policy.hcl

if [ $? -eq 0 ]; then
    echo "[SUCCESS] Policy '$POLICY_NAME' created successfully"
else
    echo "[ERROR] Failed to create policy"
    exit 1
fi

# Bind AWS IAM Role to Vault AWS auth
echo "[*] Binding AWS IAM Role to Vault auth backend..."
PRINCIPAL_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${AWS_IAM_ROLE}"

echo "[DEBUG] AWS Principal ARN: $PRINCIPAL_ARN"

vault write "auth/aws/role/$AWS_IAM_ROLE" \
    auth_type=iam \
    bound_iam_principal_arn="$PRINCIPAL_ARN" \
    resolve_aws_unique_ids=false \
    policies="$POLICY_NAME"

if [ $? -eq 0 ]; then
    echo "[SUCCESS] AWS IAM Role '$AWS_IAM_ROLE' bound successfully"
else
    echo "[ERROR] Failed to bind AWS IAM Role"
    exit 1
fi

# Create PKI role for the user
echo "[*] Creating PKI role '$OWNER'..."
vault write pki/roles/"$OWNER" \
	allowed_domains="*" \
	allow_subdomains=true \
	allow_any_name=true \
	enforce_hostnames=false \
	max_ttl="720h" #> /dev/null
echo "[+] PKI role '$OWNER' created"

# Generate PKI certificate
echo "[*] Generating PKI certificate for owner: $OWNER"
echo "[DEBUG] Certificate parameters:"
echo "  Common Name: $COMMON_NAME"
echo "  Organization: $ORG"
echo "  Country: $COUNTRY"
echo "  State: $STATE"
echo "  Locality: $LOCALITY"
echo "  TTL: $TTL"

vault write -format=json "pki/issue/$OWNER" \
    common_name="$COMMON_NAME" \
    organization="$ORG" \
    country="$COUNTRY" \
    state="$STATE" \
    locality="$LOCALITY" \
    ttl="$TTL" > cert_data.json

if [ $? -eq 0 ]; then
    echo "[SUCCESS] Certificate generated successfully"
else
    echo "[ERROR] Failed to generate certificate"
    exit 1
fi

# Extract certificate files
echo "[*] Extracting certificate data..."

jq -r '.data.certificate' cert_data.json > client.crt
jq -r '.data.private_key' cert_data.json > client.key
jq -r '.data.issuing_ca' cert_data.json > ca.crt

if [ -s client.crt ] && [ -s client.key ] && [ -s ca.crt ]; then
    echo "[SUCCESS] Certificate files extracted:"
    echo "  - client.crt ($(wc -l < client.crt) lines)"
    echo "  - client.key ($(wc -l < client.key) lines)"
    echo "  - ca.crt ($(wc -l < ca.crt) lines)"
else
    echo "[ERROR] Failed to extract certificate data"
    exit 1
fi

# Store certificate in KV (KV v2)
KV_PATH="secret/certs/$AWS_ACCOUNT_ID/$AWS_IAM_ROLE/$CERT_NAME"
echo "[*] Storing certificate in KV path: $KV_PATH"

vault kv put "$KV_PATH" \
    certificate=@client.crt \
    private_key=@client.key \
    ca_cert=@ca.crt

if [ $? -eq 0 ]; then
    echo "[SUCCESS] Certificate stored successfully in Vault"
else
    echo "[ERROR] Failed to store certificate in Vault"
    exit 1
fi

# Verify the secret
echo "[*] Verifying stored secret..."
vault kv get "$KV_PATH" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "[SUCCESS] Secret verified in Vault"
else
    echo "[WARNING] Could not verify secret in Vault"
fi

# Cleanup
echo "[*] Cleaning up temporary files..."
rm -f cert_data.json client.crt client.key ca.crt policy.hcl
echo "[DEBUG] Temporary files removed"

echo ""
echo "=========================================="
echo "[SUCCESS] AWS Integration Complete!"
echo "=========================================="
echo "Summary:"
echo "  - Policy Created: $POLICY_NAME"
echo "  - AWS Role Bound: $AWS_IAM_ROLE"
echo "  - Certificate Generated for: $COMMON_NAME"
echo "  - Secrets Stored at: $KV_PATH"
echo "=========================================="
