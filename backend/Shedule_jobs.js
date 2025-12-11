(function() {
    
    try {
        gs.info('========================================');
        gs.info('=== Certificate Processing Job START ===');
        gs.info('========================================');
        
        var vault = new VaultAPIClient();
        var processedCount = 0;
        var failedCount = 0;
        var reusedCount = 0;
        var totalCount = 0;
        
        // 查询所有 pending 状态且没有序列号的请求
        var gr = new GlideRecord('u_certificate_requests');
        gr.addQuery('u_status', 'pending');
        gr.addNullQuery('u_serial_number');
        gr.orderBy('sys_created_on');
        gr.setLimit(50);
        gr.query();
        
        totalCount = gr.getRowCount();
        gs.info('📊 Found ' + totalCount + ' pending requests to process');
        
        if (totalCount === 0) {
            gs.info('✅ No pending requests, job completed');
            return;
        }
        
        // 逐条处理
        while (gr.next()) {
            var requestId = gr.getValue('u_request_id');
            var commonName = gr.getValue('u_common_name');
            
            gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            gs.info('📋 Processing Request: ' + requestId);
            gs.info('🌐 Common Name: ' + commonName);
            
            try {
                // ⚠️ 关键修改: 传递 GlideRecord 对象,而不是字符串
                var success = vault.issueCertificate(commonName);
                
                if (success) {
                    processedCount++;
                    gs.info('✅ Certificate processed for: ' + requestId);
                } else {
                    failedCount++;
                    gs.error('❌ Failed to process: ' + requestId);
                }
                
            } catch (e) {
                failedCount++;
                gs.error('❌ Exception processing request ' + requestId);
                gs.error('Error: ' + e.message);
                gs.error('Stack: ' + e.stack);
                
                // 更新失败状态
                try {
                    var errorGr = new GlideRecord('u_certificate_requests');
                    if (errorGr.get(gr.sys_id)) {
                        errorGr.setValue('u_status', 'failed');
                        errorGr.setValue('work_notes', 'Scheduled job error: ' + e.message);
                        errorGr.update();
                    }
                } catch (updateError) {
                    gs.error('Failed to update error status: ' + updateError.message);
                }
            }
        }
        
        // 输出汇总统计
        gs.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        gs.info('========================================');
        gs.info('=== Certificate Processing Job END =====');
        gs.info('========================================');
        gs.info('📊 Job Summary:');
        gs.info('   Total Requests Found: ' + totalCount);
        gs.info('   ✅ Successfully Processed: ' + processedCount);
        gs.info('   ❌ Failed: ' + failedCount);
        gs.info('========================================');
        
    } catch (e) {
        gs.error('❌❌❌ CRITICAL ERROR in Scheduled Job ❌❌❌');
        gs.error('Message: ' + e.message);
        gs.error('Stack: ' + e.stack);
    }
    
})();
