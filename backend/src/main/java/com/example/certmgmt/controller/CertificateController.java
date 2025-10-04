package com.example.certmgmt.controller;

import com.example.certmgmt.dto.CertificateRequest;
import com.example.certmgmt.dto.CertificateResponse;
import com.example.certmgmt.service.CertificateService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/certificates")
public class CertificateController {

    private final CertificateService certificateService;

    @Autowired
    public CertificateController(CertificateService certificateService) {
        this.certificateService = certificateService;
    }

    /**
     * POST /api/certificates
     */
    @PostMapping
    public ResponseEntity<CertificateResponse> createCertificate(
            @RequestBody CertificateRequest request) {
        try {
            CertificateResponse response = certificateService.createAndStoreCertificate(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            CertificateResponse errorResponse = new CertificateResponse();
            errorResponse.setMessage("Failed to create certificate: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorResponse);
        }
    }

    /**
     * GET /api/certificates/{id}
     */
    @GetMapping("/{id}")
    public ResponseEntity<CertificateResponse> getCertificate(@PathVariable String id) {
        CertificateResponse response = certificateService.getCertificateFromVault(id);
        
        if (response.getCertificate() == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
        }
        
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/certificates
     */
    @GetMapping
    public ResponseEntity<List<Map<String, String>>> listCertificates() {
        return ResponseEntity.ok(certificateService.listCertificates());
    }
}