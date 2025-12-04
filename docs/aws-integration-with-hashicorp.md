# Contents

1. [A Look at the Backend](#a-look-at-the-backend)
2. [Prepping AWS Account](#prepping-aws-account)
3. [Resources](#resources)

# A Look at the Backend

This section explains how AWS integrates with Vault and how users access their information.

## Valid AWS Credentials

The Vault environment runs inside HashiCorp’s AWS account rather than a user-owned EC2 instance. Because of this, onboarding external AWS accounts requires a cross-account authentication model. Since the Vault serves multiple AWS customers, authentication is handled using Amazon Security Token Service (STS) with cross-account IAM role assumptions. Each client provides a trust policy, associates it with an IAM role in their own AWS account, and authenticates from an EC2 instance. Details on the trust policy appear in the [Prepping AWS Account](#prepping-aws-account) section.

## Registering AWS Accounts

To allow a user to access the Vault API using AWS IAM authentication, their AWS account must be registered in Vault. Although Vault supports other authentication methods (username/password, JWT, AppRole), AWS IAM auth was selected since AWS is the primary environment. HCP Vault includes native support for AWS IAM authentication.  
Register a client with:

```sh
vault write auth/aws/role/<AWS_IAM_ROLE> \
  auth_type=iam \
  bound_iam_principal_arn="arn:aws:iam::<AWS_ACCOUNT_ID>:role/<AWS_IAM_ROLE>" \
  resolve_aws_unique_ids=false \
  policies="<name>-policy"
```

This creates a Vault role named after the client’s IAM role and binds authentication to that IAM role within a specific AWS account. 
`resolve_aws_unique_ids=false` is required because HCP Vault cannot query or validate IAM entities in external AWS accounts; disabling unique-ID resolution tells Vault to rely directly on the ARN. A policy is then attached to restrict the client to only the paths they are allowed to access.

## Accessing Certificates

Certificate access is controlled entirely through Vault policies. Each client receives a policy that limits them to their own directory in the KV secrets engine:

```sh
# list or read the actual certificates
path "secret/data/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/*" {
  capabilities = ["read", "list"]
}

# list metadata for the directory or its certificates
path "secret/metadata/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/*" {
  capabilities = ["list", "read"]
}
```

The base path `secret/data/certs` corresponds to the KV secrets engine. Each client’s certificates and private key data reside in their account-specific directory. The policy ensures that a client can read and list only their own path and associated metadata. A dedicated policy is created per client, with hard-coded paths, and assigned using `policies=<account-policy>`.

This approach ensures that only the AWS account ID and IAM role bound to a given Vault role can access its directory. Although this generates a growing number of policies, Vault has no limit on policies within a namespace, so the design scales effectively ([link](https://developer.hashicorp.com/vault/docs/internals/limits)).



# Resources

- [Vault AWS Authentication: Cross-Account Access with STS (HashiCorp Support)](https://support.hashicorp.com/hc/en-us/articles/19951252634387-Vault-AWS-Authentication-Cross-Account-Access-with-STS)
- [Multi-Account Access for AWS Authentication (HashiCorp Community)](https://discuss.hashicorp.com/t/multi-account-access-for-aws-authentication/76820)
- [HashiCorp Support](https://support.hashicorp.com/)
