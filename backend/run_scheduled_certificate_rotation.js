/**
 * Scheduled Job: Certificate Rotation
 * 
 * This scheduled job runs periodically to automatically rotate certificates
 * that expire within 30 days.
 * 
 * Usage: Configure this as a Scheduled Job in ServiceNow
 * Frequency: Recommended to run daily
 * 
 * Flow:
 * 1. Scans all issued certificates for expiration within 30 days
 * 2. Issues new certificates through Vault PKI (same PKI role and info)
 * 3. Overwrites original certificate in KV (same path/name for EC2 detection)
 * 4. Updates certificate information in SNOW table
 * 
 * Requirements:
 * - PKI role must have max_TTL > 30 days (e.g., 90 days or 1 year)
 * - Certificate name (cert_name) must be set and unique per user/AWS account
 * - Same cert_name is used for rotation so EC2 can detect the change
 */

(function() {
    
    try {
        gs.info('========================================');
        gs.info('=== Certificate Rotation Job START ===');
        gs.info('========================================');
        
        // Initialize certificate rotation service
        var rotationService = new CertificateRotation();
        
        // Run rotation for all certificates expiring within 30 days
        var result = rotationService.rotateAllCertificates();
        
        // Check result
        if (result.success) {
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            gs.info('========================================');
            gs.info('=== Certificate Rotation Job END ====');
            gs.info('========================================');
            gs.info('📊 Job Summary:');
            gs.info('   Total Certificates Checked: ' + result.totalChecked);
            gs.info('   ✅ Rotated: ' + result.rotated);
            gs.info('   ⏭️  Skipped: ' + result.skipped);
            gs.info('   ❌ Errors: ' + result.errors);
            gs.info('========================================');
        } else {
            gs.error('❌ Certificate Rotation Job failed');
            gs.error('Error: ' + (result.message || 'Unknown error'));
        }
        
    } catch (e) {
        gs.error('❌❌❌ CRITICAL ERROR in Certificate Rotation Job ❌❌❌');
        gs.error('Message: ' + e.message);
        gs.error('Stack: ' + e.stack);
    }
    
})();

