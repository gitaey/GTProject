package com.gtp.domain.bot.discord;

import com.gtp.domain.bot.message.dto.BotMessageRequest;
import com.gtp.domain.bot.message.dto.BotMessageResult;
import com.gtp.domain.bot.message.service.BotMessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.dv8tion.jda.api.events.message.MessageReceivedEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import org.springframework.stereotype.Component;

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

        // Discord 메시지 2000자 제한 - 초과 시 분할 전송
        String reply = result.getReply();
        while (!reply.isEmpty()) {
            int end = Math.min(reply.length(), 2000);
            event.getChannel().sendMessage(reply.substring(0, end)).queue();
            reply = reply.substring(end);
        }
    }
}
