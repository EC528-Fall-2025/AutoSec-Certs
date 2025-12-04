# Prepping AWS Account

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
                    "aws:PrincipalArn": "arn:aws:iam::688567279996:role/HCP-Vault-f963821c-99f7-42aa-bced-5932578fb680-VaultNode"
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
export VAULT_ADDR="https://main-cluster-public-vault-19db5664.417ab8a8.z1.hashicorp.cloud:8200";
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