-- ============================================================================
-- 도로명주소 건물DB 참조 표 (`ref` 스키마) — 주소 엑셀(나만의지도 2단계)의 "도로명주소 → PNU → 연속지적도" 변환용
--
-- 원본: 행정안전부 주소기반산업지원서비스(business.juso.go.kr) > 주소정보 자료제공 > 건물DB(전체분)
--       「도로명주소 활용 가이드(건물DB)」 붙임 1의 레이아웃 그대로(파이프 구분, MS949). 열 이름은 raise2024 DB의 js_bld_*와 같다.
-- 실행 시점: 적재 전 한 번(여러 번 실행해도 안전 — IF NOT EXISTS). 실행 계정: ref 스키마 소유(적재용) 계정.
--           psql -v ON_ERROR_STOP=1 -1 -f init-ref-juso-schema.sql   (init-ref-schema.sql 다음에)
-- 이 표들은 비어 있는 틀이다. 데이터는 load-juso.sh가 새 표에 적재한 뒤 이 이름으로 교체한다(인덱스·제약은 그때 만든다).
-- JPA 엔티티로 매핑하지 않는다(ddl-auto가 건드리지 못함). 앱은 JdbcTemplate으로 읽기만 한다.
--
-- PNU 만들기(건물정보·관련지번 공통): adm_cd || (mntn_yn::int + 1) || lpad(lnbr_mnnm, 4, '0') || lpad(lnbr_slno, 4, '0')
--   산여부 0(대지)→PNU 11번째 자리 1, 1(산)→2.  이렇게 만든 PNU로 ref.lsmd_cont_ldreg(연속지적도)의 폴리곤을 찾는다.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS ref;

