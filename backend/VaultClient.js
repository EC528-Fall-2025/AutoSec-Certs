var VaultClient = Class.create();
VaultClient.prototype = Object.extendsObject(AbstractAjaxProcessor, {

    /**
     * === MAIN ENTRY POINT ===
     * This function is called from the Client Script (frontend).
     * DO NOT rename or remove this function, since the frontend calls it directly via GlideAjax('VaultClient').
     *
     * Responsibilities:
     * 1. Parse request data from frontend
     * 2. Check if existing credentials exist (reuse or generate new)
     * 3. Save the certificate request into table 'u_certificate_requests'
     * 4. Return JSON response to frontend (used for displaying results)
     */
    submitCertificateRequest: function(directData) {
        gs.info('=== VaultClient: submitCertificateRequest called ===');
        
        try {
            var data;
            // The frontend sends 'sysparm_data' as a JSON string — do not change this logic.
            if (directData) {
                data = directData;
                gs.debug('Using directData: ' + JSON.stringify(data));
            } else {
                var dataStr = this.getParameter('sysparm_data');
                gs.debug('Parsing sysparm_data: ' + dataStr);
                if (dataStr) {
                data = JSON.parse(dataStr);
                } else {
                    data = {};
                }
            }

            // Validate data object
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid data format: data is not an object. Received: ' + typeof data);
            }

            // Debug: Log all received data
            try {
                var dataKeys = Object.keys(data);
                gs.info('Received data keys: ' + dataKeys.join(', '));
                gs.info('Received data: ' + JSON.stringify(data));
            } catch (e) {
                gs.error('Failed to log data: ' + e.message);
                gs.info('Data type: ' + typeof data);
            }

            var requestId = 'CERT-' + new GlideDateTime().getNumericValue();
            var currentTime = new GlideDateTime();
            
            // Extract data with fallback for different field name formats
            var iamRoleArn = data.u_iam_role_arn || data.iam_role_arn || data.iamRoleArn || ''; // Optional field
            var commonName = data.u_common_name || data.common_name || data.commonName || data.cn;
            var certName = data.u_cert_name || data.cert_name || data.certName || ''; // Optional field
            var email = data.u_email || data.email;
            var name = data.u_name || data.name || '';
            var organization = data.u_organization || data.organization || '';
            var country = data.u_country || data.country || '';
            var stateProvince = data.u_state_province || data.state_province || data.state || '';
            var city = data.u_city || data.city || '';
            var timeToLive = parseInt(data.u_time_to_live || data.time_to_live || 8760);
            var awsId = data.u_aws_id || data.aws_id || '';
            var awsRoleName = data.u_aws_role_name || data.aws_role_name || '';
            
            // Validate required fields
            if (!email) {
                throw new Error('Email is required but was not provided');
            }
            if (!commonName) {
                throw new Error('Common Name is required but was not provided');
            }
            if (!name) {
                throw new Error('User\'s Full Name is required but was not provided');
            }
            if (!organization) {
                throw new Error('Organization is required but was not provided');
            }
            if (!country) {
                throw new Error('Country is required but was not provided');
            }
            if (!stateProvince) {
                throw new Error('State/Province is required but was not provided');
            }
            if (!city) {
                throw new Error('City is required but was not provided');
            }
            if (!awsId) {
                throw new Error('AWS Account ID is required but was not provided');
            }
            if (!awsRoleName) {
                throw new Error('AWS Role Name is required but was not provided');
            }
            
            // Generate IAM Role ARN from AWS ID and Role Name if not provided
            if (!iamRoleArn && awsId && awsRoleName) {
                iamRoleArn = 'arn:aws:iam::' + awsId + ':role/' + awsRoleName;
                gs.info('Generated IAM Role ARN from AWS ID and Role Name: ' + iamRoleArn);
            }
            
            gs.info('Processing request for AWS Account ID: ' + awsId + ', Role Name: ' + awsRoleName + ', CN: ' + commonName + ', Email: ' + email);

            // === Check for duplicate certificate name ===
            // Check if the same user has already requested a certificate with the same cert_name in the same AWS account
            if (certName && certName.trim()) {
                var duplicateCheck = this._checkDuplicateCertificateName(email, certName.trim(), awsId);
                if (duplicateCheck.isDuplicate) {
                    var errorMsg = 'A certificate with the name "' + certName.trim() + '" already exists for your account (' + email + ') in AWS Account ' + awsId + '.';
                    if (duplicateCheck.existingRequestId) {
                        errorMsg += ' Existing request ID: ' + duplicateCheck.existingRequestId + '.';
                    }
                    errorMsg += ' Please use a different certificate name.';
                    gs.error('❌ Duplicate certificate name detected: ' + errorMsg);
                    throw new Error(errorMsg);
                }
            }

            // === Existing user credentials ===
            var existingCredentials = this._getExistingCredentials(email);
            var credentials;
            
            if (existingCredentials) {
                credentials = existingCredentials;
                gs.info('✅ Reusing existing credentials');
            } else {
                credentials = this._generatePortalCredentials(email);
                gs.info('✅ Generated new credentials');
            }

            // === Check for existing AppRole or create new one ===
            // NOTE: AppRole creation is OPTIONAL in the new certificate issuance logic.
            // New logic stores certificates at: secret/data/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/<CERT_NAME>
            // Certificates are accessed via AWS IAM Role, not user AppRole.
            // AppRole is kept here for backward compatibility and potential future use cases.
            var existingAppRole = this._getExistingAppRole(email);
            var approleInfo = null;
            
            if (!existingAppRole) {
                // New user - create AppRole (optional, for backward compatibility)
                var username = this._extractUsername(email);
                gs.info('🔐 Creating new AppRole for user: ' + username + ' (optional, for backward compatibility)');
                
                // Use VaultAPIClient as compatibility layer for AppRole creation
                // (AppRole creation is not in the new modular services)
                approleInfo = this._createUserAppRoleWithFallback(username);
                
                if (!approleInfo) {
                    gs.warn('⚠️ Failed to create AppRole, continuing without AppRole (certificates will be stored via AWS IAM Role)');
                } else {
                    gs.info('✅ AppRole created successfully: ' + approleInfo.approle_name + ' (optional, certificates accessed via AWS IAM Role)');
                }
            } else {
                approleInfo = existingAppRole;
                try {
                    var usernameForPolicy = this._extractUsername(email);
                    // Use VaultAPIClient as compatibility layer for AppRole policy update
                    this._ensureUserAppRolePolicyWithFallback(usernameForPolicy, approleInfo.approle_name);
                } catch (exPolicy) {
                    gs.warn('⚠️ Unable to ensure AppRole policy for existing user: ' + exPolicy.message);
                }
                gs.info('✅ Reusing existing AppRole: ' + approleInfo.approle_name + ' (optional, certificates accessed via AWS IAM Role)');
            }

            // === Create new database record ===
            var gr = new GlideRecord('u_certificate_requests');
            gr.initialize();
            gr.u_request_id = requestId;
            
            // PKI Information
            gr.u_name = name;
            gr.u_common_name = commonName;
            gr.u_cert_name = certName || '';
            gr.u_organization = organization;
            gr.u_country = country.toUpperCase();
            gr.u_state_province = stateProvince;
            gr.u_city = city;
            gr.u_time_to_live = timeToLive;
            
            // AWS Access
            if (iamRoleArn) {
                gr.u_iam_role_arn = iamRoleArn;
            }
            gr.u_aws_id = awsId;
            gr.u_aws_role_name = awsRoleName;
            
            // User Feedback
            gr.u_email = email;
            
            // Status and timestamps
            gr.u_status = 'pending';
            gr.u_time = currentTime;
            gr.u_notification_status = 'Unsent';

            gr.u_portal_username = credentials.username;
            // ⚠️ DO NOT remove or change this line – field encryption/decryption depends on setDisplayValue()
            gr.u_portal_password.setDisplayValue(credentials.password);
            
            // Save AppRole information if available
            if (approleInfo) {
                gr.u_user_approle_name = approleInfo.approle_name;
                gr.u_user_role_id.setDisplayValue(approleInfo.role_id);
                gr.u_user_secret_id.setDisplayValue(approleInfo.secret_id);
            }
            
            var sysId = gr.insert();
            
            if (!sysId) {
                throw new Error('Failed to insert record into database');
            }
            
            gs.info('✅ Saved to database with sys_id: ' + sysId);
            
            // === Build response object for frontend ===
            var result = {
                status: 'success',
                message: 'Certificate request saved successfully',
                request_id: requestId,
                sys_id: sysId.toString(),
                received_time: currentTime.getDisplayValue(),
                is_new_user: !existingCredentials,
                credentials: {
                    username: credentials.username,
                    password: credentials.password,
                    portal_url: gs.getProperty('glide.servlet.uri') + 'sp?id=cert_status_portal'
                }
            };
            
            gs.info('✅ Request processed successfully');
            return JSON.stringify(result);
            
        } catch (e) {
            gs.error('❌ Error in submitCertificateRequest');
            gs.error('Message: ' + e.message);
            gs.error('Stack: ' + e.stack);
            
            return JSON.stringify({
                status: 'error',
                message: 'Server error: ' + e.message
            });
        }
    },

    // ===========================
    // DO NOT CHANGE FUNCTIONS BELOW
    // ===========================
    /**
     * Looks up the most recent credential for the user by email.
     * If found, returns decrypted username/password.
     * Used to reuse credentials for returning users.
     *
     * ⚠️ Frontend and business logic depend on this exact behavior.
     * ⚠️ Do not modify query logic or field names.
     */
    _getExistingCredentials: function(email) {
        try {
            var gr = new GlideRecord('u_certificate_requests');
            gr.addQuery('u_portal_username', email);
            gr.orderByDesc('sys_created_on');
            gr.setLimit(1);
            gr.query();
            
            if (gr.next()) {
                var password = gr.u_portal_password.getDecryptedValue();
                
                if (password) {
                    return {
                        username: email,
                        password: password
                    };
                }
            }
            return null;
        } catch (e) {
            gs.error('Error in _getExistingCredentials: ' + e.message);
            return null;
        }
    },

    /**
     * Generates new portal credentials for first-time users.
     * Safe to modify password rules, but not the return format.
     */
    _generatePortalCredentials: function(email) {
        try {
            var username = email;
            var password = this._generateRandomPassword(12);
            
            gs.info('Generated credentials for: ' + email);
            
            return {
                username: username,
                password: password
            };
        } catch (e) {
            gs.error('Error in _generatePortalCredentials: ' + e.message);
            throw e;
        }
    },

    /**
     * Random password generator utility.
     * You can adjust the charset or length if security policy requires.
     */
    _generateRandomPassword: function(length) {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        var password = '';
        for (var i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    },

    /**
     * Extract username from email address
     * Example: "alice@example.com" -> "alice"
     * @param {string} email - Email address
     * @returns {string} Username part of email
     */
    _extractUsername: function(email) {
        if (!email) {
            return 'user';
        }
        var atIndex = email.indexOf('@');
        if (atIndex > 0) {
            var username = email.substring(0, atIndex);
            // Sanitize username: remove special characters, keep only alphanumeric and hyphens
            username = username.replace(/[^a-zA-Z0-9-]/g, '-');
            // Ensure it's not empty
            if (username.length === 0) {
                username = 'user';
            }
            return username.toLowerCase();
        }
        // If no @ found, sanitize the whole string
        return email.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() || 'user';
    },

    /**
     * Looks up existing AppRole for a user by email
     * Returns AppRole info if found, null otherwise
     * @param {string} email - User email
     * @returns {object|null} Object with approle_name, role_id, secret_id, or null
     */
    _getExistingAppRole: function(email) {
        try {
            var gr = new GlideRecord('u_certificate_requests');
            gr.addQuery('u_email', email);
            gr.addNotNullQuery('u_user_approle_name');
            gr.orderByDesc('sys_created_on');
            gr.setLimit(1);
            gr.query();
            
            if (gr.next()) {
                var approleName = gr.getValue('u_user_approle_name');
                var roleId = gr.u_user_role_id.getDecryptedValue();
                var secretId = gr.u_user_secret_id.getDecryptedValue();
                
                if (approleName && roleId && secretId) {
                    // Verify AppRole actually exists in Vault
                    if (this._verifyAppRoleExistsInVault(approleName)) {
                        gs.debug('✅ Found existing AppRole in Vault: ' + approleName);
                        return {
                            approle_name: approleName,
                            role_id: roleId,
                            secret_id: secretId
                        };
                    } else {
                        gs.warn('⚠️ AppRole found in database but not in Vault: ' + approleName + ', will recreate');
                        return null;
                    }
                }
            }
            return null;
        } catch (e) {
            gs.error('Error in _getExistingAppRole: ' + e.message);
            return null;
        }
    },

    /**
     * Verify that an AppRole actually exists in Vault
     * @param {string} approleName - AppRole name to verify
     * @returns {boolean} True if AppRole exists in Vault, false otherwise
     */
    _verifyAppRoleExistsInVault: function(approleName) {
        try {
            var vaultAPIClient = new VaultAPIClient();
            if (!vaultAPIClient.ensureAuthenticated()) {
                gs.warn('⚠️ Cannot verify AppRole existence: authentication failed');
                return false;
            }

            var checkRequest = new sn_ws.RESTMessageV2();
            checkRequest.setEndpoint(vaultAPIClient.VAULT_ADDR + '/v1/auth/approle/role/' + approleName);
            checkRequest.setHttpMethod('GET');
            checkRequest.setRequestHeader('X-Vault-Token', vaultAPIClient.token);
            checkRequest.setRequestHeader('X-Vault-Namespace', vaultAPIClient.VAULT_NAMESPACE);

            var checkResponse = checkRequest.execute();
            var checkStatus = checkResponse.getStatusCode();

            if (checkStatus == 200) {
                return true;
            } else if (checkStatus == 404) {
                return false;
            } else {
                gs.warn('⚠️ Unexpected status when checking AppRole ' + approleName + ': HTTP ' + checkStatus);
                return false;
            }
        } catch (e) {
            gs.warn('⚠️ Exception verifying AppRole existence: ' + e.message);
            return false;
        }
    },

    /**
     * === SAFE EXTENSION POINT ===
     * can add a new private function here (e.g. _sendToVault)
     * for integration with HashiCorp Vault or external APIs.
     * Example:
     *    _sendToVault: function(requestData) {
     *        // Make REST call to HashiCorp Vault
     *    }
     *
     * Just make sure NOT to modify the function signatures above.
     */

    /**
     * Create user AppRole with fallback to VaultAPIClient (compatibility layer)
     * Note: AppRole creation is not in the new modular services, so we use VaultAPIClient
     * @param {string} username - Username extracted from email
     * @returns {object|null} AppRole info or null on failure
     */
    _createUserAppRoleWithFallback: function(username) {
        try {
            // Try using VaultAPIClient (compatibility layer)
            // Note: AppRole creation functionality is not in the new modular services
            // so we continue to use VaultAPIClient for this specific feature
            var vaultAPIClient = new VaultAPIClient();
            var approleInfo = vaultAPIClient.createUserAppRole(username);
            
            if (approleInfo) {
                gs.info('✅ AppRole created using VaultAPIClient (compatibility layer)');
                return approleInfo;
            } else {
                gs.warn('⚠️ AppRole creation failed using VaultAPIClient');
                return null;
            }
        } catch (e) {
            gs.error('❌ Exception in _createUserAppRoleWithFallback: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return null;
        }
    },

    /**
     * Ensure user AppRole policy with fallback to VaultAPIClient (compatibility layer)
     * @param {string} username - Username extracted from email
     * @param {string} approleName - AppRole name
     */
    _ensureUserAppRolePolicyWithFallback: function(username, approleName) {
        try {
            // Try using VaultAPIClient (compatibility layer)
            var vaultAPIClient = new VaultAPIClient();
            if (vaultAPIClient.ensureUserAppRolePolicy) {
                vaultAPIClient.ensureUserAppRolePolicy(username, approleName);
                gs.debug('✅ AppRole policy ensured using VaultAPIClient (compatibility layer)');
            }
        } catch (e) {
            gs.warn('⚠️ Exception in _ensureUserAppRolePolicyWithFallback: ' + e.message);
        }
    },

    /**
     * Check for duplicate certificate name
     * Checks if the same user (email) has already requested a certificate with the same cert_name in the same AWS account
     * @param {string} email - User email
     * @param {string} certName - Certificate name
     * @param {string} awsAccountId - AWS Account ID
     * @returns {object} Object with isDuplicate flag and existingRequestId if duplicate found
     */
    _checkDuplicateCertificateName: function(email, certName, awsAccountId) {
        try {
            var gr = new GlideRecord('u_certificate_requests');
            gr.addQuery('u_email', email);
            gr.addQuery('u_cert_name', certName);
            gr.addQuery('u_aws_id', awsAccountId);
            // Check all statuses except 'failed' (failed requests can be retried with same name)
            gr.addQuery('u_status', '!=', 'failed');
            gr.orderByDesc('sys_created_on');
            gr.setLimit(1);
            gr.query();
            
            if (gr.next()) {
                var existingRequestId = gr.getValue('u_request_id');
                var existingStatus = gr.getValue('u_status');
                gs.warn('⚠️ Duplicate certificate name found:');
                gs.warn('   Email: ' + email);
                gs.warn('   Certificate Name: ' + certName);
                gs.warn('   AWS Account ID: ' + awsAccountId);
                gs.warn('   Existing Request ID: ' + existingRequestId);
                gs.warn('   Existing Status: ' + existingStatus);
                
                return {
                    isDuplicate: true,
                    existingRequestId: existingRequestId,
                    existingStatus: existingStatus
                };
            }
            
            return {
                isDuplicate: false,
                existingRequestId: null,
                existingStatus: null
            };
        } catch (e) {
            gs.error('❌ Error checking duplicate certificate name: ' + e.message);
            // On error, allow the request to proceed (fail open)
            return {
                isDuplicate: false,
                existingRequestId: null,
                existingStatus: null
            };
        }
    },

    /**
     * === MODULAR SERVICES USAGE ===
     * 
     * For certificate issuance, storage, and AWS Auth Role management,
     * use the new modular services:
     * 
     * 1. VaultCertificateService - Certificate issuance
     *    var certService = new VaultCertificateService();
     *    var certData = certService.issueCertificate(commonName, pkiInfo, awsInfo);
     * 
     * 2. VaultKVService - KV storage
     *    var kvService = new VaultKVService();
     *    kvService.storeCertificateToKV(...);
     *    kvService.storeCertificateToAWSKV(...);
     * 
     * 3. VaultAWSAuthService - AWS Auth Role management
     *    var awsAuthService = new VaultAWSAuthService();
     *    awsAuthService.ensureAWSAuthRole(username, awsAccountId, awsRoleName);
     * 
     * Fallback: If new modules fail, VaultAPIClient is available as compatibility layer
     * 
     * Note: AppRole creation (createUserAppRole) is not in the new modules,
     * so it continues to use VaultAPIClient directly.
     */
    
    type: 'VaultClient'
});