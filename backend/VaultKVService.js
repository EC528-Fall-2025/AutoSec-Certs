/**
 * VaultKVService - KV storage service
 * Handles storing certificates to Vault KV paths (user KV and AWS KV)
 * Extends VaultAuthBase for authentication
 */
var VaultKVService = Class.create();
VaultKVService.prototype = Object.extendsObject(VaultAuthBase, {
    
    initialize: function() {
        VaultAuthBase.prototype.initialize.call(this);
    },

    /**
     * Authenticate to Vault using user AppRole credentials
     * @param {string} roleId - User's AppRole role_id
     * @param {string} secretId - User's AppRole secret_id
     * @returns {string} Vault token, or null on failure
     */
    _authenticateWithUserAppRole: function(roleId, secretId) {
        try {
            gs.debug('🔐 Authenticating with user AppRole...');

            var r = new sn_ws.RESTMessageV2();
            r.setEndpoint(this.VAULT_ADDR + '/v1/auth/approle/login');
            r.setHttpMethod('POST');
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var payload = {
                role_id: roleId,
                secret_id: secretId
            };
            r.setRequestBody(JSON.stringify(payload));

            var res = r.execute();
            var code = res.getStatusCode();

            if (code != 200) {
                gs.error('❌ User AppRole auth failed, HTTP ' + code);
                return null;
            }

            var body = JSON.parse(res.getBody());
            var userToken = body.auth.client_token;

            gs.debug('✅ User AppRole token acquired');
            return userToken;

        } catch (e) {
            gs.error('❌ User AppRole authentication exception: ' + e.message);
            return null;
        }
    },

    /**
     * Generate a new secret_id for a user-specific AppRole
     * @param {string} approleName - Name of the AppRole (e.g., "alice-approle")
     * @returns {object|null} Secret data object (includes secret_id), or null on failure
     */
    _generateNewSecretIdForAppRole: function(approleName) {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Cannot generate new secret_id because ServiceNow token acquisition failed');
                return null;
            }

            var secretRequest = new sn_ws.RESTMessageV2();
            secretRequest.setEndpoint(this.VAULT_ADDR + '/v1/auth/approle/role/' + approleName + '/secret-id');
            secretRequest.setHttpMethod('POST');
            secretRequest.setRequestHeader('Content-Type', 'application/json');
            secretRequest.setRequestHeader('X-Vault-Token', this.token);
            secretRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            secretRequest.setRequestBody('{}');

            var secretResponse = secretRequest.execute();
            var secretStatus = secretResponse.getStatusCode();

            if (secretStatus != 200) {
                gs.error('❌ Failed to generate new secret_id for AppRole ' + approleName + ': HTTP ' + secretStatus);
                gs.error('Response: ' + secretResponse.getBody());
                return null;
            }

            var secretData = JSON.parse(secretResponse.getBody()).data;
            gs.info('✅ Generated new secret_id for AppRole: ' + approleName);
            return secretData;

        } catch (e) {
            gs.error('❌ Exception while generating new secret_id for ' + approleName + ': ' + e.message);
            gs.error('Stack: ' + e.stack);
            return null;
        }
    },

    /**
     * Store certificate and private key to Vault KV at user-specific path
     * Path: secret/data/user-data/<username>/<serial_number>
     * @param {string} username - Username (e.g., "alice")
     * @param {string} approleName - AppRole name (e.g., "alice-approle")
     * @param {string} roleId - User's AppRole role_id
     * @param {string} secretId - User's AppRole secret_id
     * @param {string} certificate - Certificate content
     * @param {string} privateKey - Private key content
     * @param {string} caChain - CA chain (optional)
     * @param {string} serialNumber - Certificate serial number
     * @param {object} options - Optional parameters (record for updating secret_id)
     * @returns {boolean} True if successful, false otherwise
     */
    storeCertificateToKV: function(username, approleName, roleId, secretId, certificate, privateKey, caChain, serialNumber, options) {
        try {
            var opts = options || {};
            var record = opts.record || null;

            // 1️⃣ Authenticate with user AppRole (with retry on expired/used secret_id)
            var userToken = this._authenticateWithUserAppRole(roleId, secretId);
            if (!userToken) {
                if (approleName) {
                    gs.warn('⚠️ User AppRole authentication failed for ' + approleName + '. Attempting to generate a new secret_id...');
                    var secretData = this._generateNewSecretIdForAppRole(approleName);
                    if (secretData && secretData.secret_id) {
                        secretId = secretData.secret_id;
                        if (record && record.u_user_secret_id) {
                            record.u_user_secret_id.setDisplayValue(secretId);
                        }
                        userToken = this._authenticateWithUserAppRole(roleId, secretId);
                    } else {
                        gs.error('❌ Unable to generate a new secret_id for AppRole: ' + approleName);
                        return false;
                    }
                } else {
                    gs.error('❌ Failed to authenticate with user AppRole');
                    return false;
                }
            }

            // 2️⃣ Prepare KV path and data
            var serialSegment = serialNumber ? encodeURIComponent(serialNumber) : 'latest';
            var kvPath = 'secret/data/user-data/' + username + '/' + serialSegment;
            var kvData = {
                cert: certificate,
                key: privateKey,
                serial_number: serialNumber
            };

            if (caChain) {
                kvData.ca_chain = caChain;
            }

            // 3️⃣ Store to KV
            var kvRequest = new sn_ws.RESTMessageV2();
            kvRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + kvPath);
            kvRequest.setHttpMethod('POST');
            kvRequest.setRequestHeader('Content-Type', 'application/json');
            kvRequest.setRequestHeader('X-Vault-Token', userToken);
            kvRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var kvPayload = {
                data: kvData
            };
            kvRequest.setRequestBody(JSON.stringify(kvPayload));

            var kvResponse = kvRequest.execute();
            var kvStatusCode = kvResponse.getStatusCode();

            if (kvStatusCode != 200 && kvStatusCode != 204) {
                gs.error('❌ Failed to store to KV: HTTP ' + kvStatusCode);
                gs.error('Response: ' + kvResponse.getBody());
                return false;
            }

            gs.info('✅ Certificate stored to KV: ' + kvPath);
            return true;

        } catch (e) {
            gs.error('❌ Exception during KV storage: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Check if cert-storage-policy exists (for ServiceNow AppRole)
     * This policy allows ServiceNow AppRole to write certificates to AWS KV paths
     * Note: Policy is pre-created and bound to servicenow-pki-role, just verify it exists
     * @returns {boolean} True if policy exists, false otherwise
     */
    _ensureCertStoragePolicy: function() {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Unable to acquire ServiceNow Vault token for cert storage policy check');
                return false;
            }

            var policyName = 'cert-storage-policy';
            
            // Check if policy already exists
            var checkRequest = new sn_ws.RESTMessageV2();
            checkRequest.setEndpoint(this.VAULT_ADDR + '/v1/sys/policies/acl/' + policyName);
            checkRequest.setHttpMethod('GET');
            checkRequest.setRequestHeader('X-Vault-Token', this.token);
            checkRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var checkResponse = checkRequest.execute();
            var checkStatus = checkResponse.getStatusCode();

            // Policy exists (200) - policy is pre-created, just verify
            if (checkStatus == 200) {
                gs.debug('✅ Cert storage policy exists: ' + policyName);
                return true;
            } else if (checkStatus == 404) {
                // Policy doesn't exist - this should not happen if it's pre-created
                gs.warn('⚠️ Cert storage policy does not exist: ' + policyName);
                gs.warn('⚠️ Please create the policy manually in Vault and bind it to servicenow-pki-role');
                return false;
            } else {
                gs.error('❌ Unexpected status when checking cert storage policy: HTTP ' + checkStatus);
                gs.error('Response: ' + checkResponse.getBody());
                return false;
            }

        } catch (e) {
            gs.error('❌ Exception checking cert storage policy: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Store certificate to Vault KV path for AWS access
     * Path: secret/data/certs/<owner_aws_account_id>/<owner_aws_role_name>/<cert_serial_number>
     * Location: Vault UI > Secrets > secret > certs
     * Uses ServiceNow AppRole token (servicenow-pki-role) to store the certificate
     * 
     * @param {string} ownerAwsAccountId - Owner's AWS Account ID (from form, used for KV path)
     * @param {string} ownerAwsRoleName - Owner's AWS Role Name (from form, used for KV path)
     * @param {string} certificate - Certificate content
     * @param {string} privateKey - Private key content
     * @param {string} caChain - CA chain (optional)
     * @param {string} serialNumber - Certificate serial number
     * @returns {boolean} True if successful, false otherwise
     */
    storeCertificateToAWSKV: function(ownerAwsAccountId, ownerAwsRoleName, certificate, privateKey, caChain, serialNumber) {
        try {
            // 1️⃣ Ensure authenticated with ServiceNow AppRole
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Failed to authenticate to Vault');
                return false;
            }
            
            // 2️⃣ Ensure cert-storage-policy exists and is bound to ServiceNow AppRole
            if (!this._ensureCertStoragePolicy()) {
                gs.warn('⚠️ Cert storage policy check failed, but continuing with certificate storage attempt');
            }
            
            // 3️⃣ Prepare KV path and data
            // Path format: secret/data/certs/<owner_aws_account_id>/<owner_aws_role_name>/<cert_serial_number>
            var serialSegment = serialNumber ? encodeURIComponent(serialNumber) : 'latest';
            var kvPath = 'secret/data/certs/' + ownerAwsAccountId + '/' + ownerAwsRoleName + '/' + serialSegment;
            
            var kvData = {
                cert: certificate,
                key: privateKey,
                serial_number: serialNumber
            };

            if (caChain) {
                kvData.ca_chain = caChain;
            }

            // 4️⃣ Store to KV using ServiceNow AppRole token (servicenow-pki-role)
            var kvRequest = new sn_ws.RESTMessageV2();
            kvRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + kvPath);
            kvRequest.setHttpMethod('POST');
            kvRequest.setRequestHeader('Content-Type', 'application/json');
            kvRequest.setRequestHeader('X-Vault-Token', this.token);
            kvRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var kvPayload = {
                data: kvData
            };
            kvRequest.setRequestBody(JSON.stringify(kvPayload));

            var kvResponse = kvRequest.execute();
            var kvStatusCode = kvResponse.getStatusCode();

            if (kvStatusCode != 200 && kvStatusCode != 204) {
                var kvErrorBody = kvResponse.getBody();
                gs.error('❌ Failed to store certificate to Vault KV: HTTP ' + kvStatusCode);
                gs.error('Response: ' + kvErrorBody);
                
                // Parse error response to provide better error messages
                try {
                    var kvErrorData = JSON.parse(kvErrorBody);
                    if (kvErrorData.errors && kvErrorData.errors.length > 0) {
                        var kvErrorMsg = kvErrorData.errors[0];
                        
                        // Check if it's a permission error
                        if (kvErrorMsg.indexOf('permission denied') > -1 || kvStatusCode == 403) {
                            gs.error('⚠️ PERMISSION DENIED: ServiceNow AppRole (servicenow-pki-role) does not have permission to write to Vault KV path');
                            gs.error('⚠️ KV Path: ' + kvPath);
                            gs.error('⚠️ Path location: Secrets > secret > certs');
                            gs.error('⚠️ SOLUTION: Ensure "cert-storage-policy" is bound to servicenow-pki-role');
                            return false;
                        }
                    }
                } catch (parseError) {
                    // If error parsing fails, just log the raw error
                }
                return false;
            }

            gs.info('✅ Certificate stored to KV: ' + kvPath + ' (Secrets > secret > certs)');
            return true;

        } catch (e) {
            gs.error('❌ Exception during Vault KV storage: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    type: 'VaultKVService'
});

