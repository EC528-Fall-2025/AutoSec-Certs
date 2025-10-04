package com.example.certmgmt.test;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.vault.core.VaultTemplate;
import org.springframework.vault.support.VaultHealth;
import org.springframework.vault.support.VaultResponseSupport;

import java.util.Map;

@Configuration
public class VaultConnectionTest {

    private static final Logger log = LoggerFactory.getLogger(VaultConnectionTest.class);  // ← 手动创建 logger

    @Bean
    public CommandLineRunner testVaultConnection(VaultTemplate vaultTemplate) {
        return args -> {
            try {
                log.info("=== Testing Vault Connection ===");
                VaultHealth health = vaultTemplate.opsForSys().health();
                log.info("✅ Vault is reachable at http://127.0.0.1:8200");
                log.info("   Initialized: {}", health.isInitialized());
                log.info("   Sealed: {}", health.isSealed());
                
    
                String secretPath = "secret/data/myapp";
                log.info("\n📖 Reading secret from: {}", secretPath);
                
                VaultResponseSupport<Map> response = vaultTemplate.read(secretPath, Map.class);
                
                if (response != null && response.getData() != null) {
                    Map<String, Object> data = (Map<String, Object>) response.getData().get("data");
                    log.info("✅ Successfully read secret!");
                    log.info("   Username: {}", data.get("username"));
                    log.info("   Password: {}", data.get("password"));
                } else {
                    log.warn("⚠️ Secret not found at path: {}", secretPath);
                }
                
                log.info("\n✅ Vault connection test completed successfully!\n");
                
            } catch (Exception e) {
                log.error("❌ Vault connection failed: {}", e.getMessage());
                e.printStackTrace();
            }
        };
    }
}