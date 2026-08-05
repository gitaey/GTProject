package com.gtp.domain.bot.discord;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.JDABuilder;
import net.dv8tion.jda.api.requests.GatewayIntent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DiscordBotService {

    @Value("${discord.bot.token:}")
    private String token;

    private final DiscordMessageListener listener;

    private JDA jda;

    @PostConstruct
    public void init() {
        if (token == null || token.isBlank()) {
            log.info("DISCORD_BOT_TOKEN 미설정 — Discord 봇 비활성화");
            return;
        }
        try {
            jda = JDABuilder.createDefault(token)
                    .enableIntents(GatewayIntent.MESSAGE_CONTENT, GatewayIntent.GUILD_MESSAGES)
                    .addEventListeners(listener)
                    .build();
            jda.awaitReady();
            log.info("Discord 봇 시작 완료: {}", jda.getSelfUser().getName());
        } catch (Exception e) {
            log.error("Discord 봇 시작 실패: {}", e.getMessage());
        }
    }

    @PreDestroy
    public void shutdown() {
        if (jda != null) {
            jda.shutdown();
            log.info("Discord 봇 종료");
        }
    }
}