-- ===== 건물정보 (원본 TI_SPBD_BULD, 전체 약 1,072만 건) — 건물 1건 = 1행 =====
CREATE TABLE IF NOT EXISTS ref.ti_spbd_buld (
    adm_cd           varchar(10),
    ctp_kor_nm       varchar(40),
    sig_kor_nm       varchar(40),
    emd_kor_nm       varchar(40),
    li_kor_nm        varchar(40),
    mntn_yn          varchar(1),
    lnbr_mnnm        integer,
    lnbr_slno        integer,
    road_cd          varchar(12),
    rn               varchar(80),
    udgd_yn          varchar(1),
    buld_mnnm        integer,
    buld_slno        integer,
    buld_nm          varchar(40),
    buld_nm_dc       varchar(100),
    bd_mgt_sn        varchar(25) NOT NULL,
    emd_no           varchar(2),
    adm_dong_cd      varchar(10),
    adm_dong_nm      varchar(40),
    zip_cd           varchar(5),
    zip_seq          varchar(3),
    bignum_deliv_nm  varchar(40),
    mv_rs_cd         varchar(2),
    ntfc_de          varchar(8),
    bfr_road_addr    varchar(25),
    sgg_buld_nm      varchar(40),
    apt_yn           varchar(1),
    bsi_zon_no       varchar(5),
    detl_addr_yn     varchar(1),
    rmk1             varchar(15),
    rmk2             varchar(15)
);
COMMENT ON TABLE ref.ti_spbd_buld IS '도로명주소 건물DB - 건물정보 (행정안전부 주소기반산업지원서비스, 원본 TI_SPBD_BULD). 건물 1건 = 1행, PK = 건물관리번호(bd_mgt_sn)';
COMMENT ON COLUMN ref.ti_spbd_buld.adm_cd          IS '법정동코드 (10자리)';
COMMENT ON COLUMN ref.ti_spbd_buld.ctp_kor_nm      IS '시도명';
COMMENT ON COLUMN ref.ti_spbd_buld.sig_kor_nm      IS '시군구명';
COMMENT ON COLUMN ref.ti_spbd_buld.emd_kor_nm      IS '법정읍면동명';
COMMENT ON COLUMN ref.ti_spbd_buld.li_kor_nm       IS '법정리명';
COMMENT ON COLUMN ref.ti_spbd_buld.mntn_yn         IS '산여부 (0:대지, 1:산)';
COMMENT ON COLUMN ref.ti_spbd_buld.lnbr_mnnm       IS '지번본번(번지)';
COMMENT ON COLUMN ref.ti_spbd_buld.lnbr_slno       IS '지번부번(호)';
COMMENT ON COLUMN ref.ti_spbd_buld.road_cd         IS '도로명코드 (시군구코드 5자리 + 도로명번호 7자리)';
COMMENT ON COLUMN ref.ti_spbd_buld.rn              IS '도로명';
COMMENT ON COLUMN ref.ti_spbd_buld.udgd_yn         IS '지하여부 (0:지상, 1:지하, 2:공중, 3:수상)';
COMMENT ON COLUMN ref.ti_spbd_buld.buld_mnnm       IS '건물본번';
COMMENT ON COLUMN ref.ti_spbd_buld.buld_slno       IS '건물부번';
COMMENT ON COLUMN ref.ti_spbd_buld.buld_nm         IS '건축물대장 건물명';
COMMENT ON COLUMN ref.ti_spbd_buld.buld_nm_dc      IS '상세건물명';
COMMENT ON COLUMN ref.ti_spbd_buld.bd_mgt_sn       IS '건물관리번호 (PK, 25자리)';
COMMENT ON COLUMN ref.ti_spbd_buld.emd_no          IS '읍면동일련번호';
COMMENT ON COLUMN ref.ti_spbd_buld.adm_dong_cd     IS '행정동코드 (참고용)';
COMMENT ON COLUMN ref.ti_spbd_buld.adm_dong_nm     IS '행정동명 (참고용)';
COMMENT ON COLUMN ref.ti_spbd_buld.zip_cd          IS '우편번호 (2015.8.1 이후 기초구역번호(신우편번호) 제공)';
COMMENT ON COLUMN ref.ti_spbd_buld.zip_seq         IS '우편일련번호 (2015.8.1 이후 미제공, NULL)';
COMMENT ON COLUMN ref.ti_spbd_buld.bignum_deliv_nm IS '다량배달처명 (NULL)';
COMMENT ON COLUMN ref.ti_spbd_buld.mv_rs_cd        IS '이동사유코드 (31:신규, 34:변동, 63:폐지, 72:건물군내 일부 건물 폐지, 73:건물군내 일부 건물 생성)';
COMMENT ON COLUMN ref.ti_spbd_buld.ntfc_de         IS '고시일자 (YYYYMMDD)';
COMMENT ON COLUMN ref.ti_spbd_buld.bfr_road_addr   IS '변동전도로명주소 (NULL)';
COMMENT ON COLUMN ref.ti_spbd_buld.sgg_buld_nm     IS '시군구용 건물명';
COMMENT ON COLUMN ref.ti_spbd_buld.apt_yn          IS '공동주택여부 (0:비공동주택, 1:공동주택)';
COMMENT ON COLUMN ref.ti_spbd_buld.bsi_zon_no      IS '기초구역번호';
COMMENT ON COLUMN ref.ti_spbd_buld.detl_addr_yn    IS '상세주소여부 (0:미부여, 1:부여)';
COMMENT ON COLUMN ref.ti_spbd_buld.rmk1            IS '비고1 (NULL)';
COMMENT ON COLUMN ref.ti_spbd_buld.rmk2            IS '비고2 (NULL)';

