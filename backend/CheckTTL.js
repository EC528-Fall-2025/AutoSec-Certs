/**
 * Certificate TTL Checker Script Include
 * 
 * This script checks the Time To Live (TTL) for all issued certificates
 * and updates their status to 'expired' if they have expired.
 * 
 * Features:
 * - Checks all certificates with status 'issued' and have u_certificate field
 * - Calculates remaining TTL in hours
 * - Uses decimal format if remaining time < 1 hour
 * - Updates status to 'expired' if certificate has expired
 * - Updates u_time_to_live field with remaining hours
 * 
 * Authentication: Uses same Vault credentials as VaultAPIClient
 */

var CheckTTL = Class.create();
CheckTTL.prototype = {
    initialize: function() {
        // Same authentication configuration as VaultAPIClient
        this.VAULT_ADDR = 'https://main-cluster-public-vault-19db5664.417ab8a8.z1.hashicorp.cloud:8200';
        this.VAULT_NAMESPACE = 'admin';
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
            gs.info('🔐 Authenticating to Vault using UserPass for TTL check...');

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
     * Calculate remaining TTL in hours
     * Returns decimal if < 1 hour, otherwise integer
     * @param {GlideDateTime} expirationDate - Certificate expiration date
     * @returns {number} Remaining TTL in hours (decimal if < 1 hour, otherwise integer)
     */
    calculateRemainingTTL: function(expirationDate) {
        try {
            var now = new GlideDateTime();
            var diffMs = expirationDate.getNumericValue() - now.getNumericValue();
            
            // Convert milliseconds to hours
            var ttlHours = diffMs / (1000 * 60 * 60);
            
            // If less than 1 hour, return decimal (don't floor)
            // Otherwise, return integer (floor)
            if (ttlHours < 1 && ttlHours > 0) {
                // Return decimal with 2 decimal places
                return Math.round(ttlHours * 100) / 100;
            } else if (ttlHours <= 0) {
                // Expired
                return 0;
            } else {
                // Return integer (hours) - use floor as per user requirement
                return Math.floor(ttlHours);
            }
        } catch (e) {
            gs.error('❌ Exception calculating TTL: ' + e.message);
            return 0;
        }
    },

    /**
     * Check TTL for a single certificate record
     * @param {GlideRecord} gr - Certificate request record
     * @returns {object} Object with status, remainingTTL, and updated flag
     */
    checkCertificateTTL: function(gr) {
        try {
            var requestId = gr.getValue('u_request_id');
            var commonName = gr.getValue('u_common_name');
            var expirationDateStr = gr.getValue('u_expiration_date');
            
            if (!expirationDateStr) {
                gs.warn('⚠️ Certificate ' + requestId + ' (' + commonName + ') has no expiration date');
                return {
                    status: 'no_expiration',
                    remainingTTL: null,
                    updated: false
                };
            }
            
            var expirationDate = new GlideDateTime(expirationDateStr);
            var remainingTTL = this.calculateRemainingTTL(expirationDate);
            
            var now = new GlideDateTime();
            var isExpired = expirationDate.getNumericValue() <= now.getNumericValue();
            
            var updated = false;
            var newStatus = gr.getValue('u_status');
            
            // Update status if expired
            if (isExpired && newStatus !== 'expired') {
                gr.setValue('u_status', 'expired');
                gr.setValue('work_notes', 'Certificate expired on ' + expirationDate.getDisplayValue() + '. Status updated by TTL checker.');
                newStatus = 'expired';
                updated = true;
            }
            
            // u_time_to_live stores the TTL from certificate request (may be updated after rotation)
            // u_ttl_now should be updated with remaining time (countdown) based on u_expiration_date
            // After rotation, u_expiration_date is updated to new certificate's expiration,
            // so u_ttl_now will be recalculated based on the new expiration date
            
            // Update u_ttl_now field (Floating Point Number - can store decimals)
            // Store the exact remaining TTL value (including decimals for < 1 hour)
            var currentTTLNow = parseFloat(gr.getValue('u_ttl_now')) || 0;
            var ttlNowToStore = remainingTTL <= 0 ? 0 : remainingTTL; // Can be decimal
            
            // Only update if value changed (with small tolerance for floating point comparison)
            if (Math.abs(ttlNowToStore - currentTTLNow) > 0.001) {
                // Log significant changes (e.g., after rotation)
                if (Math.abs(ttlNowToStore - currentTTLNow) > 100) {
                    gs.info('🔄 Significant TTL change detected for ' + requestId + ': ' + currentTTLNow + 'h -> ' + ttlNowToStore + 'h (likely after rotation)');
                }
                gr.setValue('u_ttl_now', ttlNowToStore);
                updated = true;
            } else {
                // Log when TTL is already correct (no update needed)
                gs.debug('✓ TTL already correct for ' + requestId + ': ' + currentTTLNow + 'h');
            }
            
            if (updated) {
                gr.update();
            }
            
            return {
                status: newStatus,
                remainingTTL: remainingTTL,
                updated: updated,
                isExpired: isExpired
            };
            
        } catch (e) {
            gs.error('❌ Exception checking TTL for certificate: ' + e.message);
            return {
                status: 'error',
                remainingTTL: null,
                updated: false
            };
        }
    },

    /**
     * Check TTL for all issued certificates
     * @returns {object} Summary object with statistics
     */
    checkAllCertificates: function() {
        try {
            gs.info('========================================');
            gs.info('=== Certificate TTL Check START ===');
            gs.info('========================================');
            
            // Authenticate to Vault (for permission verification)
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Failed to authenticate to Vault - TTL check aborted');
                return {
                    success: false,
                    message: 'Authentication failed'
                };
            }
            
            // Query all issued certificates that have certificate content
            var gr = new GlideRecord('u_certificate_requests');
            gr.addQuery('u_status', 'issued');
            gr.addNotNullQuery('u_certificate');
            gr.orderBy('u_expiration_date');
            gr.query();
            
            var totalCount = gr.getRowCount();
            gs.info('📊 Found ' + totalCount + ' issued certificates to check');
            
            if (totalCount === 0) {
                gs.info('✅ No certificates to check');
                return {
                    success: true,
                    totalChecked: 0,
                    expired: 0,
                    updated: 0,
                    valid: 0
                };
            }
            
            // Statistics
            var expiredCount = 0;
            var updatedCount = 0;
            var validCount = 0;
            var errorCount = 0;
            
            // Process each certificate
            while (gr.next()) {
                var requestId = gr.getValue('u_request_id');
                var commonName = gr.getValue('u_common_name');
                var expirationDate = gr.getValue('u_expiration_date');
                
                gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                gs.info('📋 Checking certificate: ' + requestId);
                gs.info('   Common Name: ' + commonName);
                gs.info('   Expiration Date: ' + (expirationDate ? new GlideDateTime(expirationDate).getDisplayValue() : 'N/A'));
                
                // Show current TTL values before check
                var currentTTLNow = parseFloat(gr.getValue('u_ttl_now')) || 0;
                var timeToLive = parseInt(gr.getValue('u_time_to_live')) || 0;
                gs.info('   Current u_ttl_now: ' + currentTTLNow + 'h, u_time_to_live: ' + timeToLive + 'h');
                
                var result = this.checkCertificateTTL(gr);
                
                if (result.status === 'error') {
                    errorCount++;
                    gs.error('❌ Error checking certificate: ' + requestId);
                } else if (result.isExpired) {
                    expiredCount++;
                    if (result.updated) {
                        updatedCount++;
                    }
                    gs.warn('⚠️ Certificate expired: ' + requestId + ' (' + commonName + ')');
                } else {
                    validCount++;
                    // Display TTL: use decimal if < 1 hour, otherwise integer
                    var ttlDisplay;
                    if (result.remainingTTL < 1 && result.remainingTTL > 0) {
                        ttlDisplay = result.remainingTTL.toFixed(2) + ' hours';
                    } else {
                        ttlDisplay = result.remainingTTL + ' hours';
                    }
                    gs.info('✅ Certificate valid: ' + requestId + ' - Remaining TTL: ' + ttlDisplay);
                }
            }
            
            // Summary
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            gs.info('========================================');
            gs.info('=== Certificate TTL Check END =====');
            gs.info('========================================');
            gs.info('📊 Summary:');
            gs.info('   Total Certificates Checked: ' + totalCount);
            gs.info('   ✅ Valid: ' + validCount);
            gs.info('   ⚠️  Expired: ' + expiredCount);
            gs.info('   🔄 Updated: ' + updatedCount);
            gs.info('   ❌ Errors: ' + errorCount);
            gs.info('========================================');
            
            return {
                success: true,
                totalChecked: totalCount,
                expired: expiredCount,
                updated: updatedCount,
                valid: validCount,
                errors: errorCount
            };
            
        } catch (e) {
            gs.error('❌❌❌ CRITICAL ERROR in TTL Check ❌❌❌');
            gs.error('Message: ' + e.message);
            gs.error('Stack: ' + e.stack);
            
            return {
                success: false,
                message: 'Exception: ' + e.message
            };
        }
    },

    type: 'CheckTTL'
};

