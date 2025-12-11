/**
 * Certificate Rotation Script Include
 * 
 * This script automatically rotates certificates that expire within 30 days.
 * 
 * Features:
 * - Scans all issued certificates for expiration within 30 days
 * - Issues new certificates through Vault PKI
 * - Overwrites original certificate in KV (same path/name for EC2 detection)
 * - Updates certificate information in SNOW table
 * 
 * Flow:
 * 1. Scan certificates expiring within 30 days
 * 2. Issue new cert using same PKI role and info
 * 3. Store to same KV path (overwrites as new version)
 * 4. Update SNOW table with new certificate data
 * 
 * Authentication: Uses same Vault credentials as VaultAPIClient
 */

var CertificateRotation = Class.create();
CertificateRotation.prototype = {
    initialize: function() {
        // Same authentication configuration as VaultAPIClient
        this.VAULT_ADDR = 'https://main-cluster-public-vault-19db5664.417ab8a8.z1.hashicorp.cloud:8200';
        this.VAULT_NAMESPACE = 'admin';
        this.token = null;
        this.tokenExpiry = null;
        this.ROTATION_THRESHOLD_DAYS = 30; // Rotate certificates expiring within 30 days
        this._lastErrorWasCAExpired = false; // Track if last error was CA expiration
        
        // Load HashiCorp credentials (same as VaultAPIClient)
        this._loadHashiCorpCredentials();
    },
    
    /**
     * Load HashiCorp credentials (same as VaultAPIClient)
     * TEMPORARY: Using hardcoded credentials until ServiceNow credentials table is configured
     */
    _loadHashiCorpCredentials: function() {
        try {
            this.HASHICORP_USERNAME = 'servicenow-user';
            this.HASHICORP_PASSWORD = 'ec528';
        } catch (e) {
            this.HASHICORP_USERNAME = 'servicenow-user';
            this.HASHICORP_PASSWORD = 'ec528';
        }
    },

    /**
     * Authenticate to Vault using UserPass (same logic as VaultAPIClient)
     * @returns {boolean} True if authentication successful
     */
    authenticate: function() {
        try {
            this._loadHashiCorpCredentials();
            
            if (!this.HASHICORP_USERNAME || !this.HASHICORP_PASSWORD) {
                gs.error('Vault auth failed: credentials not available');
                return false;
            }

            var r = new sn_ws.RESTMessageV2();
            r.setEndpoint(this.VAULT_ADDR + '/v1/auth/userpass/login/' + encodeURIComponent(this.HASHICORP_USERNAME));
            r.setHttpMethod('POST');
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);

            var payload = { password: this.HASHICORP_PASSWORD };
            r.setRequestBody(JSON.stringify(payload));

            var res = r.execute();
            var code = res.getStatusCode();

            if (code != 200) {
                gs.error('Vault auth failed: HTTP ' + code);
                return false;
            }

            var body = JSON.parse(res.getBody());
            this.token = body.auth.client_token;

            var expiry = new GlideDateTime();
            expiry.addSeconds(3600);
            this.tokenExpiry = expiry;

            return true;

        } catch (e) {
            gs.error('Vault auth exception: ' + e.message);
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
     * @returns {boolean} True if authenticated
     */
    ensureAuthenticated: function() {
        if (this.isTokenValid()) {
            return true;
        }
        return this.authenticate();
    },

    /**
     * Check if certificate expires within rotation threshold (30 days)
     * Based on TTL fields: u_time_to_live or u_ttl_now
     * @param {number} ttlHours - TTL in hours (can be from u_time_to_live or u_ttl_now)
     * @returns {boolean} True if certificate expires within threshold
     */
    isExpiringWithinThreshold: function(ttlHours) {
        try {
            var daysUntilExpiration = ttlHours / 24;
            return ttlHours > 0 && daysUntilExpiration <= this.ROTATION_THRESHOLD_DAYS;
        } catch (e) {
            return false;
        }
    },

    /**
     * Extract owner/username from email or name
     * @param {string} email - User email
     * @param {string} name - User name
     * @returns {string} Owner/username for PKI role
     */
    _extractOwner: function(email, name) {
        var owner = '';
        if (email) {
            var emailParts = email.split('@');
            owner = emailParts[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        } else if (name) {
            owner = name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        } else {
            owner = 'default-owner';
        }
        return owner;
    },

    /**
     * Ensure PKI role exists (same logic as VaultAPIClient)
     * @param {string} owner - Owner name (username)
     * @returns {boolean} True if successful, false otherwise
     */
    _ensurePKIRole: function(owner) {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Cannot create PKI role: authentication failed');
                return false;
            }

            var pkiRolePath = 'pki/roles/' + owner;
            
            // Check if role already exists
            var checkRequest = new sn_ws.RESTMessageV2();
            checkRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + pkiRolePath);
            checkRequest.setHttpMethod('GET');
            checkRequest.setRequestHeader('X-Vault-Token', this.token);
            checkRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var checkResponse = checkRequest.execute();
            var checkStatus = checkResponse.getStatusCode();
            
            if (checkStatus == 200) {
                return true;
            }
            
            if (checkStatus == 404) {
                var createRequest = new sn_ws.RESTMessageV2();
                createRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + pkiRolePath);
                createRequest.setHttpMethod('POST');
                createRequest.setRequestHeader('Content-Type', 'application/json');
                createRequest.setRequestHeader('X-Vault-Token', this.token);
                createRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
                
                var rolePayload = {
                    allowed_domains: '*',
                    allow_subdomains: true,
                    allow_any_name: true,
                    enforce_hostnames: false,
                    ttl: '2160h',
                    max_ttl: '8760h'
                };
                createRequest.setRequestBody(JSON.stringify(rolePayload));
                
                var createResponse = createRequest.execute();
                var createStatus = createResponse.getStatusCode();
                
                if (createStatus == 200 || createStatus == 204) {
                    return true;
                } else {
                    var createResponseBody = createResponse.getBody();
                    gs.error('Failed to create PKI role: HTTP ' + createStatus);
                    try {
                        var createErrorData = JSON.parse(createResponseBody);
                        if (createErrorData.errors && createErrorData.errors.length > 0) {
                            for (var j = 0; j < createErrorData.errors.length; j++) {
                                var createErrorMsg = createErrorData.errors[j];
                                gs.error('PKI role creation error: ' + createErrorMsg);
                                if (createErrorMsg.toLowerCase().indexOf('permission') > -1 || 
                                    createErrorMsg.toLowerCase().indexOf('denied') > -1) {
                                    gs.error('Permission issue. Required policy: path "pki/roles/*" { capabilities = ["create", "read", "update", "list"] }');
                                }
                            }
                        }
                    } catch (parseError) {
                        gs.error('Response: ' + createResponseBody);
                    }
                    return false;
                }
            } else {
                gs.error('Unexpected status checking PKI role: HTTP ' + checkStatus);
                if (checkStatus == 403) {
                    gs.error('Permission denied. Required policy: path "pki/roles/*" { capabilities = ["read"] }');
                }
                return false;
            }
        } catch (e) {
            gs.error('Exception ensuring PKI role: ' + e.message);
            return false;
        }
    },

    /**
     * Issue new certificate using PKI role
     * @param {object} certInfo - Certificate information from record
     * @returns {object|null} Certificate data (certificate, private_key, ca_cert, serial_number, expiration) or null on failure
     */
    _issueNewCertificate: function(certInfo) {
        try {
            var owner = this._extractOwner(certInfo.email, certInfo.name);
            var pkiRoleName = owner;
            
            // Ensure PKI role exists
            if (!this._ensurePKIRole(pkiRoleName)) {
                gs.error('❌ Failed to ensure PKI role: ' + pkiRoleName);
                return null;
            }

            // Prepare PKI request payload
            var ttlHours = parseInt(certInfo.time_to_live) || 8760;
            var pkiTTL = ttlHours + 'h';
            
            var vaultPayload = {
                common_name: certInfo.common_name,
                ttl: pkiTTL
            };
            
            // Add Subject DN fields if provided
            if (certInfo.organization && certInfo.organization.trim()) {
                vaultPayload.organization = certInfo.organization.trim();
            }
            if (certInfo.country && certInfo.country.trim()) {
                vaultPayload.country = certInfo.country.trim().toUpperCase();
            }
            if (certInfo.state_province && certInfo.state_province.trim()) {
                vaultPayload.province = certInfo.state_province.trim();
            }
            if (certInfo.city && certInfo.city.trim()) {
                vaultPayload.locality = certInfo.city.trim();
            }
            
            var pkiPath = 'pki/issue/' + pkiRoleName;
            var request = new sn_ws.RESTMessageV2();
            request.setEndpoint(this.VAULT_ADDR + '/v1/' + pkiPath);
            request.setHttpMethod('POST');
            request.setRequestHeader('Content-Type', 'application/json');
            request.setRequestHeader('X-Vault-Token', this.token);
            request.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            request.setRequestBody(JSON.stringify(vaultPayload));

            var response = request.execute();
            var statusCode = response.getStatusCode();
            var responseBody = response.getBody();

            if (statusCode != 200) {
                gs.error('Certificate issuance failed: HTTP ' + statusCode);
                var errorType = 'unknown';
                var errorDetails = [];
                var caExpirationDate = null;
                var certExpirationDate = null;
                
                try {
                    var errorData = JSON.parse(responseBody);
                    if (errorData.errors && errorData.errors.length > 0) {
                        for (var i = 0; i < errorData.errors.length; i++) {
                            var errorMsg = errorData.errors[i];
                            errorDetails.push(errorMsg);
                            
                            // Check for CA expiration error (specific format: "beyond the expiration of the CA certificate at")
                            if (errorMsg.indexOf('beyond the expiration of the CA certificate') > -1 || 
                                errorMsg.indexOf('exceeds') > -1 && errorMsg.indexOf('CA') > -1) {
                                errorType = 'ca_expired';
                                
                                // Extract CA expiration date from error message
                                var caExpMatch = errorMsg.match(/CA certificate at ([0-9TZ:.-]+)/i);
                                if (caExpMatch && caExpMatch[1]) {
                                    caExpirationDate = caExpMatch[1];
                                }
                                
                                // Extract certificate expiration date
                                var certExpMatch = errorMsg.match(/notAfter of ([0-9TZ:.-]+)/i);
                                if (certExpMatch && certExpMatch[1]) {
                                    certExpirationDate = certExpMatch[1];
                                }
                            }
                            // Check for permission error
                            else if (errorMsg.toLowerCase().indexOf('permission') > -1 || 
                                     errorMsg.toLowerCase().indexOf('denied') > -1 ||
                                     errorMsg.toLowerCase().indexOf('unauthorized') > -1) {
                                errorType = 'permission_denied';
                            }
                            
                            gs.error('Vault error: ' + errorMsg);
                        }
                    } else {
                        errorDetails.push(responseBody);
                        gs.error('Response: ' + responseBody);
                    }
                } catch (parseError) {
                    errorDetails.push(responseBody);
                    gs.error('Response: ' + responseBody);
                }
                
                // Check for permission errors more specifically
                if (statusCode == 403) {
                    gs.error('========================================');
                    gs.error('❌ PERMISSION DENIED (HTTP 403)');
                    gs.error('========================================');
                    gs.error('Required permissions for certificate rotation:');
                    gs.error('');
                    gs.error('PKI Operations:');
                    gs.error('  path "pki/roles/*" { capabilities = ["create", "read", "update", "list"] }');
                    gs.error('  path "pki/issue/*" { capabilities = ["create", "update"] }');
                    gs.error('  path "pki/issuers/*" { capabilities = ["list", "read", "delete"] }');
                    gs.error('');
                    gs.error('KV Operations:');
                    gs.error('  path "secret/data/certs/*" { capabilities = ["create", "read", "update", "delete"] }');
                    gs.error('  path "secret/metadata/certs/*" { capabilities = ["read", "list"] }');
                    gs.error('');
                    gs.error('⚠️ Missing "delete" capability on secret/data/certs/* will prevent certificate deletion');
                    gs.error('========================================');
                }
                
                // Add specific error guidance
                if (errorType === 'ca_expired') {
                    gs.error('========================================');
                    gs.error('❌ CA CERTIFICATE EXPIRATION DETECTED');
                    gs.error('========================================');
                    if (caExpirationDate) {
                        gs.error('Intermediate CA Expiration: ' + caExpirationDate);
                    }
                    if (certExpirationDate) {
                        gs.error('Requested Cert Expiration: ' + certExpirationDate);
                    }
                    gs.error('');
                    gs.error('⚠️ CRITICAL: Certificate rotation BLOCKED');
                    gs.error('Any TTL > (now to CA expiration) will be rejected.');
                    gs.error('');
                    gs.error('✅ ACTION REQUIRED: Renew Intermediate CA FIRST');
                    gs.error('You MUST renew Intermediate CA before rotation can proceed.');
                    gs.error('');
                    gs.error('Steps to renew Intermediate CA:');
                    gs.error('1. Delete old Intermediate Issuer (use deleteIntermediateIssuer function)');
                    gs.error('   Example: rotationService.deleteIntermediateIssuer("pki", "issuer-ref-id")');
                    gs.error('   Note: This does NOT affect root CA or mount path');
                    gs.error('2. Generate new intermediate key + CSR (min 40 days)');
                    gs.error('3. Sign intermediate with root/upper CA');
                    gs.error('4. Upload signed certificate to intermediate mount');
                    gs.error('5. Recreate PKI role (e.g., ' + pkiRoleName + ')');
                    gs.error('');
                    gs.error('After CA renewal:');
                    gs.error('- New CA expiration will be extended (years)');
                    gs.error('- Certificate rotation can proceed normally');
                    gs.error('- 40+ days TTL will work without errors');
                    gs.error('- Future rotations will not hit CA expiration');
                    gs.error('');
                    gs.error('❌ Rotation ABORTED - Renew CA first, then retry rotation');
                    gs.error('========================================');
                    // Store CA expiration flag for caller to check
                    this._lastErrorWasCAExpired = true;
                } else if (errorType === 'permission_denied') {
                    gs.error('Permission denied. Required policy:');
                    gs.error('  path "pki/issue/*" { capabilities = ["create", "update"] }');
                    gs.error('  path "pki/roles/*" { capabilities = ["create", "read", "update", "list"] }');
                } else if (statusCode == 403) {
                    gs.error('HTTP 403 Forbidden. Check PKI permissions:');
                    gs.error('  path "pki/issue/*" { capabilities = ["create", "update"] }');
                }
                
                return null;
            }

            var data = JSON.parse(response.getBody()).data;
            var caCertStr = data.issuing_ca || (data.ca_chain && data.ca_chain.length > 0 ? data.ca_chain.join('\n') : '');
            
            return {
                certificate: data.certificate,
                private_key: data.private_key,
                ca_cert: caCertStr,
                serial_number: data.serial_number,
                expiration: data.expiration
            };

        } catch (e) {
            gs.error('Exception issuing certificate: ' + e.message);
            return null;
        }
    },

    /**
     * List all issuers in PKI mount
     * @param {string} pkiMount - PKI mount path (e.g., 'pki' or 'pki_int')
     * @returns {object|null} Object with issuers list or null on failure
     */
    _listPKIIssuers: function(pkiMount) {
        try {
            if (!this.ensureAuthenticated()) {
                return null;
            }

            var listRequest = new sn_ws.RESTMessageV2();
            listRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + pkiMount + '/issuers');
            listRequest.setHttpMethod('GET');
            listRequest.setRequestHeader('X-Vault-Token', this.token);
            listRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var listResponse = listRequest.execute();
            var listStatus = listResponse.getStatusCode();
            
            if (listStatus == 200) {
                var listData = JSON.parse(listResponse.getBody()).data;
                return listData;
            } else {
                gs.error('Failed to list issuers: HTTP ' + listStatus);
                return null;
            }
        } catch (e) {
            gs.error('Exception listing issuers: ' + e.message);
            return null;
        }
    },

    /**
     * Delete Intermediate CA Issuer
     * This deletes the old intermediate issuer (step 1 of CA renewal)
     * @param {string} pkiMount - PKI mount path (e.g., 'pki' or 'pki_int')
     * @param {string} issuerRef - Issuer reference/ID to delete (optional, if not provided, will list and delete intermediate issuers)
     * @returns {boolean} True if successful, false otherwise
     */
    deleteIntermediateIssuer: function(pkiMount, issuerRef) {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('Cannot delete issuer: authentication failed');
                return false;
            }

            pkiMount = pkiMount || 'pki'; // Default to 'pki' mount
            
            // If issuerRef not provided, list issuers to find intermediate ones
            if (!issuerRef) {
                gs.info('Listing issuers in ' + pkiMount + ' mount...');
                var issuersData = this._listPKIIssuers(pkiMount);
                if (!issuersData || !issuersData.keys || issuersData.keys.length === 0) {
                    gs.error('No issuers found in ' + pkiMount + ' mount');
                    return false;
                }
                
                gs.info('Found ' + issuersData.keys.length + ' issuer(s)');
                // For now, use the first issuer (user should specify issuerRef for safety)
                gs.warn('No issuerRef provided. Please specify issuerRef to delete specific issuer.');
                gs.warn('Available issuers: ' + issuersData.keys.join(', '));
                return false;
            }

            gs.info('Deleting Intermediate CA Issuer: ' + issuerRef + ' from ' + pkiMount + ' mount');
            
            var deleteRequest = new sn_ws.RESTMessageV2();
            deleteRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + pkiMount + '/issuer/' + encodeURIComponent(issuerRef));
            deleteRequest.setHttpMethod('DELETE');
            deleteRequest.setRequestHeader('X-Vault-Token', this.token);
            deleteRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var deleteResponse = deleteRequest.execute();
            var deleteStatus = deleteResponse.getStatusCode();
            
            if (deleteStatus == 200 || deleteStatus == 204) {
                gs.info('Intermediate CA Issuer deleted successfully: ' + issuerRef);
                return true;
            } else {
                var errorBody = deleteResponse.getBody();
                gs.error('Failed to delete issuer: HTTP ' + deleteStatus);
                try {
                    var errorData = JSON.parse(errorBody);
                    if (errorData.errors && errorData.errors.length > 0) {
                        for (var i = 0; i < errorData.errors.length; i++) {
                            gs.error('Error: ' + errorData.errors[i]);
                        }
                    }
                } catch (parseError) {
                    gs.error('Response: ' + errorBody);
                }
                return false;
            }
        } catch (e) {
            gs.error('Exception deleting issuer: ' + e.message);
            return false;
        }
    },

    /**
     * Delete certificate from KV path
     * Path format: secret/data/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/<CERT_NAME>
     * @param {string} kvPath - KV path (without /v1/ prefix)
     * @returns {boolean} True if successful or if certificate doesn't exist, false on error
     */
    _deleteCertificateFromKV: function(kvPath) {
        try {
            if (!this.ensureAuthenticated()) {
                return false;
            }

            var kvRequest = new sn_ws.RESTMessageV2();
            kvRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + kvPath);
            kvRequest.setHttpMethod('DELETE');
            kvRequest.setRequestHeader('X-Vault-Token', this.token);
            kvRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var kvResponse = kvRequest.execute();
            var kvStatus = kvResponse.getStatusCode();
            
            return (kvStatus == 204 || kvStatus == 404);
        } catch (e) {
            return true; // Don't fail on delete errors
        }
    },

    /**
     * Store certificate to KV path (overwrites existing version)
     * Path format: secret/data/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/<CERT_NAME>
     * @param {string} kvPath - KV path (without /v1/ prefix)
     * @param {string} certificate - Certificate content
     * @param {string} privateKey - Private key content
     * @param {string} caCert - CA certificate content
     * @param {string} serialNumber - Certificate serial number
     * @returns {boolean} True if successful, false otherwise
     */
    _storeCertificateToKV: function(kvPath, certificate, privateKey, caCert, serialNumber) {
        try {
            if (!this.ensureAuthenticated()) {
                return false;
            }

            var kvData = {
                certificate: certificate,
                private_key: privateKey,
                ca_cert: caCert || ''
            };
            
            if (serialNumber) {
                kvData.serial_number = serialNumber;
            }

            var kvRequest = new sn_ws.RESTMessageV2();
            kvRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + kvPath);
            kvRequest.setHttpMethod('POST');
            kvRequest.setRequestHeader('Content-Type', 'application/json');
            kvRequest.setRequestHeader('X-Vault-Token', this.token);
            kvRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var kvPayload = { data: kvData };
            kvRequest.setRequestBody(JSON.stringify(kvPayload));
            
            var kvResponse = kvRequest.execute();
            var kvStatus = kvResponse.getStatusCode();
            
            if (kvStatus == 200 || kvStatus == 204) {
                return true;
            } else {
                gs.error('Failed to store certificate: HTTP ' + kvStatus);
                return false;
            }
        } catch (e) {
            gs.error('Exception storing certificate: ' + e.message);
            return false;
        }
    },

    /**
     * Rotate a single certificate
     * @param {GlideRecord} gr - Certificate request record
     * @returns {object} Result object with success flag and details
     */
    rotateCertificate: function(gr) {
        try {
            var requestId = gr.getValue('u_request_id');
            var commonName = gr.getValue('u_common_name');
            var certName = gr.getValue('u_cert_name') || commonName;
            var awsAccountId = gr.getValue('u_aws_id');
            var awsRoleName = gr.getValue('u_aws_role_name');
            var currentTTL = parseInt(gr.getValue('u_time_to_live')) || 0;
            var currentTTLNow = parseFloat(gr.getValue('u_ttl_now')) || 0;
            
            if (!awsAccountId || !awsRoleName) {
                gs.error('Missing AWS Account ID or Role Name: ' + requestId);
                return { success: false, message: 'Missing AWS Account ID or Role Name' };
            }
            
            if (!certName || certName.trim() === '') {
                gs.error('Certificate name required: ' + requestId);
                return { success: false, message: 'Certificate name is required' };
            }
            
            // Extract certificate information for PKI request
            var certInfo = {
                common_name: commonName,
                name: gr.getValue('u_name') || '',
                email: gr.getValue('u_email') || '',
                organization: gr.getValue('u_organization') || '',
                country: gr.getValue('u_country') || '',
                state_province: gr.getValue('u_state_province') || '',
                city: gr.getValue('u_city') || '',
                time_to_live: gr.getValue('u_time_to_live') || '8760'
            };
            
            // Check if TTL is less than 30 days (720 hours)
            // If so, need to renew CA certificate first, then issue new certificate
            var ttlHours = parseInt(certInfo.time_to_live) || 8760;
            var needsCARenewal = ttlHours < 720; // Less than 30 days
            
            if (needsCARenewal) {
                var minTTLForRenewal = 2160; // 90 days in hours
                if (ttlHours < minTTLForRenewal) {
                    certInfo.time_to_live = minTTLForRenewal.toString();
                }
            }
            
            var oldSerialNumber = gr.getValue('u_serial_number');
            this._lastErrorWasCAExpired = false; // Reset flag
            var newCertData = this._issueNewCertificate(certInfo);
            if (!newCertData) {
                var errorMsg = 'Failed to issue new certificate';
                var isCAExpired = this._lastErrorWasCAExpired;
                
                if (isCAExpired) {
                    errorMsg += ' - CA expired or TTL exceeds CA validity';
                    gs.error('⚠️ Rotation blocked: Intermediate CA must be renewed first');
                    gs.error('Any TTL > (now to CA expiration date) will be rejected');
                    gs.error('Please renew Intermediate CA before retrying rotation');
                } else if (needsCARenewal) {
                    errorMsg += ' - CA may be expired or TTL exceeds CA validity';
                }
                
                gs.error(errorMsg + ': ' + requestId);
                gs.error('Common Name: ' + commonName + ', TTL: ' + ttlHours + ' hours');
                
                return { 
                    success: false, 
                    message: errorMsg,
                    ca_expired: isCAExpired
                };
            }
            
            var kvPath = 'secret/data/certs/' + awsAccountId + '/' + awsRoleName + '/' + certName;
            
            if (needsCARenewal && oldSerialNumber) {
                this._deleteCertificateFromKV(kvPath);
            }
            
            if (!this._storeCertificateToKV(kvPath, newCertData.certificate, newCertData.private_key, newCertData.ca_cert, newCertData.serial_number)) {
                gs.error('Failed to store certificate to KV: ' + requestId);
                return { success: false, message: 'Failed to store certificate to KV' };
            }
            
            // Calculate TTL based on new certificate's expiration date from Vault
            var finalTTLHours = parseInt(certInfo.time_to_live) || 8760;
            var newTTLHours = Math.floor(finalTTLHours);
            var newTTLNow = finalTTLHours;
            var newExpirationDate = null;
            
            // Parse and set expiration date from Vault response (Unix timestamp in seconds)
            if (newCertData.expiration) {
                try {
                    // Vault returns expiration as Unix timestamp (seconds since epoch)
                    var expirationTimestamp = parseInt(newCertData.expiration);
                    if (expirationTimestamp) {
                        var now = new GlideDateTime();
                        // Convert Unix timestamp (seconds) to milliseconds
                        var expirationMs = expirationTimestamp * 1000;
                        newExpirationDate = new GlideDateTime();
                        newExpirationDate.setNumericValue(expirationMs);
                        
                        // Calculate remaining TTL from expiration date (same logic as CheckTTL)
                        var diffMs = expirationMs - now.getNumericValue();
                        var ttlHoursFromExpiration = diffMs / (1000 * 60 * 60);
                        
                        // Use calculated TTL from expiration date
                        if (ttlHoursFromExpiration > 0) {
                            newTTLNow = ttlHoursFromExpiration < 1 ? 
                                Math.round(ttlHoursFromExpiration * 100) / 100 : 
                                Math.floor(ttlHoursFromExpiration);
                        } else {
                            newTTLNow = 0;
                        }
                    }
                } catch (e) {
                    gs.warn('Failed to parse expiration date, using requested TTL: ' + e.message);
                }
            }
            
            var now = new GlideDateTime();
            
            // Update all certificate fields with new certificate data
            gr.setValue('u_certificate', newCertData.certificate);
            gr.setValue('u_private_key', newCertData.private_key);
            gr.setValue('u_ca_chain', newCertData.ca_cert);
            gr.setValue('u_serial_number', newCertData.serial_number);
            gr.setValue('u_time_to_live', newTTLHours);
            gr.setValue('u_ttl_now', newTTLNow);
            gr.setValue('u_status', 'issued');
            
            // CRITICAL: Update u_expiration_date with new certificate's expiration date
            // This ensures CheckTTL can recalculate u_ttl_now correctly based on new expiration
            if (newExpirationDate) {
                gr.setValue('u_expiration_date', newExpirationDate);
                gs.info('✅ Updated u_expiration_date: ' + newExpirationDate.getDisplayValue() + ', u_ttl_now: ' + newTTLNow + ' hours');
            } else {
                gs.warn('⚠️ No expiration date available from Vault for certificate: ' + requestId);
            }
            var workNotes = needsCARenewal ? 
                'Certificate renewed (CA renewal) on ' + now.getDisplayValue() :
                'Certificate rotated on ' + now.getDisplayValue();
            workNotes += '. Old Serial: ' + (oldSerialNumber || 'N/A');
            workNotes += ', New Serial: ' + newCertData.serial_number;
            workNotes += ', TTL: ' + newTTLHours + 'h';
            workNotes += ', Path: ' + kvPath;
            
            var existingWorkNotes = gr.getValue('work_notes') || '';
            if (existingWorkNotes) {
                workNotes = existingWorkNotes + '\n' + workNotes;
            }
            gr.setValue('work_notes', workNotes);
            gr.update();
            
            return {
                success: true,
                serial_number: newCertData.serial_number,
                ttl_hours: newTTLHours,
                ttl_now: newTTLNow,
                kv_path: kvPath
            };
            
        } catch (e) {
            gs.error('Exception rotating certificate: ' + e.message);
            return { success: false, message: 'Exception: ' + e.message };
        }
    },

    /**
     * Rotate all certificates expiring within threshold (30 days)
     * @returns {object} Summary object with statistics
     */
    rotateAllCertificates: function() {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('Certificate rotation failed: Authentication failed');
                return { success: false, message: 'Authentication failed' };
            }
            
            var gr = new GlideRecord('u_certificate_requests');
            gr.addQuery('u_status', 'issued');
            gr.addNotNullQuery('u_certificate');
            gr.addNotNullQuery('u_cert_name');
            gr.addQuery('u_time_to_live', '>', 0);
            gr.orderByDesc('u_time_to_live');
            gr.query();
            
            var totalCount = gr.getRowCount();
            if (totalCount === 0) {
                return { success: true, totalChecked: 0, rotated: 0, skipped: 0, errors: 0 };
            }
            
            var rotatedCount = 0;
            var skippedCount = 0;
            var errorCount = 0;
            
            while (gr.next()) {
                var requestId = gr.getValue('u_request_id');
                var ttlHours = parseInt(gr.getValue('u_time_to_live')) || 0;
                var ttlNow = parseFloat(gr.getValue('u_ttl_now')) || ttlHours;
                var currentTTL = ttlNow > 0 ? ttlNow : ttlHours;
                
                if (currentTTL <= 0) {
                    skippedCount++;
                    continue;
                }
                
                if (!this.isExpiringWithinThreshold(currentTTL)) {
                    skippedCount++;
                    continue;
                }
                
                var result = this.rotateCertificate(gr);
                if (result.success) {
                    rotatedCount++;
                } else {
                    errorCount++;
                    // If CA expired, stop processing and alert
                    if (result.ca_expired) {
                        gs.error('');
                        gs.error('========================================');
                        gs.error('⚠️ ROTATION STOPPED DUE TO CA EXPIRATION');
                        gs.error('========================================');
                        gs.error('Intermediate CA certificate is expired or expiring soon.');
                        gs.error('Certificate rotation cannot proceed until CA is renewed.');
                        gs.error('');
                        gs.error('Remaining certificates will be skipped.');
                        gs.error('Please renew Intermediate CA and retry rotation.');
                        gs.error('========================================');
                        gs.error('');
                        // Stop processing more certificates when CA is expired
                        break;
                    }
                }
            }
            
            gs.info('Certificate rotation completed: ' + rotatedCount + ' rotated, ' + skippedCount + ' skipped, ' + errorCount + ' errors');
            
            return {
                success: true,
                totalChecked: totalCount,
                rotated: rotatedCount,
                skipped: skippedCount,
                errors: errorCount
            };
            
        } catch (e) {
            gs.error('Critical error in certificate rotation: ' + e.message);
            return { success: false, message: 'Exception: ' + e.message };
        }
    },

    type: 'CertificateRotation'
};

