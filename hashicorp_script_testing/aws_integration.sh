#!/bin/bash
set -e

trap "echo 'Remember to pkill vault when done'" EXIT

if [ "$#" -lt 7 ]; then
	echo "Usage: $0 <owner (full) name> <common_name> <organization> <country> <state> <locality> <aws-iam-role-arn> [ttl]"
	echo "Example: ./aws_integration.sh test-owner-6 test-common-name-6 test-org-6 test-country-6 test-state-6 test-locality-6 test-aws-arn-6"
	echo "Error: Insufficient arguments provided."
	exit 1
fi

OWNER=$1
COMMON_NAME=$2
ORG=$3
COUNTRY=$4
STATE=$5
LOCALITY=$6
AWS_IAM_ROLE_ARN=$7
TTL=${8:-"24h"}

# ========================== CONFIG =========================
echo "[*] Configuring..."
export VAULT_ADDR="https://test-cluster-public-vault-fc6745fb.83f0d48a.z1.hashicorp.cloud:8200"
export VAULT_NAMESPACE="admin"
export ROLE_ID="e5579ef6-fe73-4a11-b39c-7086748c3ddb"
#SECRET_ID="6cfa9df4-cfa5-5cfb-d8e8-3478c181debc"
export SECRET_ID="6d7b4226-8aab-3be2-945d-0545f936bc1c"
# Get from the user
IAM_ROLE=$AWS_IAM_ROLE_ARN

# ===========================================================
	
#vault write auth/approle/login role_id=e5579ef6-fe73-4a11-b39c-7086748c3ddb secret_id=6d7b4226-8aab-3be2-945d-0545f936bc1c
# vault write auth/approle/login role_id=$ROLE_ID secret_id=$SECRET_ID

# Save the returned token
VAULT_TOKEN=$(vault write -field=token auth/approle/login role_id=$ROLE_ID secret_id=$SECRET_ID)
vault login $VAULT_TOKEN
echo "[+] Logged in to Vault with AppRole."


# Check if the provided user name already has an AppRole + entity
# If not, continue
# If yes, skip to #===========================

# Create a policy for the user's AppRole so they can issue certs for their own name only, and to store them in their own KV path
echo "[*] Creating policy for $OWNER..."
cat > policy.hcl <<EOF
path "pki/issue/$OWNER" {
	capabilities = ["create", "update"]
}
path "secret/data/certs/$OWNER/*" {
	capabilities = ["create", "read", "update", "delete", "list"]
}
path "secret/metadata/certs/$OWNER/*" {
	capabilities = ["list"]
}
path "identity/entity/name/$OWNER" {
	capabilities = ["read", "update"]
}
EOF
vault policy write "$OWNER-combined-policy" policy.hcl
echo "[+] Policy '$OWNER-combined-policy' created"
# Verify policy
#vault policy read "$OWNER-combined-policy"


# Create Vault entity
echo "[*] Creating entity for $OWNER..."
vault write identity/entity name="$OWNER" policies="$OWNER-combined-policy" #namespace="$VAULT_NAMESPACE"
echo "[+] Entity for $OWNER created"
# Verify entity
#vault read identity/entity/name/"$OWNER" #namespace="$VAULT_NAMESPACE"

# Create AppRole
echo "[*] Creating AppRole for $OWNER..."
vault write auth/approle/role/"$OWNER-role" \
	token_policies="$OWNER-combined-policy" \
	token_ttl="$TTL" \
	token_max_ttl="72h" \
	bind_secret_id=true \
	#secret_id_ttl="24h" \
	#secret_id_num_uses=1 \
	token_explicit_max_ttl="4h" \
	#namespace="$VAULT_NAMESPACE"
echo "[+] AppRole for $OWNER created"
# Verify AppRole
#vault read auth/approle/role/"$OWNER-role" #namespace="$VAULT_NAMESPACE"

# Create PKI role for the user
echo "[*] Creating PKI role '$OWNER'..."
vault write pki/roles/"$OWNER" \
	allowed_domains="*" \
	allow_subdomains=true \
	allow_any_name=true \
	enforce_hostnames=false \
	max_ttl="720h" #> /dev/null
echo "[+] PKI role '$OWNER' created"

