var VaultAPIClient = Class.create();
VaultAPIClient.prototype = {
    initialize: function() {
        this.VAULT_ADDR = 'https://main-cluster-public-vault-19db5664.417ab8a8.z1.hashicorp.cloud:8200';
        this.VAULT_NAMESPACE = 'admin';
        // PKI_PATH will be set dynamically based on owner/username
        this.token = null;
        this.tokenExpiry = null;
        
        // Load HashiCorp credentials from ServiceNow credentials table
        this._loadHashiCorpCredentials();
    },
    
    /**
     * Load HashiCorp credentials
     * TEMPORARY: Using hardcoded credentials until ServiceNow credentials table is configured
     * TODO: Replace with credentials table lookup once credentials system is working
     */
    _loadHashiCorpCredentials: function() {
        try {
            // TEMPORARY: Hardcoded credentials (credentials table not working)
            this.HASHICORP_USERNAME = 'servicenow-user';
            this.HASHICORP_PASSWORD = 'ec528';
            gs.info('✅ HashiCorp credentials loaded (hardcoded)');
            gs.info('   Username: ' + this.HASHICORP_USERNAME);
            return;
            
            // Original code below (disabled until credentials table is fixed)
            /*
            // Get credentials using gs.getCredential
            gs.info('🔍 Loading HashiCorp credentials from credentials table...');
            gs.info('   Looking for credential: Hashicorp-Username');
            
            var cred = gs.getCredential('Hashicorp-Username');
            if (cred) {
                gs.info('✅ Credential object found, extracting attributes...');
                
                // For Basic Auth credentials, use getAttribute to get username and password
                var username = cred.getAttribute('user_name');
                var password = cred.getAttribute('password');
                
                // Also try alternative attribute names (some credential types use different names)
                if (!username) {
                    username = cred.getAttribute('username') || '';
                }
                if (!password) {
                    password = cred.getAttribute('pwd') || '';
                }
                
                gs.info('   Username attribute value: ' + (username ? username : 'empty'));
                gs.info('   Password attribute value: ' + (password ? '***' : 'empty'));
                
                this.HASHICORP_USERNAME = username || '';
                this.HASHICORP_PASSWORD = password || '';
                
                if (this.HASHICORP_USERNAME && this.HASHICORP_PASSWORD) {
                    gs.info('✅ HashiCorp credentials loaded successfully');
                    gs.info('   Username: ' + this.HASHICORP_USERNAME);
                } else {
                    gs.error('❌ HashiCorp credentials incomplete in credentials table');
                    gs.error('   Username: ' + (this.HASHICORP_USERNAME || 'empty'));
                    gs.error('   Password: ' + (this.HASHICORP_PASSWORD ? '***' : 'empty'));
                    gs.error('   Please check that both username and password are set in the credential');
                    this.HASHICORP_USERNAME = '';
                    this.HASHICORP_PASSWORD = '';
                }
            } else {
                // Fallback: Try using GlideCredential for Basic Auth Credentials
                gs.info('⚠️ gs.getCredential returned null, trying GlideCredential...');
                try {
                    // Try using GlideCredential class (for Basic Auth Credentials)
                    var glideCred = new GlideCredential();
                    glideCred.setCredential('Hashicorp-Username');
                    
                    if (glideCred.isValid()) {
                        gs.info('✅ Credential found using GlideCredential');
                        
                        // For Basic Auth Credentials, get username and password
                        this.HASHICORP_USERNAME = glideCred.getUsername() || '';
                        this.HASHICORP_PASSWORD = glideCred.getPassword() || '';
                        
                        gs.info('   Username: ' + (this.HASHICORP_USERNAME || 'empty'));
                        gs.info('   Password: ' + (this.HASHICORP_PASSWORD ? '***' : 'empty'));
                        
                        if (this.HASHICORP_USERNAME && this.HASHICORP_PASSWORD) {
                            gs.info('✅ HashiCorp credentials loaded successfully using GlideCredential');
                            return;
                        }
                    }
                } catch (glideError) {
                    gs.warn('⚠️ GlideCredential failed: ' + glideError.message);
                }
                
                // Fallback 2: Try querying credential table (different table names)
                gs.info('⚠️ Trying direct table query...');
                try {
                    // Try different possible table names
                    var tableNames = ['credential', 'sys_credential'];
                    var found = false;
                    
                    for (var i = 0; i < tableNames.length && !found; i++) {
                        try {
                            var grCred = new GlideRecord(tableNames[i]);
                            if (grCred.isValid()) {
                                grCred.addQuery('name', 'Hashicorp-Username');
                                grCred.addQuery('active', true);
                                grCred.query();
                                
                                if (grCred.next()) {
                                    gs.info('✅ Found credential record in ' + tableNames[i] + ' table');
                                    gs.info('   Credential type: ' + grCred.getValue('type'));
                                    
                                    // Try different field names for username and password
                                    var usernameField = grCred.user_name || grCred.username || grCred.user;
                                    var passwordField = grCred.password || grCred.pwd || grCred.pass;
                                    
                                    if (usernameField) {
                                        this.HASHICORP_USERNAME = usernameField.getDecryptedValue() || usernameField.toString() || '';
                                    }
                                    if (passwordField) {
                                        this.HASHICORP_PASSWORD = passwordField.getDecryptedValue() || passwordField.toString() || '';
                                    }
                                    
                                    gs.info('   Username: ' + (this.HASHICORP_USERNAME || 'empty'));
                                    gs.info('   Password: ' + (this.HASHICORP_PASSWORD ? '***' : 'empty'));
                                    
                                    if (this.HASHICORP_USERNAME && this.HASHICORP_PASSWORD) {
                                        gs.info('✅ HashiCorp credentials loaded successfully from table query');
                                        found = true;
                                        return;
                                    }
                                }
                            }
                        } catch (tableError) {
                            gs.debug('   Table ' + tableNames[i] + ' not accessible: ' + tableError.message);
                        }
                    }
                } catch (queryError) {
                    gs.warn('⚠️ Direct table query failed: ' + queryError.message);
                }
                
                gs.error('❌ Hashicorp-Username credential not found in credentials table');
                gs.error('   Please ensure:');
                gs.error('   1. A credential named "Hashicorp-Username" exists');
                gs.error('   2. Credential type is "Basic Auth Credentials"');
                gs.error('   3. Credential is Active');
                gs.error('   4. Both username and password fields are filled');
                this.HASHICORP_USERNAME = '';
                this.HASHICORP_PASSWORD = '';
            }
            */
        } catch (e) {
            gs.error('❌ Exception loading HashiCorp credentials: ' + e.message);
            // Fallback to hardcoded credentials if exception occurs
            this.HASHICORP_USERNAME = 'servicenow-user';
            this.HASHICORP_PASSWORD = 'ec528';
            gs.warn('⚠️ Using hardcoded credentials as fallback');
        }
    },

    authenticate: function() {
        try {
            gs.info('🔐 Authenticating to Vault using UserPass...');

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

    isTokenValid: function() {
        if (!this.token || !this.tokenExpiry) {
            return false;
        }
        var now = new GlideDateTime();
        return now.before(this.tokenExpiry);
    },

    ensureAuthenticated: function() {
        if (this.isTokenValid()) {
            gs.debug('✅ Using existing valid token');
            return true;
        }
        gs.info('⚠️ Token expired or missing, re-authenticating...');
        return this.authenticate();
    },

    /**
     * Issue a new certificate for a common name
     * New logic based on hashicorp-backend-v2.sh:
     * 1. Authenticate using UserPass (username/password from SNOW credentials: Hashicorp-Username, Hashicorp-Password)
     * 2. Create policy for AWS account + role (format: <AWS_ACCOUNT_ID>-<AWS_IAM_ROLE>-policy)
     * 3. Bind AWS IAM Role to Vault AWS auth
     * 4. Create PKI role based on owner/username (pki/roles/<owner>)
     * 5. Generate certificate using PKI role (pki/issue/<owner>)
     * 6. Store certificate to: secret/data/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/<CERT_NAME>
     * 7. Update ALL pending requests with certificate information in table
     * 
     * Credentials: Loaded from ServiceNow credentials table (Hashicorp-Username, Hashicorp-Password)
     * Path format: secret/data/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/<CERT_NAME>
     * Certificate fields: certificate, private_key, ca_cert (from issuing_ca)
     */
    issueCertificate: function(commonName) {
        try {
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            gs.info('📜 Processing certificate request for: ' + commonName);
            gs.info('🆕 Using new certificate issuance logic (hashicorp-backend-v2.sh)');
            
            // 1️⃣ Get PKI information from the first pending request
            var grPKI = new GlideRecord('u_certificate_requests');
            grPKI.addQuery('u_common_name', commonName);
            grPKI.addQuery('u_status', 'pending');
            grPKI.addNullQuery('u_serial_number');
            grPKI.orderBy('sys_created_on');
            grPKI.setLimit(1);
            grPKI.query();
            
            if (!grPKI.next()) {
                gs.error('❌ No pending requests found for common name: ' + commonName);
                this._markAsFailed(commonName, 'No pending requests found');
                return false;
            }
            
            // Extract PKI information
            var pkiName = grPKI.getValue('u_name') || '';
            var pkiCommonName = grPKI.getValue('u_common_name') || commonName;
            var pkiOrganization = grPKI.getValue('u_organization') || '';
            var pkiCountry = grPKI.getValue('u_country') || '';
            var pkiStateProvince = grPKI.getValue('u_state_province') || '';
            var pkiCity = grPKI.getValue('u_city') || '';
            var ttlHours = parseInt(grPKI.getValue('u_time_to_live')) || 8760;
            var pkiTTL = ttlHours + 'h';
            var certName = grPKI.getValue('u_cert_name') || pkiCommonName; // Use cert_name or fallback to common_name
            var ownerAwsAccountId = grPKI.getValue('u_aws_id') || '';
            var ownerAwsRoleName = grPKI.getValue('u_aws_role_name') || '';
            var email = grPKI.getValue('u_email') || '';
            
            // Extract username from email or name
            var owner = '';
            if (email) {
                var emailParts = email.split('@');
                owner = emailParts[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
            } else if (pkiName) {
                owner = pkiName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
            } else {
                owner = 'default-owner';
            }
            
            gs.info('📋 PKI Information:');
            gs.info('   Owner: ' + owner);
            gs.info('   Name: ' + pkiName);
            gs.info('   Common Name: ' + pkiCommonName);
            gs.info('   Certificate Name: ' + certName);
            gs.info('   Organization: ' + pkiOrganization);
            gs.info('   Country: ' + pkiCountry);
            gs.info('   State/Province: ' + pkiStateProvince);
            gs.info('   City: ' + pkiCity);
            gs.info('   TTL: ' + ttlHours + ' hours (' + pkiTTL + ')');
            gs.info('   AWS Account ID: ' + ownerAwsAccountId);
            gs.info('   AWS IAM Role: ' + ownerAwsRoleName);
            
            // Validate required fields
            if (!ownerAwsAccountId || !ownerAwsRoleName) {
                gs.error('❌ AWS Account ID and Role Name are required');
                this._markAsFailed(commonName, 'Missing AWS Account ID or Role Name');
                return false;
            }
            
            // 2️⃣ Authenticate to Vault using UserPass
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Failed to authenticate to Vault');
                this._markAsFailed(commonName, 'Authentication failed');
                return false;
            }

            // 3️⃣ Generate policy for AWS account + role (matching script order)
            var policyName = ownerAwsAccountId + '-' + ownerAwsRoleName + '-policy';
            if (!this._ensureAWSPolicy(policyName, ownerAwsAccountId, ownerAwsRoleName)) {
                gs.error('❌ Failed to create AWS policy: ' + policyName);
                this._markAsFailed(commonName, 'AWS policy creation failed');
                return false;
            }

            // 4️⃣ Bind AWS IAM Role to Vault AWS auth (matching script order)
            if (!this._bindAWSIAMRole(ownerAwsRoleName, ownerAwsAccountId, policyName)) {
                gs.error('❌ Failed to bind AWS IAM Role: ' + ownerAwsRoleName);
                this._markAsFailed(commonName, 'AWS IAM Role binding failed');
                return false;
            }

            // 5️⃣ Create PKI role for the owner (if not exists) (matching script order)
            var pkiRoleName = owner;
            if (!this._ensurePKIRole(pkiRoleName)) {
                gs.error('❌ Failed to create PKI role: ' + pkiRoleName);
                this._markAsFailed(commonName, 'PKI role creation failed');
                return false;
            }

            // 6️⃣ Generate certificate using PKI role
            var vaultPayload = {
                common_name: pkiCommonName,
                ttl: pkiTTL
            };
            
            // Add Subject DN fields if provided
            if (pkiOrganization && pkiOrganization.trim()) {
                vaultPayload.organization = pkiOrganization.trim();
            }
            if (pkiCountry && pkiCountry.trim()) {
                vaultPayload.country = pkiCountry.trim().toUpperCase();
            }
            if (pkiStateProvince && pkiStateProvince.trim()) {
                vaultPayload.province = pkiStateProvince.trim();
            }
            if (pkiCity && pkiCity.trim()) {
                vaultPayload.locality = pkiCity.trim();
            }
            
            var pkiPath = 'pki/issue/' + pkiRoleName;
            var request = new sn_ws.RESTMessageV2();
            request.setEndpoint(this.VAULT_ADDR + '/v1/' + pkiPath);
            request.setHttpMethod('POST');
            request.setRequestHeader('Content-Type', 'application/json');
            request.setRequestHeader('X-Vault-Token', this.token);
            request.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            request.setRequestBody(JSON.stringify(vaultPayload));
            
            gs.info('📤 Vault PKI Request Payload: ' + JSON.stringify(vaultPayload));
            gs.info('📤 PKI Path: ' + pkiPath);

            var response = request.execute();
            var statusCode = response.getStatusCode();
            var responseBody = response.getBody();

            gs.debug('📥 Vault response code: ' + statusCode);

            if (statusCode != 200) {
                gs.error('❌ Certificate issuance failed: ' + statusCode);
                gs.error('Response: ' + responseBody);
                this._markAsFailed(commonName, 'Vault API error (HTTP ' + statusCode + ')');
                return false;
            }

            // 7️⃣ Parse response
            var data = JSON.parse(responseBody).data;
            gs.info('✅ Certificate issued successfully from Vault');
            gs.info('   Serial Number: ' + data.serial_number);

            // 8️⃣ Store certificate to KV path: secret/data/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/<CERT_NAME>
            // Note: KV v2 API uses 'secret/data/' prefix, but vault CLI 'kv put' handles this automatically
            var kvPath = 'secret/data/certs/' + ownerAwsAccountId + '/' + ownerAwsRoleName + '/' + certName;
            // Use issuing_ca (matching hashicorp-backend-v2.sh), fallback to ca_chain if not available
            var caCertStr = data.issuing_ca || (data.ca_chain && data.ca_chain.length > 0 ? data.ca_chain.join('\n') : '');
            
            var kvStored = this._storeCertificateToKV(
                kvPath,
                data.certificate,
                data.private_key,
                caCertStr,
                data.serial_number
            );

            if (!kvStored) {
                gs.error('❌ Failed to store certificate to KV path: ' + kvPath);
                this._markAsFailed(commonName, 'KV storage failed');
                return false;
            }

            // 9️⃣ Update ALL pending requests with the same common name
            var grUpdate = new GlideRecord('u_certificate_requests');
            grUpdate.addQuery('u_common_name', commonName);
            grUpdate.addQuery('u_status', 'pending');
            grUpdate.addNullQuery('u_serial_number');
            grUpdate.query();

            var updateCount = 0;
            while (grUpdate.next()) {
                // Get cert_name for this record (may differ)
                var recordCertName = grUpdate.getValue('u_cert_name') || pkiCommonName;
                var recordAwsAccountId = grUpdate.getValue('u_aws_id') || ownerAwsAccountId;
                var recordAwsRoleName = grUpdate.getValue('u_aws_role_name') || ownerAwsRoleName;
                
                // Update certificate information in table
                grUpdate.setValue('u_certificate', data.certificate);
                grUpdate.setValue('u_private_key', data.private_key);
                grUpdate.setValue('u_ca_chain', caCertStr);
                grUpdate.setValue('u_serial_number', data.serial_number);
                
                // Calculate expiration
                if (data.expiration) {
                    var expiryDate = new GlideDateTime();
                    expiryDate.setNumericValue(data.expiration * 1000);
                    grUpdate.setValue('u_expiration_date', expiryDate);
                    
                    var now = new GlideDateTime();
                    var diffMs = expiryDate.getNumericValue() - now.getNumericValue();
                    var ttlHours = Math.floor(diffMs / (1000 * 60 * 60));
                    grUpdate.setValue('u_time_to_live', ttlHours);
                }
                
                // Build work notes
                var workNotes = 'Certificate issued successfully (Serial: ' + data.serial_number + ')';
                workNotes += ', PKI Role: ' + pkiRoleName;
                workNotes += ', Policy: ' + policyName;
                workNotes += ', AWS IAM Role bound: ' + recordAwsRoleName;
                workNotes += ', Stored to: secret/data/certs/' + recordAwsAccountId + '/' + recordAwsRoleName + '/' + recordCertName;
                
                // If this record has different AWS info, store it separately
                if (recordAwsAccountId !== ownerAwsAccountId || recordAwsRoleName !== ownerAwsRoleName || recordCertName !== certName) {
                    var recordKvPath = 'secret/data/certs/' + recordAwsAccountId + '/' + recordAwsRoleName + '/' + recordCertName;
                    var recordKvStored = this._storeCertificateToKV(
                        recordKvPath,
                        data.certificate,
                        data.private_key,
                        caCertStr,
                        data.serial_number
                    );
                    if (recordKvStored) {
                        workNotes += ' (also stored to record-specific path)';
                    } else {
                        workNotes += ' (record-specific path storage failed)';
                    }
                }
                
                grUpdate.setValue('u_status', 'issued');
                grUpdate.setValue('work_notes', workNotes);
                grUpdate.update();
                updateCount++;
                gs.info('✅ Updated record: ' + grUpdate.getValue('u_request_id'));
            }

            gs.info('✅ Successfully updated ' + updateCount + ' database records');
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            return true;

        } catch (e) {
            gs.error('❌ Exception during certificate issuance: ' + e.message);
            gs.error('Stack: ' + e.stack);
            this._markAsFailed(commonName, 'Exception: ' + e.message);
            return false;
        }
    },

    /**
     * Ensure PKI role exists for the owner
     * Creates PKI role if it doesn't exist
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
                gs.debug('✅ PKI role already exists: ' + owner);
                return true;
            }
            
            // Create PKI role
            if (checkStatus == 404) {
                gs.info('📝 Creating PKI role: ' + owner);
                
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
                    max_ttl: '9000h'
                };
                createRequest.setRequestBody(JSON.stringify(rolePayload));
                
                var createResponse = createRequest.execute();
                var createStatus = createResponse.getStatusCode();
                
                if (createStatus == 200 || createStatus == 204) {
                    gs.info('✅ PKI role created: ' + owner);
                    return true;
                } else {
                    gs.error('❌ Failed to create PKI role: HTTP ' + createStatus);
                    gs.error('Response: ' + createResponse.getBody());
                    return false;
                }
            } else {
                gs.error('❌ Unexpected status when checking PKI role: HTTP ' + checkStatus);
                return false;
            }
        } catch (e) {
            gs.error('❌ Exception ensuring PKI role: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Ensure AWS policy exists for the AWS account + role combination
     * Creates policy if it doesn't exist
     * @param {string} policyName - Policy name (format: <account_id>-<role_name>-policy)
     * @param {string} awsAccountId - AWS Account ID
     * @param {string} awsRoleName - AWS IAM Role Name
     * @returns {boolean} True if successful, false otherwise
     */
    _ensureAWSPolicy: function(policyName, awsAccountId, awsRoleName) {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Cannot create AWS policy: authentication failed');
                return false;
            }

            // Check if policy already exists
            var checkRequest = new sn_ws.RESTMessageV2();
            checkRequest.setEndpoint(this.VAULT_ADDR + '/v1/sys/policies/acl/' + policyName);
            checkRequest.setHttpMethod('GET');
            checkRequest.setRequestHeader('X-Vault-Token', this.token);
            checkRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var checkResponse = checkRequest.execute();
            var checkStatus = checkResponse.getStatusCode();
            
            if (checkStatus == 200) {
                gs.debug('✅ AWS policy already exists: ' + policyName);
                return true;
            }
            
            // Create policy
            if (checkStatus == 404) {
                gs.info('📝 Creating AWS policy: ' + policyName);
                
                // Build HCL policy
                var policyHcl = '# Policy for AWS Account ' + awsAccountId + ', IAM Role ' + awsRoleName + '\n'
                    + '# Allows reading certificates stored in the KV secrets engine\n\n'
                    + 'path "secret/data/certs/' + awsAccountId + '/' + awsRoleName + '/*" {\n'
                    + '  capabilities = ["read", "list"]\n'
                    + '}\n\n'
                    + 'path "secret/metadata/certs/' + awsAccountId + '/' + awsRoleName + '/*" {\n'
                    + '  capabilities = ["read", "list"]\n'
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
                    gs.info('✅ AWS policy created: ' + policyName);
                    return true;
                } else {
                    gs.error('❌ Failed to create AWS policy: HTTP ' + createStatus);
                    gs.error('Response: ' + createResponse.getBody());
                    return false;
                }
            } else {
                gs.error('❌ Unexpected status when checking AWS policy: HTTP ' + checkStatus);
                return false;
            }
        } catch (e) {
            gs.error('❌ Exception ensuring AWS policy: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Bind AWS IAM Role to Vault AWS auth backend
     * @param {string} awsRoleName - AWS IAM Role Name
     * @param {string} awsAccountId - AWS Account ID
     * @param {string} policyName - Policy name to attach
     * @returns {boolean} True if successful, false otherwise
     */
    _bindAWSIAMRole: function(awsRoleName, awsAccountId, policyName) {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Cannot bind AWS IAM Role: authentication failed');
                return false;
            }

            var principalArn = 'arn:aws:iam::' + awsAccountId + ':role/' + awsRoleName;
            var vaultRolePath = 'auth/aws/role/' + awsRoleName;
            
            gs.info('📝 Binding AWS IAM Role: ' + awsRoleName);
            gs.info('   Principal ARN: ' + principalArn);
            gs.info('   Policy: ' + policyName);
            
            var bindRequest = new sn_ws.RESTMessageV2();
            bindRequest.setEndpoint(this.VAULT_ADDR + '/v1/' + vaultRolePath);
            bindRequest.setHttpMethod('POST');
            bindRequest.setRequestHeader('Content-Type', 'application/json');
            bindRequest.setRequestHeader('X-Vault-Token', this.token);
            bindRequest.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            
            var bindPayload = {
                auth_type: 'iam',
                bound_iam_principal_arn: principalArn,
                resolve_aws_unique_ids: false,
                policies: policyName
            };
            bindRequest.setRequestBody(JSON.stringify(bindPayload));
            
            var bindResponse = bindRequest.execute();
            var bindStatus = bindResponse.getStatusCode();
            
            if (bindStatus == 200 || bindStatus == 204) {
                gs.info('✅ AWS IAM Role bound successfully: ' + awsRoleName);
                return true;
            } else {
                gs.error('❌ Failed to bind AWS IAM Role: HTTP ' + bindStatus);
                gs.error('Response: ' + bindResponse.getBody());
                return false;
            }
        } catch (e) {
            gs.error('❌ Exception binding AWS IAM Role: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Store certificate to Vault KV path
     * Path format: secret/data/certs/<AWS_ACCOUNT_ID>/<AWS_IAM_ROLE>/<CERT_NAME>
     * Note: Uses KV v2 API format with 'secret/data/' prefix
     * @param {string} kvPath - KV path (without /v1/ prefix, e.g., 'secret/data/certs/...')
     * @param {string} certificate - Certificate content
     * @param {string} privateKey - Private key content
     * @param {string} caChain - CA chain (optional)
     * @param {string} serialNumber - Certificate serial number
     * @returns {boolean} True if successful, false otherwise
     */
    _storeCertificateToKV: function(kvPath, certificate, privateKey, caChain, serialNumber) {
        try {
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Cannot store certificate: authentication failed');
                return false;
            }

            gs.info('📝 Storing certificate to KV path: ' + kvPath);
            
            // Store certificate data matching hashicorp-backend-v2.sh format
            // Fields: certificate, private_key, ca_cert
            var kvData = {
                certificate: certificate,
                private_key: privateKey,
                ca_cert: caChain || ''
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
            
            // KV v2 format
            var kvPayload = {
                data: kvData
            };
            kvRequest.setRequestBody(JSON.stringify(kvPayload));
            
            var kvResponse = kvRequest.execute();
            var kvStatus = kvResponse.getStatusCode();
            
            if (kvStatus == 200 || kvStatus == 204) {
                gs.info('✅ Certificate stored successfully to: ' + kvPath);
                return true;
            } else {
                gs.error('❌ Failed to store certificate: HTTP ' + kvStatus);
                gs.error('Response: ' + kvResponse.getBody());
                return false;
            }
        } catch (e) {
            gs.error('❌ Exception storing certificate to KV: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return false;
        }
    },

    /**
     * Helper function to mark all pending requests as failed
     */
    _markAsFailed: function(commonName, errorMessage) {
        try {
            var grFail = new GlideRecord('u_certificate_requests');
            grFail.addQuery('u_common_name', commonName);
            grFail.addQuery('u_status', 'pending');
            grFail.query();
            
            var failCount = 0;
            while (grFail.next()) {
                grFail.setValue('u_status', 'failed');
                grFail.setValue('work_notes', errorMessage);
                grFail.update();
                failCount++;
            }
            
            if (failCount > 0) {
                gs.info('⚠️ Marked ' + failCount + ' requests as failed');
            }
        } catch (e) {
            gs.error('❌ Failed to update error status: ' + e.message);
        }
    },

    type: 'VaultAPIClient'
};
