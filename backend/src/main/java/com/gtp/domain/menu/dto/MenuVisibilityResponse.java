package com.gtp.domain.menu.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public class MenuVisibilityResponse {
    private String role;
    private String permission; // nullable
    private List<String> menuIds;
}