-- ===== 관련지번 (원본 TI_SCCO_MVMN, 전체 약 177만 건) — 건물에 딸린 지번(필지), 건물 1건에 여러 행 =====
CREATE TABLE IF NOT EXISTS ref.ti_scco_mvmn (
    adm_cd      varchar(10),
    ctp_kor_nm  varchar(40),
    sig_kor_nm  varchar(40),
    emd_kor_nm  varchar(40),
    li_kor_nm   varchar(40),
    mntn_yn     varchar(1),
    lnbr_mnnm   integer,
    lnbr_slno   integer,
    road_cd     varchar(12) NOT NULL,
    udgd_yn     varchar(1)  NOT NULL,
    buld_mnnm   integer     NOT NULL,
    buld_slno   integer     NOT NULL,
    jibun_seq   integer     NOT NULL,
    mv_rs_cd    varchar(2)
);
COMMENT ON TABLE ref.ti_scco_mvmn IS '도로명주소 건물DB - 관련지번 (원본 TI_SCCO_MVMN). 건물에 딸린 지번(필지) 목록, 건물 1건에 여러 행. PK = 도로명코드+지하여부+건물본번+건물부번+지번일련번호';
COMMENT ON COLUMN ref.ti_scco_mvmn.adm_cd     IS '법정동코드 (10자리)';
COMMENT ON COLUMN ref.ti_scco_mvmn.ctp_kor_nm IS '시도명';
COMMENT ON COLUMN ref.ti_scco_mvmn.sig_kor_nm IS '시군구명';
COMMENT ON COLUMN ref.ti_scco_mvmn.emd_kor_nm IS '법정읍면동명';
COMMENT ON COLUMN ref.ti_scco_mvmn.li_kor_nm  IS '법정리명';
COMMENT ON COLUMN ref.ti_scco_mvmn.mntn_yn    IS '산여부 (0:대지, 1:산)';
COMMENT ON COLUMN ref.ti_scco_mvmn.lnbr_mnnm  IS '지번본번(번지)';
COMMENT ON COLUMN ref.ti_scco_mvmn.lnbr_slno  IS '지번부번(호)';
COMMENT ON COLUMN ref.ti_scco_mvmn.road_cd    IS '도로명코드 (시군구코드 5자리 + 도로명번호 7자리) - PK1';
COMMENT ON COLUMN ref.ti_scco_mvmn.udgd_yn    IS '지하여부 (0:지상, 1:지하, 2:공중, 3:수상) - PK2';
COMMENT ON COLUMN ref.ti_scco_mvmn.buld_mnnm  IS '건물본번 - PK3';
COMMENT ON COLUMN ref.ti_scco_mvmn.buld_slno  IS '건물부번 - PK4';
COMMENT ON COLUMN ref.ti_scco_mvmn.jibun_seq  IS '지번일련번호 - PK5';
COMMENT ON COLUMN ref.ti_scco_mvmn.mv_rs_cd   IS '이동사유코드 (31:신규, 34:변동, 63:폐지)';

