package com.gtp.domain.lostark.raid.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class PartyMember {
    private String nickname;
    private String className;
    private String itemLevel;
    private String power;       // 원본: "7156.97 / L7044.36"
    private String expedition;
    private boolean support;

    /** 로펙 점수: L 접두사 붙여서 반환 (예: "7044.36" → "L7044.36") */
    public String getFormattedPower() {
        if (power == null || power.isEmpty()) return "";
        return power.startsWith("L") ? power : "L" + power;
    }

    /** 채팅 표시용 문자열: [S]/[D] 닉네임 | 전투력 */
    public String getDisplayString() {
        String tag = support ? "[S]" : "[D]";
        String p = getFormattedPower();
        return tag + " " + nickname + (p.isEmpty() ? "" : " | " + p);
    }
}
