#!/bin/bash
set -e   # CLose script on errors

# Start Vault in the background
vault server -dev -dev-root-token-id=root > vault.log 2>&1 &
echo "Starting Vault..."
sleep 5

# Set environment variables
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='root'

echo "Vault is ready. Configuring PKI..."

vault secrets enable pki
vault secrets tune -max-lease-ttl=87600h pki

# Generate root CA
vault write pki/root/generate/internal common_name="Dev Root CA" ttl=87600h 

# Set issuing CRL URLs
vault write pki/config/urls \
    issuing_certificates="$VAULT_ADDR/v1/pki/ca" \
    crl_distribution_points="$VAULT_ADDR/v1/pki/crl"

# Create a role
vault write pki/roles/dev-role \
    allowed_domains="example.local" \
    allow_subdomains=true \
    max_ttl="720h"

# Issue a cert
vault write pki/issue/dev-role \
    common_name="app1.example.local" > app1-cert.json

echo "Certificate and key written to app1-cert.json"
echo "Log written at vault.log"
echo "End the vault dev server with pkill vault"
