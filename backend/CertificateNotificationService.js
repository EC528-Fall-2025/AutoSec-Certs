var CertificateNotificationService = Class.create();
CertificateNotificationService.prototype = {
    initialize: function() {
        this.portalPath = 'sp?id=cert_status_portal';
        this.baseUrl = gs.getProperty('glide.servlet.uri') || '';
        this.portalUrl = this.baseUrl + this.portalPath;
    },

    /**
     * Sends an email to the requester with portal login information
     * and next-step guidance.
     *
     * @param {GlideRecord} grRequest - Record from u_certificate_requests
     * @returns {boolean} true if email sent successfully, false otherwise
     */
    sendPortalCredentialsEmail: function(grRequest) {
        try {
            if (!grRequest || !grRequest.isValidRecord()) {
                gs.error('CertificateNotificationService: Invalid record provided.');
                return false;
            }

            var recipient = grRequest.getValue('u_email');
            if (!recipient) {
                gs.error('CertificateNotificationService: Recipient email is empty for sys_id ' + grRequest.getUniqueValue());
                return false;
            }

            var portalUsername = grRequest.getValue('u_portal_username');
            var portalPassword = grRequest.u_portal_password.getDecryptedValue();
            var requestId = grRequest.getValue('u_request_id');
            var commonName = grRequest.getValue('u_common_name');
            var submittedAt = grRequest.u_time ? grRequest.u_time.getDisplayValue() : '';
            var subject = '[Certificate Portal] Access Information for ' + (commonName || requestId || 'your request');
            var body = this._buildEmailBody({
                recipient: recipient,
                portalUsername: portalUsername,
                portalPassword: portalPassword,
                portalUrl: this.portalUrl,
                requestId: requestId,
                commonName: commonName,
                submittedAt: submittedAt
            });

            var mail = new GlideEmailOutbound();
            mail.setSubject(subject);
            mail.setFrom(gs.getProperty('mail.from', 'no-reply@service-now.com'));
            mail.setTo(recipient);
            mail.setBody(body);
            mail.setContentType('text/plain');
            mail.send();

            gs.info('CertificateNotificationService: Sent portal credentials email to ' + recipient);
            return true;

        } catch (e) {
            gs.error('CertificateNotificationService: Failed to send email. Error: ' + e.message);
            gs.error('CertificateNotificationService: Stack: ' + e.stack);
            return false;
        }
    },

    _buildEmailBody: function(context) {
        var lines = [
            'Hello,',
            '',
            'Your certificate request has been received and a portal account has been prepared for you.',
            '',
            'Request Details:',
            '  Request ID: ' + (context.requestId || '(unknown)'),
            '  Common Name: ' + (context.commonName || '(not provided)'),
            '  Submitted At: ' + (context.submittedAt || '(unknown)'),
            '',
            'Portal Login Information:',
            '  Portal URL: ' + context.portalUrl,
            '  Username: ' + (context.portalUsername || '(pending)'),
            '  Temporary Password: ' + (context.portalPassword || '(pending)'),
            '',
            'Next Steps:',
            '  1. Sign in to the certificate status portal using the credentials above.',
            '  2. Change your password immediately after the first login.',
            '  3. Monitor the status of your certificate and retrieve Vault credentials from the portal when needed.',
            '',
            'Within the portal you will find instructions on how to retrieve your certificate from HashiCorp Vault, including the AppRole credentials and command examples.',
            '',
            'Next Steps after Certificate Issuance:',
            '  - Follow the portal guide to authenticate to Vault and download your certificate bundle.',
            '  - Deploy the certificate on AWS EC2 (upload certificate/private key, update web server configuration, restart services). Detailed steps are provided in the portal.',
            '',
            'If you have any questions or require assistance, please contact the security team or submit a support ticket.',
            '',
            'Thank you,',
            'TraceOps Security Automation Team'
        ];

        return lines.join('\n');
    },

    type: 'CertificateNotificationService'
};