package com.gtp.domain.bot.discord;

import com.gtp.domain.bot.message.dto.BotMessageRequest;
import com.gtp.domain.bot.message.dto.BotMessageResult;
import com.gtp.domain.bot.message.service.BotMessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.entities.MessageEmbed;
import net.dv8tion.jda.api.events.message.MessageReceivedEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import org.springframework.stereotype.Component;

import java.awt.*;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class DiscordMessageListener extends ListenerAdapter {

    private final BotMessageService botMessageService;

    @Override
    public void onMessageReceived(MessageReceivedEvent event) {
        if (event.getAuthor().isBot()) return;

        String message = event.getMessage().getContentRaw().trim();
        if (!message.startsWith("/")) return;

        String room   = event.getChannel().getName();
        String sender = event.getAuthor().getName();

        BotMessageRequest req = new BotMessageRequest(room, message, sender);
        BotMessageResult result = botMessageService.handle(req);

        if (result.getReply() == null || result.getReply().isBlank()) return;

        String command = message.split(" ")[0];

        List<MessageEmbed> embeds = buildEmbeds(command, result);
        event.getChannel().sendMessageEmbeds(embeds).queue();
    }

    private List<MessageEmbed> buildEmbeds(String command, BotMessageResult result) {
        List<MessageEmbed> embeds = new ArrayList<>();
        Color color = getCommandColor(command);
        String reply = result.getReply();

        // 텍스트를 4000자 단위로 분할
        int maxLen = 4000;
        List<String> chunks = new ArrayList<>();
        while (!reply.isEmpty()) {
            int end = Math.min(reply.length(), maxLen);
            if (end < reply.length()) {
                int lastNewline = reply.lastIndexOf('\n', end);
                if (lastNewline > 0) end = lastNewline;
            }
            chunks.add(reply.substring(0, end));
            reply = reply.substring(end).stripLeading();
        }

        for (int i = 0; i < chunks.size(); i++) {
            EmbedBuilder embed = new EmbedBuilder()
                    .setColor(color)
                    .setDescription("```\n" + chunks.get(i) + "\n```");


            embeds.add(embed.build());
        }

        return embeds;
    }

    private Color getCommandColor(String command) {
        return switch (command) {
            case "/정보"                             -> new Color(0x5865F2);
            case "/각인"                             -> new Color(0x2ECC71);
            case "/보석"                             -> new Color(0xF1C40F);
            case "/스킬"                             -> new Color(0xE74C3C);
            case "/악세"                             -> new Color(0x9B59B6);
            case "/팔찌"                             -> new Color(0x1ABC9C);
            case "/장비"                             -> new Color(0xE67E22);
            case "/내실"                             -> new Color(0xE91E63);
            case "/아크패시브"                       -> new Color(0x00BCD4);
            case "/아크그리드"                       -> new Color(0x3498DB);
            case "/로펙"                             -> new Color(0xFF6B6B);
            case "/원정대"                           -> new Color(0xFFA500);
            case "/분배금"                           -> new Color(0xFFD700);
            case "/일정", "/일정전체", "/오늘일정"   -> new Color(0xFF9800);
            default                                  -> new Color(0x99AAB5);
        };
    }
}
