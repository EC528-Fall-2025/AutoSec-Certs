api.controller = function($scope, $window, spUtil) {
  var c = this;
  
  // 初始化表单数据
  c.formData = {
    // PKI Information
    u_name: '',
    u_common_name: '',
    u_cert_name: '',
    u_organization: '',
    u_country: '',
    u_state_province: '',
    u_city: '',
    u_time_to_live: 8760, 
    // AWS Access
    u_aws_id: '',
    u_aws_role_name: '',
    // User Feedback
    u_email: ''
  };
  
  c.submitting = false;
  c.errorMessage = null;
  
  /**
   * 提交表单
   */
  c.submitForm = function() {
    console.log('=== Submitting certificate request ===');
    
    // 清除之前的错误
    c.errorMessage = null;
    
    // 验证
    if (!c.validateForm()) {
      return;
    }
    
    // 显示加载状态
    c.submitting = true;
    
    // 准备数据
    var data = {
      // PKI Information
      u_name: c.formData.u_name.trim(),
      u_common_name: c.formData.u_common_name.trim(),
      u_cert_name: c.formData.u_cert_name ? c.formData.u_cert_name.trim() : '',
      u_organization: c.formData.u_organization.trim(),
      u_country: c.formData.u_country.trim().toUpperCase(),
      u_state_province: c.formData.u_state_province.trim(),
      u_city: c.formData.u_city.trim(),
      u_time_to_live: parseInt(c.formData.u_time_to_live) || 8760, // Integer: hours
      // AWS Access
      u_aws_id: c.formData.u_aws_id.trim(),
      u_aws_role_name: c.formData.u_aws_role_name.trim(),
      // User Feedback
      u_email: c.formData.u_email.trim()
    };
    
    console.log('Form data:', data);
    
    // 调用服务器
    c.server.get({
      action: 'submitRequest',
      data: data
    }).then(function(response) {
      console.log('Response:', response);
      
      if (response.data.status === 'success') {
        console.log('✅ Success! Redirecting...');
        
        // 重定向到成功页面
        var successUrl = '/sp?id=cert_request_success&sys_id=' + response.data.sys_id;
        $window.location.href = successUrl;
        
      } else {
        console.error('❌ Server error:', response.data.message);
        c.errorMessage = response.data.message || 'An error occurred';
        c.submitting = false;
      }
      
    }).catch(function(error) {
      console.error('❌ Request failed:', error);
      c.errorMessage = 'Failed to submit request. Please try again.';
      c.submitting = false;
    });
  };
  
  /**
   * 验证表单
   */
  c.validateForm = function() {
    // 检查必填字段
    if (!c.formData.u_name || !c.formData.u_common_name || !c.formData.u_cert_name ||
        !c.formData.u_organization || !c.formData.u_country || !c.formData.u_state_province || 
        !c.formData.u_city || !c.formData.u_aws_id || !c.formData.u_aws_role_name ||
        !c.formData.u_email) {
      c.errorMessage = 'Please fill in all required fields';
      return false;
    }
    
    // 验证 Common Name (CN) - 可以是FQDN或普通域名
    var cnTrimmed = c.formData.u_common_name.trim();
    if (cnTrimmed.length === 0) {
      c.errorMessage = 'Common Name (CN) is required';
      return false;
    }
    
    // 验证CN格式（允许FQDN或普通域名）
    var cnRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!cnRegex.test(cnTrimmed)) {
      c.errorMessage = 'Common Name (CN) must be a valid domain name (e.g., webserver.example.com)';
      return false;
    }
    
    // 验证国家代码
    var countryTrimmed = c.formData.u_country.trim().toUpperCase();
    if (countryTrimmed.length !== 2 || !/^[A-Z]{2}$/.test(countryTrimmed)) {
      c.errorMessage = 'Country must be a 2-letter ISO code (e.g., US, GB)';
      return false;
    }
    
    // 验证 AWS Account ID
    var awsIdTrimmed = c.formData.u_aws_id.trim();
    if (!/^\d{12}$/.test(awsIdTrimmed)) {
      c.errorMessage = 'AWS Account ID must be exactly 12 digits';
      return false;
    }
    
    // 验证邮箱格式
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(c.formData.u_email.trim())) {
      c.errorMessage = 'Please enter a valid email address';
      return false;
    }
    
    // 验证 Certificate Name (必填)
    var certNameTrimmed = c.formData.u_cert_name.trim();
    if (certNameTrimmed.length === 0) {
      c.errorMessage = 'Certificate Name is required';
      return false;
    }
    // 检查是否包含空格
    if (/\s/.test(certNameTrimmed)) {
      c.errorMessage = 'Certificate Name cannot contain spaces';
      return false;
    }
    // 验证格式要求（字母、数字、连字符、下划线）
    var certNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!certNameRegex.test(certNameTrimmed)) {
      c.errorMessage = 'Certificate Name can only contain letters, numbers, hyphens, and underscores';
      return false;
    }
    
    return true;
  };
  
};