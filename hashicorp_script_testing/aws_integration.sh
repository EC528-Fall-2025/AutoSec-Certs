#!/bin/bash
set -e

trap "echo 'Remember to pkill vault when done'" EXIT

echo "Usage: $0 <owner (full) name> <common_name> <organization> <country> <state> <locality> <aws-iam-role-arn> [ttl]"
if [ "$#" -lt 7 ]; then
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
VAULT_ADDR="https://test-cluster-public-vault-fc6745fb.83f0d48a.z1.hashicorp.cloud:8200"
VAULT_NAMESPACE="admin"

# Get from the user
IAM_ROLE=$AWS_IAM_ROLE_ARN

# ===========================================================


# Check if the provided user name already has an AppRole + entity
# If not, continue
# If yes, skip to #===========================

# Create a policy for the user's AppRole so they can issue certs for their own name only, and to store them in their own KV path
echo "[*] Creating policy for $OWNER..."
cat > policy.hcl <<EOF
path "pki/issue/$OWNER" {
	capabilities = ["create", "update"]
}
path "secret/data/user/$OWNER/certs/*" {
	capabilities = ["create", "read", "update", "delete", "list"]
}
path "secret/metadata/user/$OWNER/*" {
	capabilities = ["list"]
}
EOF
vault policy write "$OWNER-combined-policy" policy.hcl


# Create Vault entity
vault write identity/entity name="$OWNER" policies="default" #namespace="$VAULT_NAMESPACE"

# Create AppRole
vault write auth/approle/role/"$OWNER-role" \
	token_policies="default" \
	token_ttl="$TTL" \
	token_max_ttl="72h" \
	bind_secret_id=true \
	#secret_id_ttl="24h" \
	#secret_id_num_uses=1 \
	token_explicit_max_ttl="4h" \
	#namespace="$VAULT_NAMESPACE"

# Generate role_id and secret_id for the AppRole
ROLE_ID=$(vault read -field=role_id auth/approle/role/"$OWNER-role"/role-id) #namespace="$VAULT_NAMESPACE"
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/"$OWNER-role"/secret-id) #namespace="$VAULT_NAMESPACE"
# SNOW should store these somewhere safe

# Create an entity alias linking the AppRole to the entity
ENTITY_ID=$(vault read -field=id identity/entity/name/"$OWNER") #namespace="$VAULT_NAMESPACE"
vault write identity/entity-alias \
	name="$OWNER-role" \
	canonical_id="$ENTITY_ID" \
	mount_accessor=$(vault auth list -format=json | jq -r '.["approle/"].accessor') \
	#entity_id="$ENTITY_ID"
	#namespace="$VAULT_NAMESPACE"




# Use the AppRole credentials to login and get a token
APPROLE_TOKEN=$(vault write -field=token auth/approle/login role_id="$ROLE_ID" secret_id="$SECRET_ID") #namespace="$VAULT_NAMESPACE"
echo "[+] AppRole token obtained"


# ===========================================================


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


KV_PATH="secret/data/user/$OWNER/certs"
# Store issued cert + priv key in KV? Vault path secret/data/user/<username>/certs/
echo "[*] Storing certificate and key in Vault KV at $KV_PATH..."
vault kv put $KV_PATH/$COMMON_NAME \
	certificate=@client.crt \
	private_key=@client.key \
	ca_cert=@ca.crt
echo "Certificate and key stored in Vault at $KV_PATH/$COMMON_NAME"


# Create an AWS role
echo "[*] Creating AWS role for IAM role ARN '$IAM_ROLE'..."
vault write auth/aws/role/"$OWNER-ec2-role" \
	auth_time=ec2 \
	bound_iam_principal_arn="$IAM_ROLE" \
	policies="default" \


# Link the AWS auth role to the entity
# ENTITY_ID=$(vault read -field=id identity/entity/name/"$OWNER") #namespace="$VAULT_NAMESPACE"
vault write identity/entity-alias \
	name="$OWNER-ec2-role" \
	canonical_id="$ENTITY_ID" \
	mount_accessor=$(vault auth list -format=json | jq -r '.["aws/"].accessor') \
	#entity_id="$ENTITY_ID"
	#namespace="$VAULT_NAMESPACE"


