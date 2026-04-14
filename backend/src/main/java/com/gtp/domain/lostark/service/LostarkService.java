package com.gtp.domain.lostark.service;

import com.gtp.domain.lostark.dto.CharacterResponse;
import com.gtp.global.exception.CustomException;
import com.gtp.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class LostarkService {

    @Value("${lostark.api.key}")
    private String apiKey;

    private static final String BASE_URL = "https://developer-lostark.game.onstove.com";

    public CharacterResponse getCharacter(String name) {
        RestTemplate restTemplate = new RestTemplate();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "bearer " + apiKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<CharacterResponse> response = restTemplate.exchange(
                BASE_URL + "/armories/characters/" + name + "/profiles",
                HttpMethod.GET,
                entity,
                CharacterResponse.class
            );
            return response.getBody();
        } catch (Exception e) {
            log.error("LostArk API error: {}", e.getMessage());
            throw new CustomException(ErrorCode.LOSTARK_API_ERROR);
        }
    }
}