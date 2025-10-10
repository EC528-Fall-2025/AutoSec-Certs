#!/bin/bash
set -e

trap 'Remember to pkill vault when done' EXIT

echo "Usage: $0 <common_name> <organization> <country> <state> <locality> [ttl]"
if [ "$#" -lt 5 ]; then
	echo "Error: Insufficient arguments provided."
	exit 1
fi

COMMON_NAME=$1
ORG=$2
COUNTRY=$3
STATE=$4
LOCALITY=$5
TTL=${6:-"24h"}

# ========================== CONFIG =========================

VAULT_ADDR='https://127.0.0.1:8200'
ROOT_TOKEN='root'
ROLE_NAME='dev-role'
SERVICENOW_POLICY='servicenow-policy'
SERVICENOW_TOKEN_TTL='24h'
KV_PATH='secret/certs/'

# ===========================================================


# Start Vault in dev mode with TLS enabled
echo "[*] Starting Vault dev server with TLS..."
vault server -dev -dev-root-token-id root -dev-tls > vault.log 2>&1 &
sleep 5
VAULT_DIR=$(grep -o '/tmp/vault-tls[0-9]*' vault.log)
echo "[+] Vault TLS directory: $VAULT_DIR"
export VAULT_ADDR=$VAULT_ADDR
export VAULT_CACERT="$VAULT_DIR/vault-ca.pem"
export VAULT_TOKEN=$ROOT_TOKEN
echo "[+] Vault started at $VAULT_ADDR"

# Wait for Vault to be ready
vault status > /dev/null
echo "[+] Vault is up and responding"

# Enable PKI secrets engine and configure it
echo "[*] Enabling PKI secrets engine..."
vault secrets enable pki
vault secrets tune -max-lease-ttl=87600h pki

# Generate root CA
echo "[*] Generating root CA..."
vault write pki/root/generate/internal \
	common_name="Vault Root CA" \
	ttl="87600h" > /dev/null
echo "[+] Root CA generated"

# Configure URLs for issuing certificates and CRL distribution
vault write pki/config/urls \
	issuing_certificates="$VAULT_ADDR/v1/pki/ca" \
	crl_distribution_points="$VAULT_ADDR/v1/pki/crl" > /dev/null
echo "[+] PKI URLs configured"

# Create PKI role for issuing certificates
echo "[*] Creating PKI role '$ROLE_NAME'..."
vault write pki/roles/$ROLE_NAME \
	allowed_domains="*" \
	allow_subdomains=true \
	allow_any_name=true \
	enforce_hostnames=false \
	max_ttl="720h" > /dev/null
echo "[+] PKI role '$ROLE_NAME' created"


# Create a policy to define what the ServiceNow token can do
# vault auth enable token
# Allow SNow to issue certs using the dev-role
echo "[*] Creating policy for ServiceNow..."
cat > servicenow-policy.hcl <<EOF
# Allow issuing certificates using the dev-role
path "pki/issue/*" {
  capabilities = ["create", "update"]
}
# Allow SNow to read and write certs in KV secrets engine
path "secret/data/certs/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
EOF
vault policy write $SERVICENOW_POLICY $SERVICENOW_POLICY.hcl > /dev/null

# Create token associated with servicenow policy
echo "[*] Creating token for ServiceNow with policy '$SERVICENOW_POLICY'..."
SERVICENOW_TOKEN=$(vault token create -policy="$SERVICENOW_POLICY" -ttl=$SERVICENOW_TOKEN_TTL -display-name="servicenow-client" -format=json | jq -r '.auth.client_token')


# Issue a certificate and store it in KV secrets engine
echo "[*] Issuing certificate for $COMMON_NAME..."
# Use the ServiceNow token to issue the cert
vault write -format=json pki/issue/$ROLE_NAME \
    common_name="$COMMON_NAME" \
    ttl="$TTL" \
    organization="$ORG" \
    country="$COUNTRY" \
    province="$STATE" \
    locality="$LOCALITY" > cert_data.json
echo "[+] Certificate issued for $COMMON_NAME"

jq -r '.data.certificate' cert_data.json > client.crt
jq -r '.data.private_key' cert_data.json > client.key
jq -r '.data.issuing_ca' cert_data.json > ca.crt

# Store certs in KV secrets engine
echo "[*] Storing certificate and key in Vault KV at $KV_PATH..."
vault kv put $KV_PATH/client1 \
	certificate=@client.crt \
	private_key=@client.key \
	ca_cert=@ca.crt
echo "Certificate and key stored in Vault at $KV_PATH/$COMMON_NAME"

# Retrieve and display stored certificates
vault kv get -field=certificate $KV_PATH/client1
vault kv get -field=private_key $KV_PATH/client1

echo "Log written at vault.log"
echo "End the vault dev server with pkill vault"

# Should have:
# Runnign Vault dev server with TLS
# SNow token and policy
# PKI setup ready to issue certs
# Sample cert and key stored in KV