-- ===== 도로명코드 (원본 TI_SPRD_STRET, 전체 약 37만 건) — 도로명 1건 = 1행 =====
-- road_cd는 원본 열이 아니라 sgg_cd || road_no로 만드는 계산 열(건물정보·관련지번의 road_cd와 같은 12자리 키)
CREATE TABLE IF NOT EXISTS ref.ti_sprd_stret (
    sgg_cd         varchar(5)  NOT NULL,
    road_no        varchar(7)  NOT NULL,
    road_cd        varchar(12) GENERATED ALWAYS AS (sgg_cd || road_no) STORED,
    rn             varchar(80),
    rn_eng         varchar(80),
    emd_no         varchar(2)  NOT NULL,
    ctp_kor_nm     varchar(40),
    sig_kor_nm     varchar(40),
    emd_gb         varchar(1),
    emd_cd         varchar(3),
    emd_kor_nm     varchar(40),
    up_road_no     varchar(7),
    up_rn          varchar(80),
    use_yn         varchar(1),
    chg_rs_cd      varchar(1),
    chg_hist_info  varchar(14),
    ctp_eng_nm     varchar(40),
    sig_eng_nm     varchar(40),
    emd_eng_nm     varchar(40),
    ntfc_de        varchar(8),
    ersr_de        varchar(8)
);
COMMENT ON TABLE ref.ti_sprd_stret IS '도로명주소 건물DB - 도로명코드 (원본 TI_SPRD_STRET). 도로명 1건 = 1행. PK = 시군구코드+도로명번호+읍면동일련번호';
COMMENT ON COLUMN ref.ti_sprd_stret.sgg_cd         IS '시군구코드 (5자리) - PK1';
COMMENT ON COLUMN ref.ti_sprd_stret.road_no        IS '도로명번호 (7자리) - PK1';
COMMENT ON COLUMN ref.ti_sprd_stret.road_cd        IS '도로명코드 (시군구코드 5자리 + 도로명번호 7자리, 계산 열). 건물정보·관련지번과 잇는 키';
COMMENT ON COLUMN ref.ti_sprd_stret.rn             IS '도로명';
COMMENT ON COLUMN ref.ti_sprd_stret.rn_eng         IS '영문도로명';
COMMENT ON COLUMN ref.ti_sprd_stret.emd_no         IS '읍면동일련번호 - PK2';
COMMENT ON COLUMN ref.ti_sprd_stret.ctp_kor_nm     IS '시도명';
COMMENT ON COLUMN ref.ti_sprd_stret.sig_kor_nm     IS '시군구명';
COMMENT ON COLUMN ref.ti_sprd_stret.emd_gb         IS '읍면동구분 (0:읍면, 1:동, 2:미부여)';
COMMENT ON COLUMN ref.ti_sprd_stret.emd_cd         IS '읍면동코드 (법정동 기준 읍면동 코드, 3자리)';
COMMENT ON COLUMN ref.ti_sprd_stret.emd_kor_nm     IS '읍면동명';
COMMENT ON COLUMN ref.ti_sprd_stret.up_road_no     IS '상위도로명번호';
COMMENT ON COLUMN ref.ti_sprd_stret.up_rn          IS '상위도로명';
COMMENT ON COLUMN ref.ti_sprd_stret.use_yn         IS '사용여부 (0:사용, 1:미사용)';
COMMENT ON COLUMN ref.ti_sprd_stret.chg_rs_cd      IS '변경이력사유 (0:도로명변경, 1:도로명폐지, 2:시도시군구변경, 3:읍면동변경, 4:영문도로명변경, 9:기타)';
COMMENT ON COLUMN ref.ti_sprd_stret.chg_hist_info  IS '변경이력정보 (도로명코드 12자리 + 읍면동일련번호 2자리, 신규 정보는 "신규")';
COMMENT ON COLUMN ref.ti_sprd_stret.ctp_eng_nm     IS '영문시도명';
COMMENT ON COLUMN ref.ti_sprd_stret.sig_eng_nm     IS '영문시군구명';
COMMENT ON COLUMN ref.ti_sprd_stret.emd_eng_nm     IS '영문읍면동명';
COMMENT ON COLUMN ref.ti_sprd_stret.ntfc_de        IS '고시일자 (도로명코드 고시일자, YYYYMMDD)';
COMMENT ON COLUMN ref.ti_sprd_stret.ersr_de        IS '말소일자 (도로명코드 말소일자, YYYYMMDD)';

-- 인덱스·PK는 여기서 만들지 않는다 — load-juso.sh가 새 표에 만든 뒤 교체한다(적재 속도). 교체 후 이름:
--   ti_spbd_buld  : ti_spbd_buld_pkey (bd_mgt_sn), ix_ti_spbd_buld_road (road_cd, udgd_yn, buld_mnnm, buld_slno),
--                   ix_ti_spbd_buld_jibun (adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno) — 지번 → 건물 조회(주소 변환의 지번 입력 행 도로명주소). 이미 적재된 표에는 add-ix-juso-jibun.sql
--   ti_scco_mvmn  : ti_scco_mvmn_pkey (road_cd, udgd_yn, buld_mnnm, buld_slno, jibun_seq)
--   ti_sprd_stret : ti_sprd_stret_pkey (sgg_cd, road_no, emd_no), ix_ti_sprd_stret_name (ctp_kor_nm, sig_kor_nm, rn)
-- 적재 기록은 ref.load_meta에 dataset = 'ti_spbd_buld' | 'ti_scco_mvmn' | 'ti_sprd_stret', sido = '00'(전국 단위)로 남는다.

-- 확인(읽기 전용):
--   SELECT * FROM ref.load_meta WHERE sido = '00' ORDER BY dataset;
--   SELECT count(*) FROM ref.ti_spbd_buld;
