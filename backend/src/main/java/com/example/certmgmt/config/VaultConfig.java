package com.example.certmgmt.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.vault.authentication.TokenAuthentication;
import org.springframework.vault.client.VaultEndpoint;
import org.springframework.vault.core.VaultTemplate;

@Configuration
public class VaultConfig {

    @Value("${vault.host:127.0.0.1}")
    private String vaultHost;

    @Value("${vault.port:8200}")
    private int vaultPort;

    @Value("${vault.scheme:http}")
    private String vaultScheme;

    @Value("${vault.token}")
    private String vaultToken;

    @Bean
    public VaultTemplate vaultTemplate() {
        VaultEndpoint endpoint = VaultEndpoint.create(vaultHost, vaultPort);
        endpoint.setScheme(vaultScheme);

        TokenAuthentication tokenAuth = new TokenAuthentication(vaultToken);

        return new VaultTemplate(endpoint, tokenAuth);
    }
}