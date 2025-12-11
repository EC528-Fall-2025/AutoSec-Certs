/**
 * Certificate Revocation Script Include
 * 
 * This script revokes certificates in Vault PKI and updates the database status.
 * 
 * Features:
 * - Uses same authentication logic as CheckTTL.js
 * - Revokes certificate in Vault PKI using serial number or certificate content
 * - Updates u_certificate_requests table: u_status -> 'revoked'
 * 
 * Usage:
 *   var revoker = new RevokeCert();
 *   var success = revoker.revokeCertificate(requestId);
 *   // or
 *   var success = revoker.revokeCertificateBySerial(serialNumber);
 */

var RevokeCert = Class.create();
RevokeCert.prototype = {
    initialize: function() {
        // Same authentication configuration as VaultAPIClient
        this.VAULT_ADDR = 'https://main-cluster-public-vault-19db5664.417ab8a8.z1.hashicorp.cloud:8200';
        this.VAULT_NAMESPACE = 'admin';
        // Vault PKI revoke path (same mount point as issue)
        // Note: Vault PKI revoke endpoint is typically pki/revoke
        this.PKI_REVOKE_PATH = 'pki/revoke';
        this.token = null;
        this.tokenExpiry = null;
        
        // Load HashiCorp credentials (same as VaultAPIClient)
        this._loadHashiCorpCredentials();
    },
    
    /**
     * Load HashiCorp credentials (same as VaultAPIClient)
     * TEMPORARY: Using hardcoded credentials until ServiceNow credentials table is configured
     */
    _loadHashiCorpCredentials: function() {
        try {
            // TEMPORARY: Hardcoded credentials (credentials table not working)
            this.HASHICORP_USERNAME = 'servicenow-user';
            this.HASHICORP_PASSWORD = 'ec528';
            gs.info('✅ HashiCorp credentials loaded (hardcoded)');
            gs.info('   Username: ' + this.HASHICORP_USERNAME);
        } catch (e) {
            gs.error('❌ Exception loading HashiCorp credentials: ' + e.message);
            this.HASHICORP_USERNAME = 'servicenow-user';
            this.HASHICORP_PASSWORD = 'ec528';
            gs.warn('⚠️ Using hardcoded credentials as fallback');
        }
    },

    /**
     * Authenticate to Vault using UserPass (same logic as VaultAPIClient)
     * @returns {boolean} True if authentication successful
     */
    authenticate: function() {
        try {
            gs.info('🔐 Authenticating to Vault using UserPass for certificate revocation...');

            // Reload credentials in case they were updated
            this._loadHashiCorpCredentials();
            
            if (!this.HASHICORP_USERNAME || !this.HASHICORP_PASSWORD) {
                gs.error('❌ HashiCorp credentials not available. Please configure Hashicorp-Username and Hashicorp-Password in credentials table.');
                return false;
            }

            var r = new sn_ws.RESTMessageV2();
            r.setEndpoint(this.VAULT_ADDR + '/v1/auth/userpass/login/' + encodeURIComponent(this.HASHICORP_USERNAME));
            r.setHttpMethod('POST');
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var payload = {
                password: this.HASHICORP_PASSWORD
            };
            r.setRequestBody(JSON.stringify(payload));

            var res = r.execute();
            var code = res.getStatusCode();

            if (code != 200) {
                gs.error('❌ Vault UserPass auth failed, HTTP ' + code);
                gs.error('Response: ' + res.getBody());
                return false;
            }

            var body = JSON.parse(res.getBody());
            this.token = body.auth.client_token;

            var expiry = new GlideDateTime();
            expiry.addSeconds(3600);
            this.tokenExpiry = expiry;

            gs.info('✅ Vault token acquired via UserPass, expires at: ' + expiry.getDisplayValue());
            return true;

        } catch (e) {
            gs.error('❌ Vault authentication exception: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Check if token is still valid
     * @returns {boolean} True if token is valid
     */
    isTokenValid: function() {
        if (!this.token || !this.tokenExpiry) {
            return false;
        }
        var now = new GlideDateTime();
        return now.before(this.tokenExpiry);
    },

    /**
     * Ensure authenticated (reuse token if valid, otherwise re-authenticate)
     * Same logic as CheckTTL.js (89-96)
     * @returns {boolean} True if authenticated
     */
    ensureAuthenticated: function() {
        if (this.isTokenValid()) {
            gs.debug('✅ Using existing valid token');
            return true;
        }
        gs.info('⚠️ Token expired or missing, re-authenticating...');
        return this.authenticate();
    },

    /**
     * Update KV secret metadata to mark certificate as revoked
     * Path format: secret/metadata/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/<CERT_NAME>
     * @param {string} awsAccountId - AWS Account ID
     * @param {string} awsRoleName - AWS IAM Role Name
     * @param {string} certName - Certificate name
     * @returns {boolean} True if metadata update successful or secret doesn't exist
     */
    _updateKVMetadataRevoked: function(awsAccountId, awsRoleName, certName) {
        try {
            if (!awsAccountId || !awsRoleName || !certName) {
                gs.warn('⚠️ Missing AWS info or cert name, skipping KV metadata update');
                return true; // Don't fail revocation if metadata update fails
            }

            if (!this.ensureAuthenticated()) {
                gs.warn('⚠️ Failed to authenticate, skipping KV metadata update');
                return true; // Don't fail revocation if metadata update fails
            }

            // KV metadata path: secret/metadata/certs/<aws_id>/<aws_role>/<cert_name>
            var kvMetadataPath = 'secret/metadata/certs/' + awsAccountId + '/' + awsRoleName + '/' + certName;
            
            // First, check if secret exists by reading metadata
            var checkRequest = new sn_ws.RESTMessageV2();
            checkRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + kvMetadataPath);
            checkRequest.setHttpMethod('GET');
            checkRequest.setRequestHeader('X-Vault-Token', this.token);
            checkRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var checkResponse = checkRequest.execute();
            var checkStatus = checkResponse.getStatusCode();
            
            if (checkStatus == 404) {
                gs.info('ℹ️ KV secret not found at: ' + kvMetadataPath + ' (may not exist yet)');
                return true; // Secret doesn't exist, that's okay
            }
            
            if (checkStatus != 200) {
                gs.warn('⚠️ Failed to check KV secret metadata: HTTP ' + checkStatus);
                return true; // Don't fail revocation if metadata check fails
            }

            // Secret exists, read existing metadata and merge with revoked=true
            var existingMetadata = {};
            try {
                var checkBody = JSON.parse(checkResponse.getBody());
                if (checkBody.data && checkBody.data.custom_metadata) {
                    existingMetadata = checkBody.data.custom_metadata;
                }
            } catch (parseError) {
                gs.warn('⚠️ Failed to parse existing metadata, will set revoked=true only');
            }

            // Merge existing custom_metadata with revoked=true
            existingMetadata.revoked = 'true';

            gs.info('📝 Updating KV secret metadata to mark as revoked: ' + kvMetadataPath);
            
            var updateRequest = new sn_ws.RESTMessageV2();
            updateRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + kvMetadataPath);
            updateRequest.setHttpMethod('POST'); // POST for metadata update
            updateRequest.setRequestHeader('Content-Type', 'application/json');
            updateRequest.setRequestHeader('X-Vault-Token', this.token);
            updateRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            // Update custom metadata with revoked=true (preserving existing metadata)
            var metadataPayload = {
                custom_metadata: existingMetadata
            };
            updateRequest.setRequestBody(JSON.stringify(metadataPayload));
            
            var updateResponse = updateRequest.execute();
            var updateStatus = updateResponse.getStatusCode();
            
            if (updateStatus == 200 || updateStatus == 204) {
                gs.info('✅ KV secret metadata updated successfully: revoked=true');
                return true;
            } else {
                var errorBody = updateResponse.getBody();
                gs.warn('⚠️ Failed to update KV secret metadata: HTTP ' + updateStatus);
                gs.warn('Response: ' + errorBody);
                return true; // Don't fail revocation if metadata update fails
            }

        } catch (e) {
            gs.warn('⚠️ Exception updating KV metadata: ' + e.message);
            return true; // Don't fail revocation if metadata update fails
        }
    },

    /**
     * Revoke certificate in Vault PKI
     * @param {string} serialNumber - Certificate serial number
     * @param {string} certificate - Certificate content (PEM format, optional)
     * @returns {boolean} True if revocation successful
     */
    revokeInVault: function(serialNumber, certificate) {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Failed to authenticate to Vault');
                return false;
            }

            // Prepare revocation payload
            var revokePayload = {};
            
            if (serialNumber) {
                revokePayload.serial_number = serialNumber;
                gs.info('📋 Revoking certificate by serial number: ' + serialNumber);
            } else if (certificate) {
                revokePayload.certificate = certificate;
                gs.info('📋 Revoking certificate by certificate content');
            } else {
                gs.error('❌ Neither serial number nor certificate provided');
                return false;
            }

            // Call Vault PKI revoke endpoint
            // Note: Policy shows "update" capability, but Vault PKI revoke endpoint accepts POST
            // The "update" capability in policy means the token can perform update operations
            var revokeRequest = new sn_ws.RESTMessageV2();
            revokeRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + this.PKI_REVOKE_PATH);
            revokeRequest.setHttpMethod('POST'); // Vault PKI revoke uses POST (update capability allows this)
            revokeRequest.setRequestHeader('Content-Type', 'application/json');
            revokeRequest.setRequestHeader('X-Vault-Token', this.token);
            revokeRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            revokeRequest.setRequestBody(JSON.stringify(revokePayload));

            gs.info('📤 Sending revocation request to Vault PKI (pki/revoke)...');
            gs.info('   Method: POST (update capability)');
            gs.info('   Payload: ' + JSON.stringify(revokePayload));
            var revokeResponse = revokeRequest.execute();
            var revokeStatus = revokeResponse.getStatusCode();

            if (revokeStatus == 200 || revokeStatus == 204) {
                gs.info('✅ Certificate revoked successfully in Vault');
                return true;
            } else {
                var errorBody = revokeResponse.getBody();
                gs.error('❌ Certificate revocation failed: HTTP ' + revokeStatus);
                gs.error('Response: ' + errorBody);
                
                // Check if certificate is already revoked
                try {
                    var errorData = JSON.parse(errorBody);
                    if (errorData.errors && errorData.errors.length > 0) {
                        var errorMsg = errorData.errors[0];
                        if (errorMsg.indexOf('already revoked') > -1 || errorMsg.indexOf('not found') > -1) {
                            gs.warn('⚠️ Certificate may already be revoked or not found');
                            // Still return true as the certificate is effectively revoked
                            return true;
                        }
                    }
                } catch (parseError) {
                    // If error parsing fails, just log the raw error
                }
                
                return false;
            }

        } catch (e) {
            gs.error('❌ Exception during certificate revocation: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Revoke certificate by Request ID
     * @param {string} requestId - Certificate request ID (u_request_id)
     * @returns {boolean} True if revocation successful
     */
    revokeCertificate: function(requestId) {
        try {
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            gs.info('🔒 Revoking certificate: ' + requestId);
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Find certificate record by request ID
            var gr = new GlideRecord('u_certificate_requests');
            gr.addQuery('u_request_id', requestId);
            gr.query();

            if (!gr.next()) {
                gs.error('❌ Certificate request not found: ' + requestId);
                return false;
            }

            var status = gr.getValue('u_status');
            var serialNumber = gr.getValue('u_serial_number');
            var certificate = gr.getValue('u_certificate');
            var awsAccountId = gr.getValue('u_aws_id');
            var awsRoleName = gr.getValue('u_aws_role_name');
            var certName = gr.getValue('u_cert_name') || gr.getValue('u_common_name');

            // Check if certificate is already revoked
            if (status === 'revoked') {
                gs.warn('⚠️ Certificate is already revoked: ' + requestId);
                return true;
            }

            // Check if certificate exists
            if (!serialNumber && !certificate) {
                gs.error('❌ Certificate not found for request: ' + requestId);
                gs.error('   Serial Number: ' + (serialNumber || 'N/A'));
                gs.error('   Certificate Content: ' + (certificate ? 'Present' : 'Missing'));
                return false;
            }

            // Revoke in Vault PKI
            var vaultRevoked = this.revokeInVault(serialNumber, certificate);

            if (!vaultRevoked) {
                gs.error('❌ Failed to revoke certificate in Vault PKI');
                return false;
            }

            // Update KV secret metadata to mark as revoked (if secret exists)
            // Path: secret/metadata/certs/<aws_id>/<aws_role>/<cert_name>
            this._updateKVMetadataRevoked(awsAccountId, awsRoleName, certName);

            // Update database status
            gr.setValue('u_status', 'revoked');
            gr.setValue('work_notes', 'Certificate revoked on ' + new GlideDateTime().getDisplayValue() + '. Revoked by certificate revocation script.');
            gr.update();

            gs.info('✅ Certificate revoked successfully');
            gs.info('   Request ID: ' + requestId);
            gs.info('   Serial Number: ' + (serialNumber || 'N/A'));
            gs.info('   Status updated to: revoked');
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            return true;

        } catch (e) {
            gs.error('❌ Exception during certificate revocation: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Revoke certificate by Serial Number
     * @param {string} serialNumber - Certificate serial number
     * @returns {boolean} True if revocation successful
     */
    revokeCertificateBySerial: function(serialNumber) {
        try {
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            gs.info('🔒 Revoking certificate by serial number: ' + serialNumber);
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Find certificate record by serial number
            var gr = new GlideRecord('u_certificate_requests');
            gr.addQuery('u_serial_number', serialNumber);
            gr.query();

            if (!gr.next()) {
                gs.error('❌ Certificate not found for serial number: ' + serialNumber);
                return false;
            }

            var requestId = gr.getValue('u_request_id');
            var status = gr.getValue('u_status');
            var certificate = gr.getValue('u_certificate');
            var awsAccountId = gr.getValue('u_aws_id');
            var awsRoleName = gr.getValue('u_aws_role_name');
            var certName = gr.getValue('u_cert_name') || gr.getValue('u_common_name');

            // Check if certificate is already revoked
            if (status === 'revoked') {
                gs.warn('⚠️ Certificate is already revoked: ' + requestId);
                return true;
            }

            // Revoke in Vault PKI
            var vaultRevoked = this.revokeInVault(serialNumber, certificate);

            if (!vaultRevoked) {
                gs.error('❌ Failed to revoke certificate in Vault PKI');
                return false;
            }

            // Update KV secret metadata to mark as revoked (if secret exists)
            // Path: secret/metadata/certs/<aws_id>/<aws_role>/<cert_name>
            this._updateKVMetadataRevoked(awsAccountId, awsRoleName, certName);

            // Update database status
            gr.setValue('u_status', 'revoked');
            gr.setValue('work_notes', 'Certificate revoked on ' + new GlideDateTime().getDisplayValue() + '. Revoked by certificate revocation script (serial: ' + serialNumber + ').');
            gr.update();

            gs.info('✅ Certificate revoked successfully');
            gs.info('   Request ID: ' + requestId);
            gs.info('   Serial Number: ' + serialNumber);
            gs.info('   Status updated to: revoked');
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            return true;

        } catch (e) {
            gs.error('❌ Exception during certificate revocation: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    type: 'RevokeCert'
};

