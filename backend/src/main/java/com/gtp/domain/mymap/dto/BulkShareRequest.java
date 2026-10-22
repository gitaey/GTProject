package com.gtp.domain.mymap.dto;

import java.util.List;

/** 일괄 공유 요청. mode = ADD(기존 공유에 합치기) | REMOVE(해당 대상만 빼기). 덮어쓰기는 없다. */
public record BulkShareRequest(List<Long> ids, String mode, List<String> userIds, List<String> roleCodes) {
}
