/**
 * VaultAWSAuthService - AWS Auth Role management service
 * Handles creating and managing AWS authentication roles in Vault
 * Extends VaultAuthBase for authentication
 */
var VaultAWSAuthService = Class.create();
VaultAWSAuthService.prototype = Object.extendsObject(VaultAuthBase, {
    
    initialize: function() {
        VaultAuthBase.prototype.initialize.call(this);
        // Single AWS Account mode: All users must use the same AWS Account
        this.AWS_ACCOUNT_ID = '956099786986';
        // Mode A: Unified IAM Role - All users use the same AWS IAM Role
        this.UNIFIED_AWS_ROLE_NAME = 'aarush-test-role';
    },

    /**
     * Ensure ServiceNow AppRole has a specific policy bound
     * Attempts to add the policy to ServiceNow AppRole's token policies
     * @param {string} policyName - Name of the policy to bind (e.g., "aws-management-policy", "cert-storage-policy")
     * @returns {boolean} True if successful or if policy is already bound, false otherwise
     */
    _ensureServiceNowAppRoleHasPolicy: function(policyName) {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Unable to acquire ServiceNow Vault token for AppRole policy update');
                return false;
            }

            // ServiceNow AppRole name
            var servicenowAppRoleName = 'servicenow-pki-role';
            
            // Get current AppRole configuration
            var getRequest = new sn_ws.RESTMessageV2();
            getRequest.setEndpoint(this.VAULT_ADDR + '/v1/auth/approle/role/' + servicenowAppRoleName);
            getRequest.setHttpMethod('GET');
            getRequest.setRequestHeader('X-Vault-Token', this.token);
            getRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var getResponse = getRequest.execute();
            var getStatus = getResponse.getStatusCode();

            if (getStatus != 200) {
                gs.warn('⚠️ Cannot read ServiceNow AppRole configuration: HTTP ' + getStatus);
                return false;
            }

            var roleData = JSON.parse(getResponse.getBody()).data;
            // token_policies can be a string (comma-separated) or an array
            var currentPolicies = [];
            if (Array.isArray(roleData.token_policies)) {
                currentPolicies = roleData.token_policies;
            } else if (typeof roleData.token_policies === 'string' && roleData.token_policies) {
                currentPolicies = roleData.token_policies.split(',').map(function(p) { return p.trim(); });
            }
            
            // Check if policy is already bound
            var policyFound = false;
            for (var i = 0; i < currentPolicies.length; i++) {
                if (currentPolicies[i] === policyName) {
                    policyFound = true;
                    break;
                }
            }
            
            if (policyFound) {
                gs.debug('✅ ServiceNow AppRole already has ' + policyName + ' bound');
                return true;
            }

            // Add policy to token policies
            currentPolicies.push(policyName);
            
            // Vault API accepts token_policies as comma-separated string
            var policiesString = currentPolicies.join(',');

            var updateRequest = new sn_ws.RESTMessageV2();
            updateRequest.setEndpoint(this.VAULT_ADDR + '/v1/auth/approle/role/' + servicenowAppRoleName);
            updateRequest.setHttpMethod('POST');
            updateRequest.setRequestHeader('Content-Type', 'application/json');
            updateRequest.setRequestHeader('X-Vault-Token', this.token);
            updateRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var updatePayload = {
                token_policies: policiesString
            };
            updateRequest.setRequestBody(JSON.stringify(updatePayload));
            
            gs.info('📝 Attempting to bind ' + policyName + ' to ServiceNow AppRole');
            gs.info('   Current policies: ' + (roleData.token_policies || 'none'));
            gs.info('   Updated policies: ' + policiesString);

            var updateResponse = updateRequest.execute();
            var updateStatus = updateResponse.getStatusCode();

            if (updateStatus == 200 || updateStatus == 204) {
                gs.info('✅ Successfully bound ' + policyName + ' to ServiceNow AppRole');
                return true;
            } else {
                gs.warn('⚠️ Failed to bind ' + policyName + ' to ServiceNow AppRole: HTTP ' + updateStatus);
                gs.warn('⚠️ Response: ' + updateResponse.getBody());
                gs.warn('⚠️ Please manually bind the policy in Vault UI or CLI');
                return false;
            }

        } catch (e) {
            gs.warn('⚠️ Exception binding ' + policyName + ' to ServiceNow AppRole: ' + e.message);
            return false;
        }
    },

    /**
     * Ensure AWS management policy exists (for ServiceNow AppRole)
     * This policy allows ServiceNow AppRole to:
     * 1. Create/manage AWS auth roles
     * 2. Create policies for AWS Account + Role combinations
     * Note: Certificate storage is handled by cert-storage-policy (separate policy)
     * Creates the policy if it doesn't exist, otherwise uses existing one
     * @returns {boolean} True if policy exists or was created successfully, false otherwise
     */
    _ensureAWSManagementPolicy: function() {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Unable to acquire ServiceNow Vault token for AWS management policy check');
                return false;
            }

            var policyName = 'aws-management-policy';
            
            // Check if policy already exists
            var checkRequest = new sn_ws.RESTMessageV2();
            checkRequest.setEndpoint(this.VAULT_ADDR + '/v1/sys/policies/acl/' + policyName);
            checkRequest.setHttpMethod('GET');
            checkRequest.setRequestHeader('X-Vault-Token', this.token);
            checkRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var checkResponse = checkRequest.execute();
            var checkStatus = checkResponse.getStatusCode();

            // Build HCL policy (AWS management only - no certificate storage)
            var policyHcl = 'path "auth/aws/role/*" {\n'
                + '  capabilities = ["read", "list", "create", "update"]\n'
                + '}\n'
                + 'path "sys/policies/acl/*-combined-policy" {\n'
                + '  capabilities = ["create", "read", "update"]\n'
                + '}\n';

            // Policy exists (200) - update it to ensure it has all required permissions
            if (checkStatus == 200) {
                gs.info('📝 AWS management policy exists, updating to ensure it has all required permissions: ' + policyName);
            } else if (checkStatus == 404) {
                // Policy doesn't exist, create it
                gs.info('📝 Creating AWS management policy: ' + policyName);
            } else {
                gs.error('❌ Unexpected status when checking AWS management policy: HTTP ' + checkStatus);
                gs.error('Response: ' + checkResponse.getBody());
                return false;
            }

            // Create or update the policy (PUT will create or update)
            var createRequest = new sn_ws.RESTMessageV2();
            createRequest.setEndpoint(this.VAULT_ADDR + '/v1/sys/policies/acl/' + policyName);
            createRequest.setHttpMethod('PUT');
            createRequest.setRequestHeader('Content-Type', 'application/json');
            createRequest.setRequestHeader('X-Vault-Token', this.token);
            createRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            createRequest.setRequestBody(JSON.stringify({ policy: policyHcl }));

            var createResponse = createRequest.execute();
            var createStatus = createResponse.getStatusCode();

            if (createStatus == 200 || createStatus == 204) {
                if (checkStatus == 200) {
                    gs.info('✅ Updated AWS management policy: ' + policyName);
                } else {
                    gs.info('✅ Created AWS management policy: ' + policyName);
                }
                gs.info('   Policy includes:');
                gs.info('   - path "auth/aws/role/*" { capabilities = ["read", "list", "create", "update"] }');
                gs.info('   - path "sys/policies/acl/*-combined-policy" { capabilities = ["create", "read", "update"] }');
                
                // Try to bind the policy to ServiceNow AppRole
                this._ensureServiceNowAppRoleHasPolicy('aws-management-policy');
                
                return true;
            } else {
                gs.error('❌ Failed to create/update AWS management policy: HTTP ' + createStatus);
                gs.error('Response: ' + createResponse.getBody());
                return false;
            }

        } catch (e) {
            gs.error('❌ Exception ensuring AWS management policy: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Generate policy name for user (Mode A: Unified IAM Role)
     * Format: <username>-combined-policy
     * @param {string} username - Username extracted from email
     * @returns {string} Policy name
     */
    _getAWSCertWriterPolicyName: function(username) {
        return username + '-combined-policy';
    },

    /**
     * Ensure AWS certificate writer policy exists for a specific user (Mode A: Unified IAM Role)
     * Creates the policy if it doesn't exist (one-time setup per user)
     * Policy allows AWS IAM role to access: secret/data/certs/<owner_aws_account_id>/<owner_aws_role_name>/<cert_serial_number>
     * 
     * @param {string} username - Username extracted from email
     * @param {string} ownerAwsAccountId - Owner's AWS Account ID (from form, used for KV path)
     * @param {string} ownerAwsRoleName - Owner's AWS Role Name (from form, used for KV path)
     * @returns {string|null} Policy name if successful, null otherwise
     */
    _ensureAWSCertWriterPolicy: function(username, ownerAwsAccountId, ownerAwsRoleName) {
        try {
            if (!username) {
                gs.error('❌ _ensureAWSCertWriterPolicy called with empty username');
                return null;
            }
            
            if (!ownerAwsAccountId || !ownerAwsRoleName) {
                gs.error('❌ _ensureAWSCertWriterPolicy called with empty owner AWS Account ID or Role Name');
                return null;
            }

            if (!this.ensureAuthenticated()) {
                gs.error('❌ Unable to acquire ServiceNow Vault token for AWS cert writer policy check');
                return null;
            }

            var policyName = this._getAWSCertWriterPolicyName(username);
            
            // Check if policy already exists
            var checkRequest = new sn_ws.RESTMessageV2();
            checkRequest.setEndpoint(this.VAULT_ADDR + '/v1/sys/policies/acl/' + policyName);
            checkRequest.setHttpMethod('GET');
            checkRequest.setRequestHeader('X-Vault-Token', this.token);
            checkRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var checkResponse = checkRequest.execute();
            var checkStatus = checkResponse.getStatusCode();

            // Policy exists (200)
            if (checkStatus == 200) {
                gs.debug('✅ AWS cert writer policy already exists: ' + policyName);
                return policyName;
            }

            // Policy doesn't exist, create it (one-time setup per user)
            if (checkStatus == 404) {
                gs.info('📝 Creating AWS cert writer policy: ' + policyName);
                gs.info('   Mode A: Unified IAM Role (' + this.UNIFIED_AWS_ROLE_NAME + ') for Vault login');
                gs.info('   User: ' + username);
                gs.info('   Owner AWS Account ID: ' + ownerAwsAccountId);
                gs.info('   Owner AWS Role Name: ' + ownerAwsRoleName);
                
                // Build HCL policy
                var kvPath = 'secret/data/certs/' + ownerAwsAccountId + '/' + ownerAwsRoleName;
                var policyHcl = 'path "' + kvPath + '/*" {\n'
                    + '  capabilities = ["read", "list"]\n'
                    + '}\n'
                    + 'path "secret/metadata/certs/' + ownerAwsAccountId + '/' + ownerAwsRoleName + '/*" {\n'
                    + '  capabilities = ["list", "read"]\n'
                    + '}\n';

                var createRequest = new sn_ws.RESTMessageV2();
                createRequest.setEndpoint(this.VAULT_ADDR + '/v1/sys/policies/acl/' + policyName);
                createRequest.setHttpMethod('PUT');
                createRequest.setRequestHeader('Content-Type', 'application/json');
                createRequest.setRequestHeader('X-Vault-Token', this.token);
                createRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
                createRequest.setRequestBody(JSON.stringify({ policy: policyHcl }));

                var createResponse = createRequest.execute();
                var createStatus = createResponse.getStatusCode();

                if (createStatus == 200 || createStatus == 204) {
                    gs.info('✅ Created AWS cert writer policy: ' + policyName);
                    gs.info('   Policy path: ' + kvPath + '/*');
                    return policyName;
                } else {
                    gs.error('❌ Failed to create AWS cert writer policy: HTTP ' + createStatus);
                    gs.error('Response: ' + createResponse.getBody());
                    return null;
                }
            } else {
                gs.error('❌ Unexpected status when checking AWS cert writer policy: HTTP ' + checkStatus);
                gs.error('Response: ' + checkResponse.getBody());
                return null;
            }

        } catch (e) {
            gs.error('❌ Exception ensuring AWS cert writer policy for user ' + username + ': ' + e.message);
            gs.error('Stack: ' + e.stack);
            return null;
        }
    },

    /**
     * Ensure AWS authentication role exists in Vault (Mode A: Unified IAM Role)
     * ServiceNow's role: Create AWS Auth role and bind user-specific policy
     * 
     * @param {string} username - Username extracted from email
     * @param {string} ownerAwsAccountId - Owner's AWS Account ID (from form, used for KV path)
     * @param {string} ownerAwsRoleName - Owner's AWS Role Name (from form, used for KV path)
     * @returns {boolean} True if successful, false otherwise
     */
    ensureAWSAuthRole: function(username, ownerAwsAccountId, ownerAwsRoleName) {
        try {
            if (!username) {
                gs.error('❌ ensureAWSAuthRole called with empty username');
                return false;
            }
            
            if (!ownerAwsAccountId || !ownerAwsRoleName) {
                gs.error('❌ ensureAWSAuthRole called with empty owner AWS Account ID or Role Name');
                return false;
            }

            if (!this.ensureAuthenticated()) {
                gs.error('❌ Unable to acquire ServiceNow Vault token for AWS auth role creation');
                return false;
            }

            // Use unified IAM Role for Vault login (Mode A)
            var awsRoleName = this.UNIFIED_AWS_ROLE_NAME;
            var awsAccountId = this.AWS_ACCOUNT_ID;
            gs.info('🔐 Mode A: Using unified IAM Role: ' + awsRoleName + ' (for Vault login)');
            gs.info('   User: ' + username);
            gs.info('   Owner AWS Account ID: ' + ownerAwsAccountId + ' (for KV path)');
            gs.info('   Owner AWS Role Name: ' + ownerAwsRoleName + ' (for KV path)');

            // Ensure AWS management policy exists
            if (!this._ensureAWSManagementPolicy()) {
                gs.warn('⚠️ AWS management policy check failed, but continuing with AWS auth role creation');
            }

            // Ensure user-specific AWS cert writer policy exists
            var userPolicyName = this._ensureAWSCertWriterPolicy(username, ownerAwsAccountId, ownerAwsRoleName);
            if (!userPolicyName) {
                gs.error('❌ Failed to ensure AWS cert writer policy for user: ' + username);
                return false;
            }

            // Vault AWS auth role name: always use unified IAM Role name
            var vaultRoleName = awsRoleName;
            
            // Build IAM principal ARN (always uses unified IAM Role)
            var boundIamPrincipalArn = 'arn:aws:iam::' + awsAccountId + ':role/' + awsRoleName;
            
            // Check if AWS Auth role already exists
            var getRoleRequest = new sn_ws.RESTMessageV2();
            getRoleRequest.setEndpoint(this.VAULT_ADDR + '/v1/auth/aws/role/' + vaultRoleName);
            getRoleRequest.setHttpMethod('GET');
            getRoleRequest.setRequestHeader('X-Vault-Token', this.token);
            getRoleRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var getRoleResponse = getRoleRequest.execute();
            var getRoleStatus = getRoleResponse.getStatusCode();
            
            var existingPolicies = [];
            if (getRoleStatus == 200) {
                // Role exists, get current policies
                var roleData = JSON.parse(getRoleResponse.getBody()).data;
                if (roleData.policies) {
                    if (Array.isArray(roleData.policies)) {
                        existingPolicies = roleData.policies;
                    } else if (typeof roleData.policies === 'string') {
                        existingPolicies = roleData.policies.split(',').map(function(p) { return p.trim(); });
                    }
                }
                gs.info('📋 AWS Auth role exists, current policies: ' + existingPolicies.join(', '));
            }
            
            // Add user-specific policy to the list (if not already present)
            if (existingPolicies.indexOf(userPolicyName) === -1) {
                existingPolicies.push(userPolicyName);
            }
            
            // Prepare AWS auth role configuration
            var rolePayload = {
                auth_type: 'iam',
                bound_iam_principal_arn: boundIamPrincipalArn,
                resolve_aws_unique_ids: false,
                policies: existingPolicies.join(',')
            };

            var roleRequest = new sn_ws.RESTMessageV2();
            roleRequest.setEndpoint(this.VAULT_ADDR + '/v1/auth/aws/role/' + vaultRoleName);
            roleRequest.setHttpMethod('POST');
            roleRequest.setRequestHeader('Content-Type', 'application/json');
            roleRequest.setRequestHeader('X-Vault-Token', this.token);
            roleRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            roleRequest.setRequestBody(JSON.stringify(rolePayload));

            if (getRoleStatus == 200) {
                gs.info('📝 Updating AWS auth role: ' + vaultRoleName);
                gs.info('   Adding user policy: ' + userPolicyName);
            } else {
                gs.info('📤 Creating AWS auth role: ' + vaultRoleName);
            }
            gs.info('   IAM Principal ARN: ' + boundIamPrincipalArn);
            gs.info('   Total policies: ' + existingPolicies.length + ' (' + existingPolicies.join(', ') + ')');
            var roleResponse = roleRequest.execute();
            var status = roleResponse.getStatusCode();

            if (status != 200 && status != 204) {
                var errorBody = roleResponse.getBody();
                gs.error('❌ Failed to ensure AWS auth role ' + vaultRoleName + ': HTTP ' + status);
                gs.error('Response: ' + errorBody);
                return false;
            }

            gs.info('✅ Ensured AWS auth role exists: ' + vaultRoleName);
            gs.info('   IAM Principal ARN: ' + boundIamPrincipalArn);
            gs.info('   User policy added: ' + userPolicyName);
            gs.info('   Total policies: ' + existingPolicies.length);
            gs.info('   Mode A: All users use unified IAM Role, each has their own policy');
            return true;

        } catch (e) {
            gs.error('❌ Exception ensuring AWS auth role for user ' + username + ': ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    type: 'VaultAWSAuthService'
});

