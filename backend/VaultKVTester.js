/**
 * Vault KV Tester Script
 *
 * Usage:
 *   - Run this script from ServiceNow Background Scripts.
 *   - Adjust the username/appRole variables as needed.
 *   - The script will:
 *       1. Ensure the per-user policy exists.
 *       2. Attach the policy to the user's AppRole.
 *       3. Fetch role_id / generate a fresh secret_id.
 *       4. Authenticate using the user AppRole credentials.
 *       5. Attempt to write and read a test payload in Vault KV.
 */

(function() {
    var username = 'siyuan16'; // ← change to target username
    var approleName = username + '-approle';
    var testPayload = {
        note: 'vault-kv-tester',
        timestamp: new GlideDateTime().getDisplayValue()
    };

    gs.info('=== Vault KV Tester: ' + username + ' ===');

    var client = new VaultAPIClient();

    // Step 1: Ensure per-user policy exists
    try {
        var policyName = client._ensureUserPolicy(username);
        gs.info('Ensured policy: ' + policyName);
    } catch (ePolicy) {
        gs.error('Failed to ensure user policy: ' + ePolicy.message);
        return;
    }

    // Step 2: Attach policy to AppRole (if it exists)
    try {
        client.ensureUserAppRolePolicy(username, approleName);
    } catch (eAttach) {
        gs.warn('Unable to update AppRole policy (may not exist yet): ' + eAttach.message);
    }

    // Step 3: Ensure ServiceNow token
    if (!client.ensureAuthenticated()) {
        gs.error('Could not authenticate ServiceNow AppRole, aborting.');
        return;
    }

    // Step 4: Retrieve role_id (assumes AppRole already exists)
    var roleId;
    try {
        var roleReq = new sn_ws.RESTMessageV2();
        roleReq.setEndpoint(client.VAULT_ADDR + '/v1/auth/approle/role/' + approleName + '/role-id');
        roleReq.setHttpMethod('GET');
        roleReq.setRequestHeader('X-Vault-Token', client.token);
        roleReq.setRequestHeader('X-Vault-Namespace', client.VAULT_NAMESPACE);

        var roleRes = roleReq.execute();
        if (roleRes.getStatusCode() !== 200) {
            gs.error('Failed to read role_id. HTTP ' + roleRes.getStatusCode());
            gs.error('Response: ' + roleRes.getBody());
            return;
        }

        roleId = JSON.parse(roleRes.getBody()).data.role_id;
        gs.info('Retrieved role_id: ' + roleId);
    } catch (eRole) {
        gs.error('Exception while fetching role_id: ' + eRole.message);
        return;
    }

    // Step 5: Generate a fresh secret_id
    var secretData = client._generateNewSecretIdForAppRole(approleName);
    if (!secretData || !secretData.secret_id) {
        gs.error('Failed to generate secret_id, aborting.');
        return;
    }
    var secretId = secretData.secret_id;
    gs.info('Generated secret_id accessor: ' + (secretData.secret_id_accessor || 'n/a'));

    // Step 6: Authenticate using user AppRole credentials
    var userToken = client._authenticateWithUserAppRole(roleId, secretId);
    if (!userToken) {
        gs.error('User AppRole authentication failed.');
        return;
    }
    gs.info('User token acquired, attempting KV write...');

    // Step 7: Write to KV
    try {
        var kvWrite = new sn_ws.RESTMessageV2();
        kvWrite.setEndpoint(client.VAULT_ADDR + '/v1/secret/data/user-data/' + username);
        kvWrite.setHttpMethod('POST');
        kvWrite.setRequestHeader('Content-Type', 'application/json');
        kvWrite.setRequestHeader('X-Vault-Token', userToken);
        kvWrite.setRequestHeader('X-Vault-Namespace', client.VAULT_NAMESPACE);
        kvWrite.setRequestBody(JSON.stringify({ data: testPayload }));

        var writeRes = kvWrite.execute();
        gs.info('KV write status: ' + writeRes.getStatusCode());
        gs.info('KV write response: ' + writeRes.getBody());
    } catch (eKVWrite) {
        gs.error('Exception during KV write: ' + eKVWrite.message);
        return;
    }

    // Step 8: Read back KV entry
    try {
        var kvRead = new sn_ws.RESTMessageV2();
        kvRead.setEndpoint(client.VAULT_ADDR + '/v1/secret/data/user-data/' + username);
        kvRead.setHttpMethod('GET');
        kvRead.setRequestHeader('X-Vault-Token', userToken);
        kvRead.setRequestHeader('X-Vault-Namespace', client.VAULT_NAMESPACE);

        var readRes = kvRead.execute();
        gs.info('KV read status: ' + readRes.getStatusCode());
        gs.info('KV read response: ' + readRes.getBody());
    } catch (eKVRead) {
        gs.error('Exception during KV read: ' + eKVRead.message);
        return;
    }

    gs.info('=== Vault KV Tester complete ===');
})();

