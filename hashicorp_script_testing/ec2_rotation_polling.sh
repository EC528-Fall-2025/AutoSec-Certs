#!/bin/bash
set -euo pipefail

# To be ran periodically on an EC2 instance to poll for changed certificates. 
# If a change is detected, the new certs are written to disk and the relevant service is reloaded.

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <app-name>" >&2
    exit 2
fi

# Detect AWS Account ID and IAM Role from instance metadata
AWS_ID=$(aws sts get-caller-identity --query Account --output text)
VAULT_AWS_ROLE=$(aws sts get-caller-identity --query Arn --output text | awk -F'/' '{print $2}')

APP_NAME="$1"
#AWS_ID="$2"
#VAULT_AWS_ROLE="$3"
CERT_NAME=""

KV_PATH="certs/$AWS_ID/$VAULT_AWS_ROLE/"

export VAULT_ADDR="https://main-cluster-public-vault-19db5664.417ab8a8.z1.hashicorp.cloud:8200"
export VAULT_NAMESPACE="admin"

# Store certs under /etc/<app-name>/
#CERT_DIR="/var/lib/$APP_NAME"
CERT_DIR="/home/ec2-user/$APP_NAME"
#CERT_FILE="$CERT_DIR/cert.pem"
#KEY_FILE="$CERT_DIR/key.pem"
#CA_FILE="$CERT_DIR/ca.pem"
CERT_FILE=""
KEY_FILE=""
CA_FILE=""

echo "Certificates stored under: $CERT_DIR"

sudo mkdir -p "$CERT_DIR"
sudo chmod 707 "$CERT_DIR"

# Using simple echo for logging (helpers removed)
echo "[DEBUG] Starting cert rotation script..."
echo "[DEBUG] APP_NAME=$APP_NAME"
echo "[DEBUG] AWS_ID=$AWS_ID"
echo "[DEBUG] VAULT_AWS_ROLE=$VAULT_AWS_ROLE"
#echo "[DEBUG] CERT_NAME=$CERT_NAME"
echo "[DEBUG] KV_PATH=$KV_PATH"
echo "[DEBUG] CERT_DIR=$CERT_DIR"


# 1. Authenticate to Vault with AWS IAM and capture JSON output

echo "[DEBUG] Authenticating to Vault using AWS IAM..."

LOGIN_JSON=$(vault login -format=json -method=aws role="$VAULT_AWS_ROLE" header_value=vault.example.com 2>vault_login.err)
VAULT_EXIT=$?
echo "[DEBUG] vault login exit=$VAULT_EXIT"
if [ -s vault_login.err ]; then
    echo "[ERROR] vault login stderr preview:" >&2
    sed -n '1,200p' vault_login.err >&2
fi
if [ $VAULT_EXIT -ne 0 ]; then
    echo "Vault CLI failed (exit $VAULT_EXIT):" >&2
    sed -n '1,200p' vault_login.err >&2
    exit 1
fi

# Show a short preview of the JSON response (first 200 chars) to avoid leaking secrets
if [ -n "$LOGIN_JSON" ]; then
    echo "[DEBUG] Login JSON preview: $(printf '%s' "$LOGIN_JSON" | head -c 200)"
else
    echo "[ERROR] Login JSON is empty" >&2
fi

# Extract the client token from the login response
VAULT_TOKEN=$(echo "$LOGIN_JSON" | jq -r '.auth.client_token')
if [ -z "$VAULT_TOKEN" ] || [ "$VAULT_TOKEN" = "null" ]; then
    echo "Vault login failed or returned no token" >&2
    # echo "Login response: $LOGIN_JSON" >&2
    exit 1
fi

export VAULT_TOKEN

echo "[DEBUG] Extracted Vault token length: ${#VAULT_TOKEN}"


# 2. Pull the secrets from KV

echo "[DEBUG] Fetching certificate from Vault KV path: $KV_PATH"

