# 10/25

## Set up: https://developer.hashicorp.com/vault/tutorials/get-started/setup

## First Vault Interaction:

**From the Docs**:
## Let's read a sample secret!

Your Vault cluster was created with the **KV Template**, so we've set up a sample [KV v2](https://developer.hashicorp.com/vault/docs/secrets/kv/kv-v2) secret and read/write [policy](https://developer.hashicorp.com/vault/docs/concepts/policies#policy-syntax) for you.  
  
To read this sample secret, paste the following commands into your local terminal. **NOTE:** These snippets require `jq` to be [installed](https://stedolan.github.io/jq/download/) to quickly parse the response.

Export your cluster's public URL and the default [namespace](https://developer.hashicorp.com/vault/docs/enterprise/namespaces#usage) called `admin`.

```
export VAULT_ADDR="..."
```

Authenticate to Vault using [AppRole](https://developer.hashicorp.com/vault/docs/auth/approle) and save the resulting client [token](https://developer.hashicorp.com/vault/tutorials/tokens/tokens) to interact with the cluster.

```
export VAULT_TOKEN=$(curl -s --header "X-Vault-Namespace:...
```

Read your first secret!

```
curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
    --header "X-Vault-Namespace: $VAULT_NAMESPACE" \
    $VAULT_ADDR/v1/secret/data/sample-secret | jq -r ".data"
```

Now that you've read your first secret, [access](https://developer.hashicorp.com/vault/tutorials/cloud/vault-access-cluster) your cluster or try [creating](https://developer.hashicorp.com/vault/tutorials/cloud/vault-first-secrets#create-secrets) your first secret.


**Output:**
![[Pasted image 20251025171415.png]]

```bash
dksaa@AarushComputer MINGW64 ~
$ export VAULT_ADDR="...";
export VAULT_NAMESPACE="admin"

dksaa@AarushComputer MINGW64 ~
$ export VAULT_TOKEN=$(curl -s --header "X-Vault-Namespace: $VAULT_NAMESPACE" \
    --request POST --data '{...}' \
     $VAULT_ADDR/v1/auth/approle/login | jq -r '.auth.client_token' )

dksaa@AarushComputer MINGW64 ~
$ curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
    --header "X-Vault-Namespace: $VAULT_NAMESPACE" \
    $VAULT_ADDR/v1/secret/data/sample-secret | jq -r ".data"
{
  "data": {
    "first-secret": "Vault Is The Way"
  },
  "metadata": {
    "created_time": "2025-10-25T20:56:53.509142933Z",
    "custom_metadata": null,
    "deletion_time": "",
    "destroyed": false,
    "version": 1
  }
}
```