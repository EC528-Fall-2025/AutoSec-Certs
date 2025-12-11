/**
 * VaultCertificateService - Certificate issuance service
 * Handles certificate issuance from Vault PKI engine
 * Extends VaultAuthBase for authentication
 */
var VaultCertificateService = Class.create();
VaultCertificateService.prototype = Object.extendsObject(VaultAuthBase, {
    
    initialize: function() {
        VaultAuthBase.prototype.initialize.call(this);
        this.PKI_PATH = 'pki/issue/servicenow-pki-role';
    },

    /**
     * Issue a new certificate for a common name
     * Returns certificate data (cert, key, ca_chain, serial_number, expiration)
     * @param {string} commonName - Certificate common name
     * @param {object} pkiInfo - PKI information (name, organization, country, state_province, city, time_to_live)
     * @param {object} awsInfo - AWS information (aws_account_id, aws_role_name) - optional, for metadata
     * @returns {object|null} Certificate data object or null on failure
     */
    issueCertificate: function(commonName, pkiInfo, awsInfo) {
        try {
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            gs.info('📜 Issuing certificate for: ' + commonName);
            
            // 1️⃣ Authenticate to Vault
            if (!this.ensureAuthenticated()) {
                gs.error('❌ Failed to authenticate to Vault');
                return null;
            }

            // 2️⃣ Prepare PKI information
            var pkiName = (pkiInfo && pkiInfo.name) || '';
            var pkiCommonName = commonName;
            var pkiOrganization = (pkiInfo && pkiInfo.organization) || '';
            var pkiCountry = (pkiInfo && pkiInfo.country) || '';
            var pkiStateProvince = (pkiInfo && pkiInfo.state_province) || '';
            var pkiCity = (pkiInfo && pkiInfo.city) || '';
            var ttlHours = (pkiInfo && parseInt(pkiInfo.time_to_live)) || 8760;
            var pkiTTL = ttlHours + 'h';
            
            gs.info('📋 PKI Information:');
            gs.info('   Name: ' + pkiName);
            gs.info('   Common Name: ' + pkiCommonName);
            gs.info('   Organization: ' + pkiOrganization);
            gs.info('   Country: ' + pkiCountry);
            gs.info('   State/Province: ' + pkiStateProvince);
            gs.info('   City: ' + pkiCity);
            gs.info('   TTL: ' + ttlHours + ' hours (' + pkiTTL + ')');

            // 3️⃣ Prepare Vault request with complete PKI information
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
            
            // Add AWS information to metadata (if provided)
            var metadata = {};
            if (awsInfo && awsInfo.aws_account_id && awsInfo.aws_account_id.trim()) {
                metadata.aws_account_id = awsInfo.aws_account_id.trim();
            }
            if (awsInfo && awsInfo.aws_role_name && awsInfo.aws_role_name.trim()) {
                metadata.aws_role_name = awsInfo.aws_role_name.trim();
            }
            if (pkiName && pkiName.trim()) {
                metadata.user_name = pkiName.trim();
            }
            if (Object.keys(metadata).length > 0) {
                vaultPayload.metadata = metadata;
            }
            
            // 4️⃣ Send request to Vault PKI
            var request = new sn_ws.RESTMessageV2();
            request.setEndpoint(this.VAULT_ADDR + '/v1/' + this.PKI_PATH);
            request.setHttpMethod('POST');
            request.setRequestHeader('Content-Type', 'application/json');
            request.setRequestHeader('X-Vault-Token', this.token);
            request.setRequestHeader('X-Vault-Namespace', this.VAULT_NAMESPACE);
            request.setRequestBody(JSON.stringify(vaultPayload));

            gs.info('📤 Vault PKI Request Payload: ' + JSON.stringify(vaultPayload));
            gs.debug('📤 Sending request to Vault: ' + this.VAULT_ADDR + '/v1/' + this.PKI_PATH);

            // 5️⃣ Execute request
            var response = request.execute();
            var statusCode = response.getStatusCode();
            var responseBody = response.getBody();

            gs.debug('📥 Vault response code: ' + statusCode);

            // 6️⃣ Handle failure
            if (statusCode != 200) {
                gs.error('❌ Certificate issuance failed: ' + statusCode);
                gs.error('Request Payload: ' + JSON.stringify(vaultPayload));
                gs.error('PKI Path: ' + this.PKI_PATH);
                gs.error('Response: ' + responseBody);
                
                // Parse error response for better error messages
                try {
                    var errorData = JSON.parse(responseBody);
                    if (errorData.errors && errorData.errors.length > 0) {
                        gs.error('Vault Error Details:');
                        for (var i = 0; i < errorData.errors.length; i++) {
                            gs.error('  Error ' + (i + 1) + ': ' + errorData.errors[i]);
                        }
                    }
                } catch (parseError) {
                    gs.error('Could not parse error response: ' + parseError.message);
                }
                
                return null;
            }

            // 7️⃣ Parse response
            var data = JSON.parse(responseBody).data;
            gs.info('✅ Certificate issued successfully from Vault');
            gs.info('   Serial Number: ' + data.serial_number);
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Return certificate data
            return {
                certificate: data.certificate,
                private_key: data.private_key,
                ca_chain: data.ca_chain || [],
                serial_number: data.serial_number,
                expiration: data.expiration
            };

        } catch (e) {
            gs.error('❌ Exception during certificate issuance: ' + e.message);
            gs.error('Stack: ' + e.stack);
            return null;
        }
    },

    type: 'VaultCertificateService'
});

