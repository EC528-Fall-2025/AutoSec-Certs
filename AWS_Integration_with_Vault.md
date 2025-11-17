# Contents
1. [A Look at the Backend](#a-look-at-the-backend)
2. [Prepping AWS Account](#prepping-aws-account)
3. [Launching an EC2 Instance](#launching-an-ec2-instance)

# A Look at the Backend

This section primarily is dedicated on how AWS was set up with the Vault, and how users are able to access thier information.

## Valid AWS Credentials

One case with the implementation is that the Vault itself rests on the cloud provided by HashiCorp themselves, and not on the AWS EC2 instance. Since the Vault doesn't sit on an EC2 instance, it needs to have special perms to allow AWS users. To validate, it uses one of the AWS account user (IAM User) to be a collateral. 

For this to be implemented, the Vault needs to have the IAM User access key and secret key, in the form of this command:
```sh
vault write auth/aws/config/client \
    access_key="AKIAxxxxx" \
    secret_key="xxxx"
```

This also allows for the Vault server to incorporate this policy (from AWS):
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
                "iam:GetRole"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "sts:AssumeRole"
            ],
            "Resource": [
                "arn:aws:iam::956099786986:role/<VaultRole>"
            ]
        }
    ]
}
```

**ec2:DescribeInstances**  
Allows reading EC2 instance details.  
Used when Vault validates EC2 instance identities during AWS login.

**iam:GetInstanceProfile**  
Allows reading which IAM role is attached to an EC2 instance profile.  
Vault uses this to check whether the instance is allowed to authenticate.

**iam:GetUser**  
Allows reading information about the IAM user who owns the key being used.  
Vault uses this when the caller logs in using an IAM user instead of an EC2 role.

**iam:GetRole**  
Allows reading info about IAM roles.  
Vault uses this to verify which role is being claimed during authentication.

**sts:AssumeRole**
`Resource: arn:aws:iam::956099786986:role/<VaultRole>`

This allows the IAM user (whose access/secret keys are configured in Vault) to assume a specific role. This role acts as collateral, giving Vault the permissions it needs to contact AWS APIs and verify that login attempts are from valid AWS users.

These permissions let Vault verify identity but do NOT allow modifying AWS resources.

This validates a trusted user and allows the Vault to access AWS APIs to check for further logins and authenticate them.

## Registering AWS Accounts

To allow users to access their Vault API, first, their account needs to be registered to vault. This can be done multiple ways, such as a general username and password, JWT, App Roles. Since AWS was the major factor, the use of AWS cloud sign-in was used. This of course has many different ways of registering your account to AWS. From the options, two of the best ways were presented:
### Option 1:
```sh
vault write auth/aws/role/${example-role-name} \
    auth_type=iam \
    bound_account_id=<AWS_ACCOUNT_ID> \
    policies={account-policy} \
    ttl=1h
```

This allowed from anyone from the same AWS account ID use their Vault directory. Another benefit of this is to use the same policies for the many roles of the same account. 
### Option 2:
```sh
vault write auth/aws/role/${example_role_name} \
  auth_type=iam \
  bound_iam_principal_arn=${AWS_IAM_ROLE_ARM} \
  policies={account-policy} \
  max_ttl=1h
```

Option 2 is more stricter as it **only** allows for the AWS account ID **and** role to access their directory. This makes it more secure. One primary concern of this was the number of policies we can accumulate since a new policy needs to be assigned to a new role regardless of the account ID. Luckily, HashiCorp doesn't have a limit on number of policies we can have in the same namespace ([link](https://developer.hashicorp.com/vault/docs/internals/limits)).  The verdict was **option 2.**

With that command given, the AWS authentication for the user is ready for login from their EC2 instance. 

## Accessing Certificates

How does users access their certificates? Through *policies.* These policies allow users to have access to their appropriate needs. With correct policies in place, it can allow from admin privileges to little privileges. When registering the AWS account and the IAM Role, there is a policy attached each registered entity. An example would be:

```sh
# Write and manage secrets in key-value secrets engine
path "secret/data/certs/${AWS_ACCOUNT_ID}/${AWS_ACCOUNT_IAM_ROLE}/*" {
  capabilities = ["read", "list" ]
}

path "secret/metadata/certs/${AWS_ACCOUNT_ID}/${AWS_ACCOUNT_IAM_ROLE}/*" {
  capabilities = [ "list", "read" ]
}

# To enable secrets engines
path "sys/mounts/*" {
  capabilities = [ "create", "read", "update", "delete" ]
}
```

The core path, `secret/data/certs` , which is the KV (Key-Value) secrets engine. This is where the certificates are stored with their information (Key) and their private key (value). In the policy above, we allow the user to access **only** their directory and its metadata information (of both the certs and the directory).  We make a new policy for each new entity, hardcode the paths, and attach it to the user via `policies={account-policy}`. 

# Prepping AWS Account

This section will be mainly about understanding the necessary information about AWS and creating an example EC2 instance to access your certificates.

## IAM Roles 

AWS IAM roles are identities inside an AWS account, that can access AWS resources using different policies. To make a role in AWS, go the IAM tab inside the account, and click on the "roles" and then create a new role. This role is your identity. To get this role to work with HashiCorp, you will need to provide information from an EC2 instance. You would create a policy for this role, by creating a new policy. You can do this by going to policies and create a new policy. A sample policy that is a minimum requirement:
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

**ec2:DescribeInstances**
Allows the caller to list EC2 instances and read their details.  
Used by Vault AWS auth to verify EC2 instance identity when the login method is **EC2 mode**.

**iam:GetInstanceProfile**
Allows reading information about an IAM instance profile.  
Vault uses this to verify which IAM role is attached to an EC2 instance.

**iam:GetUser**
Allows reading information about the IAM user associated with the credentials.  
Useful if the entity logging in is an IAM user instead of an EC2 instance.

**iam:GetRole**
Allows reading information about an IAM role.  
Vault uses this to verify “Is this role the one the login claims to be using?”

**sts:GetCallerIdentity**
Returns the AWS identity of whatever credentials are being used.  
This is the **core identity check** for login.  
It tells Vault:
- Which account the credentials belong to
- Which user/role they represent

This will grant necessary permissions for HashiCorp to authenticate and allow you to use the Vault.

# Launching an EC2 Instance

This section talks about the AWS EC2 Instance to access your vault. To launch an instance, go to your instances tab, and launch an instance with the settings you desire. Before you launch the instance, go to the selected instance -> Actions -> Security -> Modify IAM Role -> select the role that you applied the certificate with. *Make sure to have the correct policy attached or else errors will occur.*

Once connected to your instance; update the OS (if needed), and install vault via the [directions](https://developer.hashicorp.com/vault/install). Then use the following commands to access the vault:

```sh
export VAULT_ADDR="https://test-cluster-public-vault-fc6745fb.83f0d48a.z1.hashicorp.cloud:8200";
export VAULT_NAMESPACE="admin"
```

This will allow you to connect to the public URL and set the **namespace** to admin. Not to confuse to the admin privileges. Once connected, log into the vault:

```
vault login -method=aws role=$iam-role
```

Once this command is run, and no errors are given; you will be given a token, copy it and export it:

```sh
export VAULT_TOKEN=$token
```

Finally, access your vault directory using:

List the certificates:
```sh
vault kv list secret/certs/$Account_ID/$IAM_ROLE
```

Get the certificates:
```sh
vault kv get secret/certs/$Account_ID/$IAM_ROLE/certname
```