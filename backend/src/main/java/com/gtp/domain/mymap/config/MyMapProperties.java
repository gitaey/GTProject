package com.gtp.domain.mymap.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * 나만의지도 설정({@code mymap.*}). 비밀값 기본값은 두지 않는다 — 참조 DB 접속 정보는 환경 변수로만 채운다.
 * 테이블·컬럼 이름도 전부 설정이라 다른 프로젝트로 옮길 때 yml만 바꾸면 된다(구현 교체는 포트 {@code PnuParcelProvider}).
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "mymap")
public class MyMapProperties {

    /** 엑셀 미리보기·shp 임시 파일 폴더 */
    private String uploadDir = "./mymap-uploads";

    private Limits limits = new Limits();
    private Ref ref = new Ref();
    private Upload upload = new Upload();
    private Maintenance maintenance = new Maintenance();

    @Getter
    @Setter
    public static class Limits {
        private int maxLayersPerUser = 20;
        private int maxRowsPnu = 5000;
        private int maxRowsAddress = 5000;
        private int maxRowsCoord = 5000;
        private int maxShpFeatures = 100_000;
        private int maxExcelMb = 10;
        private int maxShpMb = 300;
    }

    @Getter
    @Setter
    public static class Ref {
        /** postgis(서비스 DB의 ref 스키마) | fake(시험·로컬 개발 — 가짜 사각형 필지) */
        private String provider = "postgis";
        /** 비우면 전국. 지역 제한이 필요할 때만 "36,30" 처럼 채운다(설정 훅). 목록 밖 시도는 OUT_OF_COVERAGE */
        private List<String> allowedSidoCodes = new ArrayList<>();
        /**
         * "전국"의 기준 시도코드. 적재 기록(ref.load_meta)에 이 코드가 전부 있어야 한도 응답의 nationwide=true다.
         * 기본은 VWorld 2026-10 연속지적도의 16개(12 = 전남광주통합, 29·46은 없음). 행정구역이 또 바뀌면 이 값을 바꾼다.
         */
        private List<String> expectedSidoCodes = new ArrayList<>(List.of(
                "11", "12", "26", "27", "28", "30", "31", "36", "41", "43", "44", "47", "48", "50", "51", "52"));
        private Parcel parcel = new Parcel();
        private Table legalDong = new Table("ref.legal_dong");
        private Table roadAddress = new Table("ref.road_address");
        /** 적재 기록 표(데이터셋·시도별 기준월·교체 중 여부) */
        private String loadMetaTable = "ref.load_meta";
        private Datasource datasource = new Datasource();
        /** 시도 파티션 교체 중이면 이 시간까지 기다렸다가 매칭한다 */
        private int swapWaitSeconds = 120;
        private long swapPollMillis = 2000;
    }

    @Getter
    @Setter
    public static class Parcel {
        private String table = "ref.lsmd_cont_ldreg";
        private String pnuColumn = "pnu";
        private String jibunColumn = "jibun";
        private String sidoColumn = "sido";
        private String geomColumn = "geom";
        private int srid = 4326;
    }

    @Getter
    @Setter
    public static class Table {
        private String table;

        public Table() {
        }

        public Table(String table) {
            this.table = table;
        }
    }

    /** 비우면 서비스 DataSource를 읽기 전용으로 쓴다. 값은 환경 변수(MYMAP_REF_DB_*)로만 */
    @Getter
    @Setter
    public static class Datasource {
        private String url = "";
        private String username = "";
        private String password = "";
        private int maxPoolSize = 3;
        private long connectionTimeoutMillis = 5000;

        public boolean isConfigured() {
            return url != null && !url.isBlank();
        }
    }

    @Getter
    @Setter
    public static class Upload {
        /** 미리보기 유효 시간(분) */
        private int previewTtlMinutes = 30;
        /** 서버 재시작 등으로 주인 잃은 임시 xlsx를 지우는 기준(분). 처리 중인 파일을 지우지 않도록 TTL보다 훨씬 길게 */
        private int orphanFileMinutes = 120;
        /** 이 시간 넘게 진행 기록이 없는 PROCESSING 레이어는 기동 때 FAILED로 정리 */
        private int stalledMinutes = 30;
        private int queueCapacity = 20;
        private int poolSize = 2;
    }

    @Getter
    @Setter
    public static class Maintenance {
        /** 정리 작업(@Scheduled·기동 때 중단 정리) 사용 여부. 로컬에서 운영 DB를 보는 개발자는 끌 수 있다 */
        private boolean enabled = true;
        private int failureRetentionDays = 30;
    }

    /** 모드별 행 수 한도 */
    public int maxRowsFor(com.gtp.domain.mymap.model.ImportMode mode) {
        return switch (mode) {
            case PNU -> limits.maxRowsPnu;
            case ADDRESS -> limits.maxRowsAddress;
            case COORD -> limits.maxRowsCoord;
        };
    }
}
