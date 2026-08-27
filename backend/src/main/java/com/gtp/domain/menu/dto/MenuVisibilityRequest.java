package com.gtp.domain.menu.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Getter
@NoArgsConstructor
public class MenuVisibilityRequest {
    private String role;
    private String permission; // nullable
    private List<String> menuIds;
}
