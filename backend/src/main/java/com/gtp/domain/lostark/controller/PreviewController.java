package com.gtp.domain.lostark.controller;

import com.gtp.domain.lostark.dto.armory.ArmoryProfile;
import com.gtp.domain.lostark.service.LostarkService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class PreviewController {

    private final LostarkService lostarkService;

    @GetMapping(value = "/preview/character/{name}", produces = "text/html;charset=UTF-8")
    public String characterPreview(@PathVariable String name) {
        try {
            ArmoryProfile p = lostarkService.getCharacter(name);
            if (p == null) return errorHtml(name);

            String title = p.getCharacterName() + " (" + p.getCharacterClassName() + ")";
            String desc = p.getServerName()
                + " | 아이템 " + p.getItemAvgLevel()
                + " | 전투력 " + p.getCombatPower()
                + (p.getGuildName() != null ? " | " + p.getGuildName() : "");
            String image = p.getCharacterImage() != null ? p.getCharacterImage() : "";

            return "<!DOCTYPE html><html><head>"
                + "<meta charset=\"UTF-8\">"
                + "<meta property=\"og:type\" content=\"website\">"
                + "<meta property=\"og:title\" content=\"" + escapeHtml(title) + "\">"
                + "<meta property=\"og:description\" content=\"" + escapeHtml(desc) + "\">"
                + "<meta property=\"og:image\" content=\"" + escapeHtml(image) + "\">"
                + "<meta property=\"og:image:width\" content=\"300\">"
                + "<meta property=\"og:image:height\" content=\"400\">"
                + "<title>" + escapeHtml(title) + "</title>"
                + "</head><body>"
                + "<img src=\"" + escapeHtml(image) + "\" style=\"max-width:300px\">"
                + "<h2>" + escapeHtml(title) + "</h2>"
                + "<p>" + escapeHtml(desc) + "</p>"
                + "</body></html>";
        } catch (Exception e) {
            return errorHtml(name);
        }
    }

    private String errorHtml(String name) {
        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">"
            + "<meta property=\"og:title\" content=\"" + escapeHtml(name) + "\">"
            + "<meta property=\"og:description\" content=\"캐릭터를 찾을 수 없습니다.\">"
            + "<title>" + escapeHtml(name) + "</title>"
            + "</head><body><p>캐릭터를 찾을 수 없습니다.</p></body></html>";
    }

    private String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
