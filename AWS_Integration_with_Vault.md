# Contents

1. [A Look at the Backend](#a-look-at-the-backend)
2. [Prepping AWS Account](#prepping-aws-account)
3. [Launching an EC2 Instance](#launching-an-ec2-instance)
4. [Resources](#resources)

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
  policies="aarush-policy"
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

# Prepping AWS Account

This section covers the required AWS setup and provides an example EC2 instance configuration for accessing your certificates.

## IAM Roles

AWS IAM roles are identities within an AWS account that define permitted actions based on attached policies. To create a role, navigate to the IAM console, select **Roles**, and create a new role. This role becomes the identity used for Vault authentication.

### Trust Relationship Policy

Before authentication with HCP Vault can occur, the IAM role must trust HashiCorp’s AWS account. Modify the role’s trust policy under **Trust relationships**. A minimal example:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        },
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::688567279996:root"
            },
            "Action": "sts:AssumeRole",
            "Condition": {
                "StringEquals": {
                    "aws:PrincipalArn": "arn:aws:iam::688567279996:role/HCP-Vault-65afb467-bc10-4ff4-8fb9-73986d47ca58"
                }
            }
        }
    ]
}
```

**Note:** Do not modify the account IDs or role names. This policy authorizes the HashiCorp-managed AWS account hosting your HCP Vault cluster to authenticate your IAM role during login.

### Permission Policy

The role also requires a permission policy. Create a new policy under **Policies** and attach it to the role. A minimal example:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeInstances",
                "iam:GetInstanceProfile",
                "iam:GetUser",
                "iam:GetRole",
                "sts:GetCallerIdentity"
            ],
            "Resource": "*"
        }
    ]
}
```

Explanation of required permissions:
- **ec2:DescribeInstances**  
    Allows listing EC2 instance details. Used by AWS auth in **EC2 mode**.
- **iam:GetInstanceProfile**  
    Allows reading instance profile information.
- **iam:GetUser**  
    Allows identifying the IAM user if not using an EC2 instance.
- **iam:GetRole**  
    Allows reading metadata for the IAM role attached to the EC2 instance.
- **sts:GetCallerIdentity**  
    Returns the AWS identity of the caller. This is the core check used for Vault authentication.

These permissions provide enough information for Vault to validate the client’s AWS identity.

# Launching an EC2 Instance

This section explains how to launch an EC2 instance and use it to access your Vault directory. 

Launch a new instance from the EC2 console using your preferred configuration. After the instance is created, attach the IAM role you prepared:

**Instance → Actions → Security → Modify IAM Role → select your IAM role**

Ensure the trust and permission policies are correctly attached.
Once connected to the instance, update the OS and install Vault following the official [instructions.](https://developer.hashicorp.com/vault/install)

Set the necessary environment variables:

```sh
export VAULT_ADDR="https://test-cluster-public-vault-fc6745fb.83f0d48a.z1.hashicorp.cloud:8200"
export VAULT_NAMESPACE="admin"
```

This configures Vault to use the public cluster endpoint and the correct namespace.  
Authenticate by running:

```sh
vault login -method=aws role=<AWS_IAM_ROLE> header_value=vault.example.com
```

The IAM role maps directly to a Vault role configured earlier. The `header_value` must match the server ID configured on the Vault side to prevent confused-deputy attacks.

If authentication succeeds, a token is returned. Export it:

```sh
export VAULT_TOKEN=<TOKEN>
```

Access your Vault directory:

List certificates:

```sh
vault kv list secret/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>
```

Retrieve a certificate:

```sh
vault kv get secret/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/certname
```

# Resources

- [Vault AWS Authentication: Cross-Account Access with STS (HashiCorp Support)](https://support.hashicorp.com/hc/en-us/articles/19951252634387-Vault-AWS-Authentication-Cross-Account-Access-with-STS)
- [Multi-Account Access for AWS Authentication (HashiCorp Community)](https://discuss.hashicorp.com/t/multi-account-access-for-aws-authentication/76820)
- [HashiCorp Support](https://support.hashicorp.com/)
