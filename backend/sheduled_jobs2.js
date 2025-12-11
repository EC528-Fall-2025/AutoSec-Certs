/**
 * Certificate Rotation Job
 * 
 * This scheduled job:
 * 1. Authenticates to Vault using servicenow-pki-role
 * 2. Scans all certificates in secret/data/certs/<aws_account_id>/<aws_role_name>/<cert_serial>
 * 3. Checks certificate expiration dates
 * 4. Ensures certificates have at least 10 days validity remaining
 * 5. Triggers certificate renewal if needed
 */

(function() {
    try {
        gs.info('========================================');
        gs.info('=== Certificate Rotation Job START ===');
        gs.info('========================================');
        
        // Vault configuration (same as VaultAPIClient)
        var VAULT_ADDR = 'https://test-cluster-public-vault-fc6745fb.83f0d48a.z1.hashicorp.cloud:8200';
        var VAULT_NAMESPACE = 'admin';
        var ROLE_ID = 'b18378c5-ded6-21bf-6d12-f9225fb8a0a3';
        var SECRET_ID = '89feebc7-70bf-6747-6779-e0b6f9a52de1';
        var MIN_VALIDITY_DAYS = 10; // Minimum days before expiration to trigger renewal
        
        var token = null;
        var tokenExpiry = null;
        
        // Statistics
        var totalCertsScanned = 0;
        var certsNeedingRenewal = 0;
        var certsRenewed = 0;
        var certsFailed = 0;
        var certsUpToDate = 0;
        
        /**
         * Authenticate to Vault using servicenow-pki-role
         */
        function authenticateToVault() {
            try {
                gs.info('🔐 Authenticating to Vault...');
                
                var r = new sn_ws.RESTMessageV2();
                r.setEndpoint(VAULT_ADDR + '/v1/auth/approle/login');
                r.setHttpMethod('POST');
                r.setRequestHeader('Content-Type', 'application/json');
                r.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
                
                var payload = {
                    role_id: ROLE_ID,
                    secret_id: SECRET_ID
                };
                r.setRequestBody(JSON.stringify(payload));
                
                var res = r.execute();
                var code = res.getStatusCode();
                
                if (code != 200) {
                    gs.error('❌ Vault auth failed, HTTP ' + code);
                    return false;
                }
                
                var body = JSON.parse(res.getBody());
                token = body.auth.client_token;
                
                var expiry = new GlideDateTime();
                expiry.addSeconds(3600);
                tokenExpiry = expiry;
                
                gs.info('✅ Vault token acquired, expires at: ' + expiry.getDisplayValue());
                
                // Verify required policies
                if (!verifyRequiredPolicies()) {
                    gs.error('❌ Required policies check failed - authentication aborted');
                    token = null;
                    tokenExpiry = null;
                    return false;
                }
                
                return true;
                
            } catch (e) {
                gs.error('❌ Vault authentication exception: ' + e.message);
                return false;
            }
        }
        
        /**
         * Verify that the current token has all required policies
         */
        function verifyRequiredPolicies() {
            try {
                if (!token) {
                    gs.error('❌ Cannot verify policies: no token available');
                    return false;
                }
                
                var lookupRequest = new sn_ws.RESTMessageV2();
                lookupRequest.setEndpoint(VAULT_ADDR + '/v1/auth/token/lookup-self');
                lookupRequest.setHttpMethod('GET');
                lookupRequest.setRequestHeader('X-Vault-Token', token);
                lookupRequest.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
                
                var lookupResponse = lookupRequest.execute();
                var lookupStatus = lookupResponse.getStatusCode();
                
                if (lookupStatus != 200) {
                    gs.error('❌ Failed to lookup token policies: HTTP ' + lookupStatus);
                    return false;
                }
                
                var tokenData = JSON.parse(lookupResponse.getBody()).data;
                var tokenPolicies = tokenData.policies || [];
                
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
                
                gs.info('📋 Token policies: ' + tokenPolicies.join(', '));
                
                if (missingPolicies.length > 0) {
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
                        return false;
                    } else {
                        gs.warn('⚠️ Missing policies (non-critical): ' + missingPolicies.join(', '));
                    }
                } else {
                    gs.info('✅ All required policies verified');
                }
                
                return true;
                
            } catch (e) {
                gs.error('❌ Exception verifying token policies: ' + e.message);
                return false;
            }
        }
        
        /**
         * List all paths under a given KV path (recursive)
         * @param {string} metadataPath - Metadata path to list (e.g., "secret/metadata/certs")
         * @returns {Array} Array of full data paths (secret/data/certs/...)
         */
        function listKVPaths(metadataPath) {
            var allPaths = [];
            
            try {
                // Vault KV v2 LIST: Use GET with ?list=true on metadata endpoint
                var listRequest = new sn_ws.RESTMessageV2();
                listRequest.setEndpoint(VAULT_ADDR + '/v1/' + metadataPath + '?list=true');
                listRequest.setHttpMethod('GET');
                listRequest.setRequestHeader('X-Vault-Token', token);
                listRequest.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
                
                var listResponse = listRequest.execute();
                var listStatus = listResponse.getStatusCode();
                
                if (listStatus == 200) {
                    var listData = JSON.parse(listResponse.getBody()).data;
                    var keys = listData.keys || [];
                    
                    for (var i = 0; i < keys.length; i++) {
                        var key = keys[i];
                        // Remove trailing slash if present
                        var cleanKey = key.replace(/\/$/, '');
                        var subPath = metadataPath + '/' + cleanKey;
                        
                        // Recursively list subdirectories
                        var subPaths = listKVPaths(subPath);
                        allPaths = allPaths.concat(subPaths);
                        
                        // If no sub-paths were found, this might be a leaf node (certificate file)
                        // Check if it's actually a data path by trying to read it
                        if (subPaths.length === 0) {
                            // Convert metadata path to data path
                            var dataPath = subPath.replace('/metadata/', '/data/');
                            // Verify it's a valid certificate path (has 3+ parts: certs/account/role/serial)
                            var pathParts = dataPath.replace('secret/data/', '').split('/');
                            if (pathParts.length >= 4 && pathParts[0] === 'certs') {
                                allPaths.push(dataPath);
                            }
                        }
                    }
                } else if (listStatus == 404) {
                    // Path doesn't exist, but check if current path is a certificate file
                    // Convert metadata path to data path and check
                    var dataPath = metadataPath.replace('/metadata/', '/data/');
                    var pathParts = dataPath.replace('secret/data/', '').split('/');
                    if (pathParts.length >= 4 && pathParts[0] === 'certs') {
                        // This might be a certificate file, add it
                        allPaths.push(dataPath);
                    }
                } else {
                    gs.warn('⚠️ Failed to list path ' + metadataPath + ': HTTP ' + listStatus);
                    gs.warn('Response: ' + listResponse.getBody());
                }
                
            } catch (e) {
                gs.error('❌ Exception listing path ' + metadataPath + ': ' + e.message);
                gs.error('Stack: ' + e.stack);
            }
            
            return allPaths;
        }
        
        /**
         * Read certificate from Vault KV path
         * @param {string} kvPath - Full KV path (e.g., "secret/data/certs/123456789012/role-name/serial")
         * @returns {object|null} Certificate data or null on failure
         */
        function readCertificate(kvPath) {
            try {
                var readRequest = new sn_ws.RESTMessageV2();
                readRequest.setEndpoint(VAULT_ADDR + '/v1/' + kvPath);
                readRequest.setHttpMethod('GET');
                readRequest.setRequestHeader('X-Vault-Token', token);
                readRequest.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
                
                var readResponse = readRequest.execute();
                var readStatus = readResponse.getStatusCode();
                
                if (readStatus == 200) {
                    var readData = JSON.parse(readResponse.getBody()).data;
                    return readData.data || readData; // KV v2 returns data.data
                } else {
                    gs.warn('⚠️ Failed to read certificate from ' + kvPath + ': HTTP ' + readStatus);
                    return null;
                }
                
            } catch (e) {
                gs.error('❌ Exception reading certificate from ' + kvPath + ': ' + e.message);
                return null;
            }
        }
        
        /**
         * Parse certificate and get expiration date
         * @param {string} certPEM - Certificate in PEM format
         * @returns {Date|null} Expiration date or null on failure
         */
        function getCertificateExpiration(certPEM) {
            try {
                // Extract certificate content (remove headers)
                var certContent = certPEM.replace(/-----BEGIN CERTIFICATE-----/g, '')
                                         .replace(/-----END CERTIFICATE-----/g, '')
                                         .replace(/\s/g, '');
                
                // Decode base64
                var certBytes = GlideStringUtil.base64Decode(certContent);
                
                // Parse ASN.1 to get expiration (simplified - ServiceNow may not have full ASN.1 parser)
                // For now, we'll use a workaround: check if certificate exists in database
                // and get expiration from there, or use Vault's certificate metadata
                
                // Alternative: Use Vault PKI to read certificate metadata
                // Or: Store expiration in KV data when storing certificate
                
                // For now, return null and we'll use serial number to look up in database
                return null;
                
            } catch (e) {
                gs.error('❌ Exception parsing certificate: ' + e.message);
                return null;
            }
        }
        
        /**
         * Check certificate expiration from database
         * @param {string} serialNumber - Certificate serial number
         * @returns {object|null} Object with expiration info or null
         */
        function getCertificateExpirationFromDB(serialNumber) {
            try {
                var gr = new GlideRecord('u_certificate_requests');
                gr.addQuery('u_serial_number', serialNumber);
                gr.addQuery('u_status', 'issued');
                gr.query();
                
                if (gr.next()) {
                    var expirationDate = gr.getValue('u_expiration_date');
                    if (expirationDate) {
                        var expiry = new GlideDateTime(expirationDate);
                        var now = new GlideDateTime();
                        var diffMs = expiry.getNumericValue() - now.getNumericValue();
                        var daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                        
                        return {
                            expirationDate: expiry,
                            daysRemaining: daysRemaining,
                            needsRenewal: daysRemaining < MIN_VALIDITY_DAYS,
                            commonName: gr.getValue('u_common_name'),
                            awsAccountId: gr.getValue('u_aws_id'),
                            awsRoleName: gr.getValue('u_aws_role_name'),
                            email: gr.getValue('u_email')
                        };
                    }
                }
                
                return null;
                
            } catch (e) {
                gs.error('❌ Exception checking certificate in database: ' + e.message);
                return null;
            }
        }
        
        /**
         * Trigger certificate renewal
         * @param {string} commonName - Certificate common name
         * @returns {boolean} True if renewal triggered successfully
         */
        function triggerCertificateRenewal(commonName) {
            try {
                // Find the certificate request in database
                var gr = new GlideRecord('u_certificate_requests');
                gr.addQuery('u_common_name', commonName);
                gr.addQuery('u_status', 'issued');
                gr.orderByDesc('sys_created_on');
                gr.setLimit(1);
                gr.query();
                
                if (gr.next()) {
                    // Mark as pending for renewal
                    gr.setValue('u_status', 'pending');
                    gr.setValue('work_notes', 'Certificate rotation: Renewal triggered due to expiration within ' + MIN_VALIDITY_DAYS + ' days');
                    gr.update();
                    
                    gs.info('✅ Certificate renewal triggered for: ' + commonName);
                    return true;
                } else {
                    gs.warn('⚠️ No certificate request found for CN: ' + commonName);
                    return false;
                }
                
            } catch (e) {
                gs.error('❌ Exception triggering certificate renewal: ' + e.message);
                return false;
            }
        }
        
        /**
         * Process a single certificate path
         * @param {string} kvPath - Full KV path
         */
        function processCertificate(kvPath) {
            try {
                totalCertsScanned++;
                
                // Extract path components: secret/data/certs/<aws_account_id>/<aws_role_name>/<cert_serial>
                var pathParts = kvPath.replace('secret/data/', '').split('/');
                if (pathParts.length < 4 || pathParts[0] !== 'certs') {
                    gs.debug('Skipping non-certificate path: ' + kvPath);
                    return;
                }
                
                var awsAccountId = pathParts[1];
                var awsRoleName = pathParts[2];
                var certSerial = decodeURIComponent(pathParts[3]);
                
                gs.info('📋 Checking certificate: ' + kvPath);
                gs.info('   AWS Account ID: ' + awsAccountId);
                gs.info('   AWS Role Name: ' + awsRoleName);
                gs.info('   Serial Number: ' + certSerial);
                
                // Read certificate data
                var certData = readCertificate(kvPath);
                if (!certData) {
                    gs.warn('⚠️ Failed to read certificate from ' + kvPath);
                    certsFailed++;
                    return;
                }
                
                // Get expiration from database using serial number
                var expirationInfo = getCertificateExpirationFromDB(certData.serial_number || certSerial);
                
                if (!expirationInfo) {
                    gs.warn('⚠️ Certificate not found in database or no expiration date: ' + certSerial);
                    certsFailed++;
                    return;
                }
                
                gs.info('   Expiration Date: ' + expirationInfo.expirationDate.getDisplayValue());
                gs.info('   Days Remaining: ' + expirationInfo.daysRemaining);
                
                if (expirationInfo.needsRenewal) {
                    gs.warn('⚠️ Certificate needs renewal: ' + expirationInfo.daysRemaining + ' days remaining');
                    certsNeedingRenewal++;
                    
                    // Trigger renewal
                    if (triggerCertificateRenewal(expirationInfo.commonName)) {
                        certsRenewed++;
                        gs.info('✅ Certificate renewal triggered for: ' + expirationInfo.commonName);
                    } else {
                        certsFailed++;
                        gs.error('❌ Failed to trigger renewal for: ' + expirationInfo.commonName);
                    }
                } else {
                    certsUpToDate++;
                    gs.info('✅ Certificate is up to date: ' + expirationInfo.daysRemaining + ' days remaining');
                }
                
            } catch (e) {
                gs.error('❌ Exception processing certificate ' + kvPath + ': ' + e.message);
                certsFailed++;
            }
        }
        
        // ============================================
        // Main execution
        // ============================================
        
        // 1️⃣ Authenticate to Vault
        if (!authenticateToVault()) {
            gs.error('❌ Failed to authenticate to Vault - job aborted');
            return;
        }
        
        // 2️⃣ List all certificate paths
        gs.info('📂 Scanning certificate paths in secret/data/certs/...');
        // Start from metadata path for listing
        var certPaths = listKVPaths('secret/metadata/certs');
        
        gs.info('📊 Found ' + certPaths.length + ' certificate paths to check');
        
        if (certPaths.length === 0) {
            gs.info('✅ No certificates found, job completed');
            return;
        }
        
        // 3️⃣ Process each certificate
        for (var i = 0; i < certPaths.length; i++) {
            processCertificate(certPaths[i]);
        }
        
        // 4️⃣ Output summary
        gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        gs.info('========================================');
        gs.info('=== Certificate Rotation Job END =====');
        gs.info('========================================');
        gs.info('📊 Job Summary:');
        gs.info('   Total Certificates Scanned: ' + totalCertsScanned);
        gs.info('   ✅ Up to Date: ' + certsUpToDate);
        gs.info('   ⚠️  Needing Renewal: ' + certsNeedingRenewal);
        gs.info('   🔄 Renewals Triggered: ' + certsRenewed);
        gs.info('   ❌ Failed: ' + certsFailed);
        gs.info('========================================');
        
    } catch (e) {
        gs.error('❌❌❌ CRITICAL ERROR in Certificate Rotation Job ❌❌❌');
        gs.error('Message: ' + e.message);
        gs.error('Stack: ' + e.stack);
    }
    
})();

