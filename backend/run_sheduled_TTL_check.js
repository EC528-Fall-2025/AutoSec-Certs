/**
 * Scheduled Job: Certificate TTL Check
 * 
 * This scheduled job runs periodically to check the Time To Live (TTL)
 * for all issued certificates and update their status to 'expired' if needed.
 * 
 * Usage: Configure this as a Scheduled Job in ServiceNow
 * Frequency: Recommended to run daily or every few hours
 */

(function() {
    
    try {
        gs.info('========================================');
        gs.info('=== Certificate TTL Check Job START ===');
        gs.info('========================================');
        
        // Initialize TTL checker
        var ttlChecker = new CheckTTL();
        
        // Run TTL check for all certificates
        var result = ttlChecker.checkAllCertificates();
        
        // Check result
        if (result.success) {
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            gs.info('========================================');
            gs.info('=== Certificate TTL Check Job END =====');
            gs.info('========================================');
            gs.info('📊 Job Summary:');
            gs.info('   Total Certificates Checked: ' + result.totalChecked);
            gs.info('   ✅ Valid: ' + result.valid);
            gs.info('   ⚠️  Expired: ' + result.expired);
            gs.info('   🔄 Updated: ' + result.updated);
            gs.info('   ❌ Errors: ' + (result.errors || 0));
            gs.info('========================================');
        } else {
            gs.error('❌ TTL Check Job failed');
            gs.error('Error: ' + (result.message || 'Unknown error'));
        }
        
    } catch (e) {
        gs.error('❌❌❌ CRITICAL ERROR in TTL Check Job ❌❌❌');
        gs.error('Message: ' + e.message);
        gs.error('Stack: ' + e.stack);
    }
    
})();

