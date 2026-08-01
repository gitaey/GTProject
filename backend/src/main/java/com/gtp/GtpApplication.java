package com.gtp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@SpringBootApplication
@EnableJpaAuditing
public class GtpApplication {

    public static void main(String[] args) {
        SpringApplication.run(GtpApplication.class, args);
    }

}
