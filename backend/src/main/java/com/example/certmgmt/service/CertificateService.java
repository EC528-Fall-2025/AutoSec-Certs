package com.example.certmgmt.service;

import com.example.certmgmt.dto.CertificateRequest;
import com.example.certmgmt.dto.CertificateResponse;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.SubjectPublicKeyInfo;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.X509v3CertificateBuilder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.openssl.jcajce.JcaPEMWriter;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.vault.core.VaultTemplate;

import java.io.StringWriter;
import java.math.BigInteger;
import java.security.*;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.*;

@Service
public class CertificateService {

    private final VaultTemplate vaultTemplate;

    @Autowired
    public CertificateService(VaultTemplate vaultTemplate) {
        this.vaultTemplate = vaultTemplate;
    }

    static {
        Security.addProvider(new BouncyCastleProvider());
    }

    /**

     */
    public CertificateResponse createAndStoreCertificate(CertificateRequest request) throws Exception {

        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA");
        keyGen.initialize(request.getKeySize());
        KeyPair keyPair = keyGen.generateKeyPair();

        String subject = buildSubject(request);
        X500Name issuerName = new X500Name(subject);
        X500Name subjectName = new X500Name(subject);


        Date notBefore = new Date();
        Calendar calendar = Calendar.getInstance();
        calendar.setTime(notBefore);
        calendar.add(Calendar.DAY_OF_YEAR, request.getValidityDays());
        Date notAfter = calendar.getTime();


        BigInteger serialNumber = new BigInteger(64, new SecureRandom());
        SubjectPublicKeyInfo publicKeyInfo = SubjectPublicKeyInfo.getInstance(
            keyPair.getPublic().getEncoded()
        );

        X509v3CertificateBuilder certBuilder = new X509v3CertificateBuilder(
            issuerName,
            serialNumber,
            notBefore,
            notAfter,
            subjectName,
            publicKeyInfo
        );

        ContentSigner signer = new JcaContentSignerBuilder("SHA256WithRSA")
            .setProvider("BC")
            .build(keyPair.getPrivate());

        X509CertificateHolder certHolder = certBuilder.build(signer);
        X509Certificate certificate = new JcaX509CertificateConverter()
            .setProvider("BC")
            .getCertificate(certHolder);

        // 6. 转换为 PEM 格式
        String certPem = convertToPem(certificate);
        String privateKeyPem = convertToPem(keyPair.getPrivate());
        String publicKeyPem = convertToPem(keyPair.getPublic());

        // 7. 生成唯一 ID
        String certificateId = UUID.randomUUID().toString();

        // 8. 存储到 Vault
        Map<String, Object> certData = new HashMap<>();
        certData.put("commonName", request.getCommonName());
        certData.put("certificate", certPem);
        certData.put("privateKey", privateKeyPem);
        certData.put("publicKey", publicKeyPem);
        certData.put("issuer", certificate.getIssuerDN().toString());
        certData.put("validFrom", certificate.getNotBefore().toString());
        certData.put("validTo", certificate.getNotAfter().toString());
        certData.put("algorithm", certificate.getSigAlgName());
        certData.put("serialNumber", certificate.getSerialNumber().toString());
        certData.put("createdAt", new Date().toString());

        String vaultPath = "secret/data/certificates/" + certificateId;
        vaultTemplate.write(vaultPath, Map.of("data", certData));

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        CertificateResponse response = new CertificateResponse();
        response.setCertificateId(certificateId);
        response.setCommonName(request.getCommonName());
        response.setCertificate(certPem);
        response.setPrivateKey(privateKeyPem);
        response.setPublicKey(publicKeyPem);
        response.setIssuer(certificate.getIssuerDN().toString());
        response.setValidFrom(sdf.format(certificate.getNotBefore()));
        response.setValidTo(sdf.format(certificate.getNotAfter()));
        response.setAlgorithm(certificate.getSigAlgName());
        response.setMessage("Certificate created and stored successfully in Vault at: " + vaultPath);
        return response;
    }

    /**
     */
    public CertificateResponse getCertificateFromVault(String certificateId) {
        String vaultPath = "secret/data/certificates/" + certificateId;
        
        var response = vaultTemplate.read(vaultPath, Map.class);
        
        if (response == null || response.getData() == null) {
            CertificateResponse notFound = new CertificateResponse();
            notFound.setMessage("Certificate not found with ID: " + certificateId);
            return notFound;
        }

        Map<String, Object> data = (Map<String, Object>) response.getData().get("data");
        
        CertificateResponse certResponse = new CertificateResponse();
        certResponse.setCertificateId(certificateId);
        certResponse.setCommonName((String) data.get("commonName"));
        certResponse.setCertificate((String) data.get("certificate"));
        certResponse.setPrivateKey((String) data.get("privateKey"));
        certResponse.setPublicKey((String) data.get("publicKey"));
        certResponse.setIssuer((String) data.get("issuer"));
        certResponse.setValidFrom((String) data.get("validFrom"));
        certResponse.setValidTo((String) data.get("validTo"));
        certResponse.setAlgorithm((String) data.get("algorithm"));
        certResponse.setMessage("Certificate retrieved successfully from Vault");
        return certResponse;
    }

    /**
     */
    public List<Map<String, String>> listCertificates() {
        List<Map<String, String>> result = new ArrayList<>();
        result.add(Map.of("message", "The List functionality requires additional configuration of Vault permissions."));
        return result;
    }

    // 辅助方法
    private String buildSubject(CertificateRequest request) {
        StringBuilder sb = new StringBuilder();
        if (request.getCommonName() != null) {
            sb.append("CN=").append(request.getCommonName());
        }
        if (request.getOrganization() != null) {
            sb.append(", O=").append(request.getOrganization());
        }
        if (request.getOrganizationalUnit() != null) {
            sb.append(", OU=").append(request.getOrganizationalUnit());
        }
        if (request.getCountry() != null) {
            sb.append(", C=").append(request.getCountry());
        }
        if (request.getState() != null) {
            sb.append(", ST=").append(request.getState());
        }
        if (request.getLocality() != null) {
            sb.append(", L=").append(request.getLocality());
        }
        return sb.toString();
    }

    private String convertToPem(Object obj) throws Exception {
        StringWriter writer = new StringWriter();
        try (JcaPEMWriter pemWriter = new JcaPEMWriter(writer)) {
            pemWriter.writeObject(obj);
        }
        return writer.toString();
    }
}