/**
 * Check Current Vault Configuration
 * 
 * This script checks the current Vault configuration values
 * and tests connectivity to Vault
 */

(function() {
    try {
        gs.info('========================================');
        gs.info('=== Vault Configuration Check ===');
        gs.info('========================================');
        
        // Current configuration from VaultAPIClient.js
        var VAULT_ADDR = 'https://test-cluster-public-vault-fc6745fb.83f0d48a.z1.hashicorp.cloud:8200';
        var VAULT_NAMESPACE = 'admin';
        var ROLE_ID = 'b18378c5-ded6-21bf-6d12-f9225fb8a0a3';
        var SECRET_ID = '89feebc7-70bf-6747-6779-e0b6f9a52de1';
        var PKI_PATH = 'pki/issue/servicenow-pki-role';
        
        gs.info('📋 Current Configuration:');
        gs.info('   VAULT_ADDR: ' + VAULT_ADDR);
        gs.info('   VAULT_NAMESPACE: ' + VAULT_NAMESPACE);
        gs.info('   ROLE_ID: ' + ROLE_ID);
        gs.info('   SECRET_ID: ' + (SECRET_ID ? SECRET_ID.substring(0, 8) + '...' : 'NOT SET'));
        gs.info('   PKI_PATH: ' + PKI_PATH);
        
        // Test connectivity
        gs.info('');
        gs.info('🔍 Testing Vault connectivity...');
        
        try {
            var healthRequest = new sn_ws.RESTMessageV2();
            healthRequest.setEndpoint(VAULT_ADDR + '/v1/sys/health');
            healthRequest.setHttpMethod('GET');
            healthRequest.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
            
            var healthResponse = healthRequest.execute();
            var healthStatus = healthResponse.getStatusCode();
            
            if (healthStatus == 200 || healthStatus == 429 || healthStatus == 472 || healthStatus == 473) {
                gs.info('✅ Vault is reachable (HTTP ' + healthStatus + ')');
                var healthBody = healthResponse.getBody();
                gs.info('   Response: ' + healthBody);
            } else {
                gs.warn('⚠️ Vault health check returned unexpected status: HTTP ' + healthStatus);
            }
        } catch (e) {
            gs.error('❌ Failed to connect to Vault: ' + e.message);
        }
        
        // Test AppRole authentication
        gs.info('');
        gs.info('🔐 Testing AppRole authentication...');
        
        try {
            var authRequest = new sn_ws.RESTMessageV2();
            authRequest.setEndpoint(VAULT_ADDR + '/v1/auth/approle/login');
            authRequest.setHttpMethod('POST');
            authRequest.setRequestHeader('Content-Type', 'application/json');
            authRequest.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
            
            var payload = {
                role_id: ROLE_ID,
                secret_id: SECRET_ID
            };
            authRequest.setRequestBody(JSON.stringify(payload));
            
            var authResponse = authRequest.execute();
            var authStatus = authResponse.getStatusCode();
            
            if (authStatus == 200) {
                var authBody = JSON.parse(authResponse.getBody());
                var token = authBody.auth.client_token;
                gs.info('✅ AppRole authentication successful');
                gs.info('   Token: ' + (token ? token.substring(0, 20) + '...' : 'NOT RECEIVED'));
                
                // Check token policies
                var lookupRequest = new sn_ws.RESTMessageV2();
                lookupRequest.setEndpoint(VAULT_ADDR + '/v1/auth/token/lookup-self');
                lookupRequest.setHttpMethod('GET');
                lookupRequest.setRequestHeader('X-Vault-Token', token);
                lookupRequest.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
                
                var lookupResponse = lookupRequest.execute();
                if (lookupResponse.getStatusCode() == 200) {
                    var tokenData = JSON.parse(lookupResponse.getBody()).data;
                    var policies = tokenData.policies || [];
                    gs.info('   Token Policies: ' + policies.join(', '));
                }
            } else {
                gs.error('❌ AppRole authentication failed: HTTP ' + authStatus);
                gs.error('   Response: ' + authResponse.getBody());
            }
        } catch (e) {
            gs.error('❌ AppRole authentication exception: ' + e.message);
        }
        
        // Test UserPass authentication (new method from colleague)
        gs.info('');
        gs.info('🔐 Testing UserPass authentication...');
        
        var NEW_VAULT_ADDR = 'https://main-cluster-private-vault-19db5664.417ab8a8.z1.hashicorp.cloud:8200';
        var USERNAME = 'servicenow-user';
        var PASSWORD = 'ec528';
        
        try {
            var userpassRequest = new sn_ws.RESTMessageV2();
            userpassRequest.setEndpoint(NEW_VAULT_ADDR + '/v1/auth/userpass/login/' + USERNAME);
            userpassRequest.setHttpMethod('POST');
            userpassRequest.setRequestHeader('Content-Type', 'application/json');
            userpassRequest.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
            
            var userpassPayload = {
                password: PASSWORD
            };
            userpassRequest.setRequestBody(JSON.stringify(userpassPayload));
            
            var userpassResponse = userpassRequest.execute();
            var userpassStatus = userpassResponse.getStatusCode();
            
            if (userpassStatus == 200) {
                var userpassBody = JSON.parse(userpassResponse.getBody());
                var userpassToken = userpassBody.auth.client_token;
                gs.info('✅ UserPass authentication successful');
                gs.info('   Token: ' + (userpassToken ? userpassToken.substring(0, 20) + '...' : 'NOT RECEIVED'));
                
                // Check token policies
                var userpassLookupRequest = new sn_ws.RESTMessageV2();
                userpassLookupRequest.setEndpoint(NEW_VAULT_ADDR + '/v1/auth/token/lookup-self');
                userpassLookupRequest.setHttpMethod('GET');
                userpassLookupRequest.setRequestHeader('X-Vault-Token', userpassToken);
                userpassLookupRequest.setRequestHeader('X-Vault-Namespace', VAULT_NAMESPACE);
                
                var userpassLookupResponse = userpassLookupRequest.execute();
                if (userpassLookupResponse.getStatusCode() == 200) {
                    var userpassTokenData = JSON.parse(userpassLookupResponse.getBody()).data;
                    var userpassPolicies = userpassTokenData.policies || [];
                    gs.info('   Token Policies: ' + userpassPolicies.join(', '));
                }
            } else {
                gs.error('❌ UserPass authentication failed: HTTP ' + userpassStatus);
                gs.error('   Response: ' + userpassResponse.getBody());
            }
        } catch (e) {
            gs.error('❌ UserPass authentication exception: ' + e.message);
        }
        
        gs.info('');
        gs.info('========================================');
        gs.info('=== Configuration Check Complete ===');
        gs.info('========================================');
        
    } catch (e) {
        gs.error('❌❌❌ CRITICAL ERROR ❌❌❌');
        gs.error('Message: ' + e.message);
        gs.error('Stack: ' + e.stack);
    }
})();

