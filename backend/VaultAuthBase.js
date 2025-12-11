/**
 * VaultAuthBase - Base class for Vault authentication
 * Provides shared authentication logic for all Vault service modules
 */
var VaultAuthBase = Class.create();
VaultAuthBase.prototype = {
    initialize: function() {
        this.VAULT_ADDR = 'https://test-cluster-public-vault-fc6745fb.83f0d48a.z1.hashicorp.cloud:8200';
        this.VAULT_NAMESPACE = 'admin';
        this.ROLE_ID = 'b18378c5-ded6-21bf-6d12-f9225fb8a0a3';
        this.SECRET_ID = '89feebc7-70bf-6747-6779-e0b6f9a52de1';
        this.token = null;
        this.tokenExpiry = null;
    },

    /**
     * Authenticate to Vault using ServiceNow AppRole
     * @returns {boolean} True if successful, false otherwise
     */
    authenticate: function() {
        try {
            gs.info('🔐 Authenticating to Vault...');

            var r = new sn_ws.RESTMessageV2();
            r.setEndpoint(this.VAULT_ADDR + '/v1/auth/approle/login');
            r.setHttpMethod('POST');
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var payload = {
                role_id: this.ROLE_ID,
                secret_id: this.SECRET_ID
            };
            r.setRequestBody(JSON.stringify(payload));

            var res = r.execute();
            var code = res.getStatusCode();

            if (code != 200) {
                gs.error('❌ Vault auth failed, HTTP ' + code);
                return false;
            }

            var body = JSON.parse(res.getBody());
            this.token = body.auth.client_token;

            var expiry = new GlideDateTime();
            expiry.addSeconds(3600);
            this.tokenExpiry = expiry;

            gs.info('✅ Vault token acquired, expires at: ' + expiry.getDisplayValue());
            
            // Immediately check required policies after login
            if (!this._verifyRequiredPolicies()) {
                gs.error('❌ Required policies check failed - authentication aborted');
                this.token = null;
                this.tokenExpiry = null;
                return false;
            }
            
            return true;

        } catch (e) {
            gs.error('❌ Vault authentication exception: ' + e.message);
            return false;
        }
    },

    /**
     * Verify that the current token has all required policies
     * Required policies: cert-storage-policy, servicenow-policy, aws-management-policy
     * If cert-storage-policy is missing, this indicates wrong RoleID or Namespace
     * @returns {boolean} True if all required policies are present, false otherwise
     */
    _verifyRequiredPolicies: function() {
        try {
            if (!this.token) {
                gs.error('❌ Cannot verify policies: no token available');
                return false;
            }

            // Look up token information to get policies
            var lookupRequest = new sn_ws.RESTMessageV2();
            lookupRequest.setEndpoint(this.VAULT_ADDR + '/v1/auth/token/lookup-self');
            lookupRequest.setHttpMethod('GET');
            lookupRequest.setRequestHeader('X-Vault-Token', this.token);
            lookupRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var lookupResponse = lookupRequest.execute();
            var lookupStatus = lookupResponse.getStatusCode();

            if (lookupStatus != 200) {
                gs.error('❌ Failed to lookup token policies: HTTP ' + lookupStatus);
                gs.error('Response: ' + lookupResponse.getBody());
                return false;
            }

            var tokenData = JSON.parse(lookupResponse.getBody()).data;
            var tokenPolicies = tokenData.policies || [];
            
            // Required policies
            var requiredPolicies = ['cert-storage-policy', 'servicenow-policy', 'aws-management-policy'];
            var missingPolicies = [];
            
            for (var i = 0; i < requiredPolicies.length; i++) {
                var policyName = requiredPolicies[i];
                var found = false;
                for (var j = 0; j < tokenPolicies.length; j++) {
                    if (tokenPolicies[j] === policyName) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    missingPolicies.push(policyName);
                }
            }

            // Output current policies
            gs.info('📋 Token policies: ' + tokenPolicies.join(', '));

            // Check for missing policies
            if (missingPolicies.length > 0) {
                gs.error('❌ Missing required policies: ' + missingPolicies.join(', '));
                
                // If cert-storage-policy is missing, this is critical
                var certStorageMissing = false;
                for (var k = 0; k < missingPolicies.length; k++) {
                    if (missingPolicies[k] === 'cert-storage-policy') {
                        certStorageMissing = true;
                        break;
                    }
                }
                
                if (certStorageMissing) {
                    gs.error('❌ CRITICAL: cert-storage-policy is missing from token policies');
                    gs.error('❌ Root cause: Wrong RoleID or Namespace');
                    gs.error('❌ Current RoleID: ' + this.ROLE_ID);
                    gs.error('❌ Current Namespace: ' + this.VAULT_NAMESPACE);
                    gs.error('❌ Expected AppRole: servicenow-pki-role');
                    gs.error('❌ Action: Verify RoleID and Namespace are correct for servicenow-pki-role');
                    return false;
                } else {
                    gs.warn('⚠️ Missing policies (non-critical): ' + missingPolicies.join(', '));
                    gs.warn('⚠️ Continuing, but some features may not work');
                }
            } else {
                gs.info('✅ All required policies verified: cert-storage-policy, servicenow-policy, aws-management-policy');
            }

            return true;

        } catch (e) {
            gs.error('❌ Exception verifying token policies: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Check if token is still valid
     * @returns {boolean} True if token exists and is not expired
     */
    isTokenValid: function() {
        if (!this.token || !this.tokenExpiry) {
            return false;
        }
        var now = new GlideDateTime();
        return now.before(this.tokenExpiry);
    },

    /**
     * Ensure authenticated - reuse existing token or authenticate
     * @returns {boolean} True if authenticated, false otherwise
     */
    ensureAuthenticated: function() {
        if (this.isTokenValid()) {
            gs.debug('✅ Using existing valid token');
            return true;
        }
        gs.info('⚠️ Token expired or missing, re-authenticating...');
        return this.authenticate();
    },

    type: 'VaultAuthBase'
};