# Capture KV fetch stdout/stderr for diagnostics
DATA=$(vault kv list -format=json -namespace=admin -mount="secret" "$KV_PATH" 2>kv_fetch.err)
# gets [ "cert1", "cert2", ... ]
KV_EXIT=$?
echo "[DEBUG] vault kv get exit=$KV_EXIT"
if [ -s kv_fetch.err ]; then
    echo "[ERROR] vault kv get stderr preview:" >&2
    sed -n '1,200p' kv_fetch.err >&2
fi
if [ $KV_EXIT -ne 0 ]; then
    echo "Error: vault kv get failed (exit $KV_EXIT)" >&2
    exit 1
fi
# Show DATA size and a short preview (avoid printing private key/cert fully)
if [ -n "$DATA" ]; then
    echo "[DEBUG] DATA length: ${#DATA} bytes"
    echo "[DEBUG] DATA preview: $(printf '%s' "$DATA" | head -c 200)"
else
    echo "[ERROR] DATA is empty" >&2
fi

echo "[DEBUG] Parsing cert list from KV..."

CERT_LIST=$(echo "$DATA" | jq -r '.[]')
echo "[DEBUG] Certificates found:"
echo "$CERT_LIST"

CHANGED=0
for CERT_NAME in $CERT_LIST; do

    echo
    echo "[DEBUG] ----------------------------"
    echo "[DEBUG] Processing certificate: $CERT_NAME"
    echo "[DEBUG] KV path: secret/$KV_PATH$CERT_NAME"
    echo "[DEBUG] ----------------------------"

    SINGLE_DATA=$(vault kv get -format=json -namespace=admin -mount="secret" "$KV_PATH$CERT_NAME")
    NEW_CERT=$(echo "$SINGLE_DATA" | jq -r '.data.data.certificate')
    NEW_KEY=$(echo "$SINGLE_DATA" | jq -r '.data.data.private_key')
    # Optional additional fields stored in KV
    NEW_SERIAL=$(echo "$SINGLE_DATA" | jq -r '.data.data.serial_number // empty')
    # KV v2 metadata (created_time, version, etc.) — keep compact JSON
    NEW_META=$(echo "$SINGLE_DATA" | jq -c '.data.metadata // {}')

    if [[ -z "$NEW_CERT" || -z "$NEW_KEY" ]]; then
        echo "Error: certificate or key missing for $CERT_NAME" >&2
        continue
    fi

    # Files for EACH cert
    CERT_FILE="$CERT_DIR/${CERT_NAME}.pem"
    KEY_FILE="$CERT_DIR/${CERT_NAME}.key"
    SERIAL_FILE="$CERT_DIR/${CERT_NAME}.serial"
    META_FILE="$CERT_DIR/${CERT_NAME}.meta.json"

    echo "[DEBUG] Output cert path: $CERT_FILE"
    echo "[DEBUG] Output key path: $KEY_FILE"

    # Compare hashes
    if [[ -f "$CERT_FILE" ]]; then
        CURRENT_HASH=$(sed 's/[[:space:]]*$//' "$CERT_FILE" | md5sum | awk '{print $1}')
    else
        CURRENT_HASH=""
    fi

    NEW_HASH=$(printf "%s" "$NEW_CERT" | sed 's/[[:space:]]*$//' | md5sum | awk '{print $1}')

    echo "[DEBUG] CURRENT_HASH=$CURRENT_HASH"
    echo "[DEBUG] NEW_HASH=$NEW_HASH"

    if [[ "$CURRENT_HASH" != "$NEW_HASH" ]]; then
        echo "[DEBUG] Certificate $CERT_NAME changed, updating..."

        TMP_CERT=$(mktemp)
        TMP_KEY=$(mktemp)
        TMP_SERIAL=$(mktemp)
        TMP_META=$(mktemp)

        printf "%s" "$NEW_CERT" > "$TMP_CERT"
        printf "%s" "$NEW_KEY" > "$TMP_KEY"
        printf "%s" "$NEW_SERIAL" > "$TMP_SERIAL"
        printf "%s" "$NEW_META" > "$TMP_META"

        chmod 600 "$TMP_CERT" "$TMP_KEY" "$TMP_SERIAL" "$TMP_META"

        mv "$TMP_CERT" "$CERT_FILE"
        mv "$TMP_KEY" "$KEY_FILE"
        mv "$TMP_SERIAL" "$SERIAL_FILE"
        mv "$TMP_META" "$META_FILE"

        echo "[INFO] Updated $CERT_NAME (cert, key, serial, metadata)"
        CHANGED=1
    else
        echo "[DEBUG] No change for $CERT_NAME"
    fi