# Generate role_id and secret_id for the AppRole
echo "[*] Generating Role ID and Secret ID for $OWNER-role..."
ROLE_ID=$(vault read -field=role_id auth/approle/role/"$OWNER-role"/role-id) #namespace="$VAULT_NAMESPACE"
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/"$OWNER-role"/secret-id) #namespace="$VAULT_NAMESPACE"
# SNOW should store these somewhere safe
echo "[+] Role ID and Secret ID generated"
#echo "    Role ID: $ROLE_ID"
#echo "	Secret ID: $SECRET_ID"

# Create an entity alias linking the AppRole to the entity
echo "[*] Linking AppRole to entity for $OWNER..."
ENTITY_ID=$(vault read -field=id identity/entity/name/"$OWNER") #namespace="$VAULT_NAMESPACE"
#echo "    Entity ID: $ENTITY_ID"
vault write identity/entity-alias \
	name="$OWNER-role" \
	canonical_id="$ENTITY_ID" \
	mount_accessor=$(vault auth list -format=json | jq -r '.["approle/"].accessor') \
	#entity_id="$ENTITY_ID"
	#namespace="$VAULT_NAMESPACE"
echo "[+] AppRole linked to entity for $OWNER"
# Verify alias
#vault read identity/entity-alias/name/"$OWNER-role" #namespace="$VAULT_NAMESPACE"
#vault list identity/entity-alias/name #namespace="$VAULT_NAMESPACE"


# Use the AppRole credentials to login and get a token
echo "[*] Logging in with AppRole to obtain token..."
APPROLE_TOKEN=$(vault write -field=token auth/approle/login role_id="$ROLE_ID" secret_id="$SECRET_ID") #namespace="$VAULT_NAMESPACE"
#echo "[+] AppRole token obtained: $APPROLE_TOKEN"

# Login with the new token and new role_id and secret_id
export VAULT_TOKEN=$APPROLE_TOKEN
vault login $VAULT_TOKEN
echo "[+] Logged in to Vault with $OWNER-role AppRole."
# Verify login
#vault token lookup

# ===========================================================

# Now that we are logged in as the user, verify the user's permissions
#echo "[*] Verifying permissions for $OWNER..."
#vault token capabilities $VAULT_TOKEN pki/issue/"$OWNER"
#vault token capabilities $VAULT_TOKEN secret/data/user/$OWNER/certs/test-certificate
#echo "[+] Permissions for $OWNER verified"

# Call PKI endpoint to issue a certificate
echo "[*] Issuing certificate for $COMMON_NAME for $OWNER..."
vault write -format=json pki/issue/"$OWNER" \
	common_name="$COMMON_NAME" \
	organization="$ORG" \
	country="$COUNTRY" \
	state="$STATE" \
	locality="$LOCALITY" \
	ttl="$TTL" > cert_data.json
echo "[+] Certificate for $COMMON_NAME issued for $OWNER"
jq -r '.data.certificate' cert_data.json > client.crt
jq -r '.data.private_key' cert_data.json > client.key
jq -r '.data.issuing_ca' cert_data.json > ca.crt
# Print cert serial number
CERT_SERIAL=$(jq -r '.data.serial_number' cert_data.json)
# Verify cert files
echo "[*] Verifying issued certificate files..."
echo "    Certificate Serial Number: $CERT_SERIAL"
#cat client.crt
#cat client.key
#cat ca.crt


KV_PATH="secret/certs/$OWNER/$COMMON_NAME"
# Store issued cert + priv key in KV? Vault path secret/certs/<owner>/<common_name>
echo "[*] Storing certificate and key in Vault KV at $KV_PATH..."
vault kv put $KV_PATH \
	certificate=@client.crt \
	private_key=@client.key \
	ca_cert=@ca.crt
echo "Certificate and key stored in Vault at $KV_PATH"


# ============================ WORKS UP TO HERE ============================


# # Create an AWS role
# echo "[*] Creating AWS role for IAM role ARN '$IAM_ROLE'..."
# vault write auth/aws/role/"$OWNER-ec2-role" \
# 	auth_time=ec2 \
# 	bound_iam_principal_arn="$IAM_ROLE" \
# 	policies="$OWNER-combined-policy" \


# # Link the AWS auth role to the entity
# # ENTITY_ID=$(vault read -field=id identity/entity/name/"$OWNER") #namespace="$VAULT_NAMESPACE"
# vault write identity/entity-alias \
# 	name="$OWNER-ec2-role" \
# 	canonical_id="$ENTITY_ID" \
# 	mount_accessor=$(vault auth list -format=json | jq -r '.["aws/"].accessor') \
# 	#entity_id="$ENTITY_ID"
# 	#namespace="$VAULT_NAMESPACE"


