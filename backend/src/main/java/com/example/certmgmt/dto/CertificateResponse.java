package com.example.certmgmt.dto;

public class CertificateResponse {
    private String certificateId;
    private String commonName;
    private String certificate;
    private String privateKey;
    private String publicKey;
    private String issuer;
    private String validFrom;
    private String validTo;
    private String algorithm;
    private String message;


    public CertificateResponse() {}
    public CertificateResponse(String certificateId, String commonName, String certificate, 
                               String privateKey, String publicKey, String issuer, 
                               String validFrom, String validTo, String algorithm, String message) {
        this.certificateId = certificateId;
        this.commonName = commonName;
        this.certificate = certificate;
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.issuer = issuer;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.algorithm = algorithm;
        this.message = message;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String certificateId;
        private String commonName;
        private String certificate;
        private String privateKey;
        private String publicKey;
        private String issuer;
        private String validFrom;
        private String validTo;
        private String algorithm;
        private String message;

        public Builder certificateId(String certificateId) {
            this.certificateId = certificateId;
            return this;
        }

        public Builder commonName(String commonName) {
            this.commonName = commonName;
            return this;
        }

        public Builder certificate(String certificate) {
            this.certificate = certificate;
            return this;
        }

        public Builder privateKey(String privateKey) {
            this.privateKey = privateKey;
            return this;
        }

        public Builder publicKey(String publicKey) {
            this.publicKey = publicKey;
            return this;
        }

        public Builder issuer(String issuer) {
            this.issuer = issuer;
            return this;
        }

        public Builder validFrom(String validFrom) {
            this.validFrom = validFrom;
            return this;
        }

        public Builder validTo(String validTo) {
            this.validTo = validTo;
            return this;
        }

        public Builder algorithm(String algorithm) {
            this.algorithm = algorithm;
            return this;
        }

        public Builder message(String message) {
            this.message = message;
            return this;
        }

        public CertificateResponse build() {
            return new CertificateResponse(certificateId, commonName, certificate, 
                                          privateKey, publicKey, issuer, 
                                          validFrom, validTo, algorithm, message);
        }
    }

    // Getters and Setters
    public String getCertificateId() { return certificateId; }
    public void setCertificateId(String certificateId) { this.certificateId = certificateId; }

    public String getCommonName() { return commonName; }
    public void setCommonName(String commonName) { this.commonName = commonName; }

    public String getCertificate() { return certificate; }
    public void setCertificate(String certificate) { this.certificate = certificate; }

    public String getPrivateKey() { return privateKey; }
    public void setPrivateKey(String privateKey) { this.privateKey = privateKey; }

    public String getPublicKey() { return publicKey; }
    public void setPublicKey(String publicKey) { this.publicKey = publicKey; }

    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }

    public String getValidFrom() { return validFrom; }
    public void setValidFrom(String validFrom) { this.validFrom = validFrom; }

    public String getValidTo() { return validTo; }
    public void setValidTo(String validTo) { this.validTo = validTo; }

    public String getAlgorithm() { return algorithm; }
    public void setAlgorithm(String algorithm) { this.algorithm = algorithm; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}