done

if [[ "$CHANGED" -eq 1 ]]; then
    echo "[INFO] Some certificates changed, reloading service: $APP_NAME"
    systemctl reload "$APP_NAME"
else
    echo "[DEBUG] No certificates updated, nothing to reload."
fi


# For single cert version:
# NEW_CERT=$(echo "$DATA" | jq -r '.data.data.cert')
# NEW_KEY=$(echo "$DATA" | jq -r '.data.data.key')
# #NEW_TIME_CREATED=$(echo "$DATA" | jq -r '.data.metadata.created_time')
# if [[ -z "$NEW_CERT" || -z "$NEW_KEY" ]]; then
#     echo "Error: certificate or key missing in KV path $KV_PATH" >&2
#     exit 1
# fi

# # 3. Check if cert changed

# ### DEBUG:
#     echo "[DEBUG] Existing cert found at $CERT_FILE, hashing..."

# if [[ -f "$CERT_FILE" ]]; then
#     CURRENT_HASH=$(sed 's/[[:space:]]*$//' "$CERT_FILE" | md5sum | awk '{print $1}')
# else
#     CURRENT_HASH=""
# fi
# NEW_HASH=$(printf "%s" "$NEW_CERT" | sed 's/[[:space:]]*$//' | md5sum | awk '{print $1}')

# ### DEBUG:
# echo "[DEBUG] CURRENT_HASH=$CURRENT_HASH"
# echo "[DEBUG] NEW_HASH=$NEW_HASH"

# if [[ "$CURRENT_HASH" != "$NEW_HASH" ]]; then
#     echo "Current hash ($CURRENT_HASH) differs from new hash ($NEW_HASH). Certificate updated, applying changes..."

#     # Atomic write to avoid partial writes
#     ### DEBUG:
#     echo "[DEBUG] Writing new cert and key to temporary files..."
#     TMP_CERT=$(mktemp)
#     TMP_KEY=$(mktemp)

#     printf "%s" "$NEW_CERT" > "$TMP_CERT"
#     printf "%s" "$NEW_KEY" > "$TMP_KEY"

#     chmod 606 "$TMP_CERT" "$TMP_KEY"

#     mv "$TMP_CERT" "$CERT_FILE"
#     mv "$TMP_KEY" "$KEY_FILE"

#     echo "[DEBUG] New cert and key moved into place"
#     echo "[DEBUG] $CERT_FILE size: $(stat -c%s "$CERT_FILE" 2>/dev/null || echo 'n/a') bytes"
#     echo "[DEBUG] $KEY_FILE size: $(stat -c%s "$KEY_FILE" 2>/dev/null || echo 'n/a') bytes"
#     echo "[DEBUG] $CERT_FILE perms: $(stat -c%a "$CERT_FILE" 2>/dev/null || echo 'n/a')"
#     echo "[DEBUG] $KEY_FILE perms: $(stat -c%a "$KEY_FILE" 2>/dev/null || echo 'n/a')"

#     ### DEBUG:
#     echo "[DEBUG] New cert and key written successfully."
#     echo "Reloading service: $APP_NAME"
#     echo "[DEBUG] Reloading systemd service: $APP_NAME"

#     if ! systemctl reload "$APP_NAME"; then
#         echo "Error: failed to reload $APP_NAME" >&2
#         exit 1
#     fi

#     ### DEBUG:
#     echo "[DEBUG] Service reload complete."
# else
#     ### DEBUG:
#     echo "[DEBUG] No change detected in certificate. Exiting."
# fi
