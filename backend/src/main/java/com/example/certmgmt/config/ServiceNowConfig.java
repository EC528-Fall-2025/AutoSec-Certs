package com.example.certmgmt.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Configuration
public class ServiceNowConfig {
    
    @Value("${servicenow.base-url}")
    private String baseUrl;
    
    @Value("${servicenow.username}")
    private String username;
    
    @Value("${servicenow.password}")
    private String password;
    
    @Bean
    public WebClient serviceNowWebClient() {
        return WebClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
            .defaultHeaders(header -> header.setBasicAuth(username, password))
            .codecs(configurer -> configurer
                .defaultCodecs()
                .maxInMemorySize(5 * 1024 * 1024))
            .build();
    }
    
    @Bean
    public RestTemplate serviceNowRestTemplate() {
        RestTemplate restTemplate = new RestTemplate();
        
        restTemplate.getInterceptors().add((request, body, execution) -> {
            String auth = username + ":" + password;
            byte[] encodedAuth = Base64.getEncoder()
                .encode(auth.getBytes(StandardCharsets.UTF_8));
            String authHeader = "Basic " + new String(encodedAuth);
            request.getHeaders().set("Authorization", authHeader);
            return execution.execute(request, body);
        });
        
        return restTemplate;
    }
}