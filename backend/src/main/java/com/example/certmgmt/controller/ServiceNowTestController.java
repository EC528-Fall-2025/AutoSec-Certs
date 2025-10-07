package com.example.certmgmt.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/servicenow")
public class ServiceNowTestController {

    @Autowired
    private WebClient serviceNowWebClient;

    @GetMapping("/incidents")
    public Mono<String> getIncidents() {
        return serviceNowWebClient.get()
            .uri("/api/now/table/incident?sysparm_limit=3")
            .retrieve()
            .bodyToMono(String.class);
    }
}