(function() {
  
  // 处理客户端请求
  if (input && input.action === 'submitRequest') {
    
    try {
      gs.info('=== Widget Server: Received submit request ===');
      
      // 获取表单数据
      var formData = input.data;
      gs.info('Form data: ' + JSON.stringify(formData));
      
      // 调用 VaultClient
      var vaultClient = new VaultClient();
      var result = vaultClient.submitCertificateRequest(formData);
      
      gs.info('VaultClient result: ' + result);
      
      // 解析结果
      var parsed = JSON.parse(result);
      
      // 返回给客户端
      data.status = parsed.status;
      data.message = parsed.message;
      
      if (parsed.status === 'success') {
        data.sys_id = parsed.sys_id;
        data.request_id = parsed.request_id;
        gs.info('✅ Request submitted successfully');
      } else {
        gs.error('❌ Request failed: ' + parsed.message);
      }
      
    } catch (e) {
      gs.error('❌ Exception in widget server script: ' + e.message);
      data.status = 'error';
      data.message = 'Server error: ' + e.message;
    }
  }
  
})();
