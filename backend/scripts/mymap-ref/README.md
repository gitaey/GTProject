# mymap-ref — 연속지적도·도로명주소 건물DB 적재 스크립트

나만의지도의 PNU 엑셀 매칭이 읽는 참조 데이터(`ref.lsmd_cont_ldreg`)와, 주소 엑셀이 읽는 도로명주소 건물DB(`ref.ti_spbd_buld`·`ref.ti_sprd_stret`·`ref.ti_scco_mvmn`)를 만드는 도구다. **앱이 하지 않고 운영자가 앞서 실행한다.**
이 폴더의 스크립트는 DB에 직접 쓰므로 실행은 사용자(또는 메인 세션이 사용자 요청으로)만 한다.

| 파일 | 내용 |
|---|---|
| `init-ref-schema.sql` | `ref` 스키마·`ref.lsmd_cont_ldreg`(시도별 파티션 20개)·`ref.load_meta` 만들기 — **한 번**, 적재 전에 |
| `load-parcel.sh` | VWorld 연속지적도(zip/shp)를 시도별로 적재·검증·교체 |
| `init-ref-juso-schema.sql` | 도로명주소 건물DB 빈 틀 3표(`ti_spbd_buld`·`ti_scco_mvmn`·`ti_sprd_stret`) — **한 번**, `init-ref-schema.sql` 다음에 (여러 번 실행해도 안전) |
| `load-juso.sh` | 건물DB 전체분 txt(파이프·MS949)를 표별로 적재·검증·교체 — 아래 "도로명주소 건물DB(주소 엑셀용)" |
| `rename-parcel-to-lsmd_cont_ldreg.sql` | 표 이름을 옛 `ref.parcel`에서 `ref.lsmd_cont_ldreg`로 바꾸는 이관 SQL — **이미 `ref.parcel`로 적재한 DB에서 한 번**, 새 코드 배포 **전에** (처음부터 새로 만드는 DB는 필요 없음) |

## 로컬 개발 주의 (크게)
**로컬 `application-local.yml`의 DB는 운영 DB다.** 로컬 백엔드를 띄워 나만의지도를 시험하기 전에 gitignore된 `application-local.yml`에 아래를 넣는다.
```yaml
mymap:
  maintenance:
    enabled: false      # 기동 직후 운영의 PROCESSING 레이어를 FAILED로 바꾸는 정리 작업과 실패 행 삭제를 끈다
  ref:
    provider: fake      # 운영 ref.lsmd_cont_ldreg 대신 가짜 사각형 필지 — 업로드가 운영 tbl_user_map에 실제 레이어를 만드는 일은 남는다(작은 파일로만)
```
`provider`를 `postgis`로 둔 채 PNU 업로드를 시험하면 운영에 실제 레이어·피처·실패 행이 생긴다. S1 SQL(`backend/scripts/mymap/ddl-stage1.sql`)을 실행하기 전에는 새 엔티티로 로컬 백엔드를 띄우지 않는다.

## 준비물
- PostgreSQL 14 이상 + PostGIS, GDAL(`ogr2ogr`·`ogrinfo`), `psql`, bash(4 이상 — Git Bash 가능)
- 이 PC: `C:/OSGeo4W/apps/gdal-dev/bin/ogr2ogr.exe`·`ogrinfo.exe`, `C:/OSGeo4W/bin/psql.exe`(PATH에는 없음)
- 접속 정보는 **환경 변수로만**(스크립트·명령줄에 쓰지 않는다): `PGHOST` `PGPORT` `PGDATABASE` `PGUSER`, 비밀번호는 `PGPASSWORD` 또는 `~/.pgpass`
- 실행 파일이 PATH에 없으면: `OGR2OGR=C:/OSGeo4W/apps/gdal-dev/bin/ogr2ogr.exe OGRINFO=C:/OSGeo4W/apps/gdal-dev/bin/ogrinfo.exe PSQL=C:/OSGeo4W/bin/psql.exe`
- OSGeo4W의 GDAL은 `GDAL_DATA`·`PROJ_DATA` 환경이 잡혀 있어야 좌표 변환이 된다(OSGeo4W Shell에서 실행하거나 `o4w_env.bat`을 먼저). 안 잡히면 "Cannot find ... GDAL_DATA is not defined" 경고가 나온다.

## 순서
1. **디스크 점검**: 세종(약 21만 필지)은 **실측 99MB**, 전국은 행당 약 0.5KB로 **약 16GB 추정**(2026-10 자료 기준, 표·PNU 인덱스 합계). 인덱스 빌드·WAL 여유까지 보면 첫 전국 적재는 **40GB 안팎의 여유**면 충분해 보인다(설계 초안의 "80GB"는 폴리곤 평균 0.6~1KB 가정이라 보수적이었다). 시도별 교체라 월 갱신의 피크 추가 공간은 가장 큰 시도 1개분(경기, 전국의 약 15~20% 추정 → 3GB 안팎). 백업은 `pg_dump -N ref`로 `ref` 제외.
2. **스키마**: `psql -v ON_ERROR_STOP=1 -1 -f init-ref-schema.sql`(적재 계정). 앱 계정에는 `ref` 읽기만 GRANT(파일 안 주석). 앱은 부모 표 `ref.lsmd_cont_ldreg`만 읽으므로 부모·`load_meta`에 SELECT면 충분하다.
3. **한 시도로 시험**(세종 36, 약 21만 필지):
   ```bash
   ./load-parcel.sh --dry-run --sido 36 "D:/데이터/연속지적도/20261008/AL_D002_36_20261008.zip"   # 명령만 확인
   ./load-parcel.sh --sido 36 --first-load "D:/데이터/연속지적도/20261008/AL_D002_36_20261008.zip"
   ```
4. **전국**(야간): `./load-parcel.sh --all "D:/데이터/연속지적도/20261008" --first-load`
   — 파일 이름 `AL_D002_<시도코드>_<YYYYMMDD>`에서 시도코드·기준월(2026-10)을 읽는다. 코드 오름차순으로 한 시도씩.
5. **끊기거나 일부 실패하면 같은 명령을 다시** 실행한다. 이미 같은 기준월로 적재된 시도는 건너뛰고(재시작 가능), 실패한 시도만 이어서 한다(`--force`면 다시).
6. **매월**: 새 zip을 받아 같은 명령(`--first-load` 빼기 → 지난달 대비 ±5% 검사가 켜진다).

zip은 풀지 않는다 — GDAL이 `/vsizip/`으로 바로 읽으므로 임시 디스크(압축 해제 20~30GB)가 필요 없다.

## 한 시도의 흐름
1. 새 표 `ref.lsmd_cont_ldreg_<c>_new`를 부모와 같은 모양으로(`LIKE ref.lsmd_cont_ldreg`) 만든다 — 인덱스·제약 없음.
2. 파일마다 `ogr2ogr`로 적재(`-append`, COPY, `PROMOTE_TO_MULTI`, 좌표 → EPSG:4326, 컬럼 이름 바꾸기·시도 계산은 OGR SQL).
3. **검증**(하나라도 실패하면 이 시도는 교체하지 않고 임시 표를 지운 뒤 다음 시도로): 행 수 = `ogrinfo` 피처 수, PNU 19자리 ≥ 99.9%, PNU 앞 2자리 = 시도코드, **법정동명(`bjd_name`) 글자 점검 — 값이 있는 행 중 한글 포함 ≥ 99%, 깨진 글자(`?`·U+FFFD) 0건**(한글 없는 시험 자료는 `--skip-text-check`), (기존 파티션이 비어 있지 않으면) 지난달 대비 ±5%. 잘못된 지오메트리는 `ST_MakeValid`로 고치고 빈 결과는 지운다.
4. 인덱스(PNU)·CHECK 제약·`ANALYZE`.
5. **교체 — 한 트랜잭션**: 옛 파티션 DETACH → 새 표 ATTACH → 이름 정리 → `ref.load_meta` 기록. 그 뒤 옛 표 DROP(`--keep-old`면 보관).
6. 끝에 성공/건너뜀/실패 시도 요약, 실패가 있으면 종료 코드 1.

## 원본 컬럼 매핑 (2026-10-08 받은 VWorld 파일에서 확인)
DBF 컬럼 이름이 A0~A7로 익명이다. 기본값이 이 이름이고 `--col-*` 인자로 바꿀 수 있다.

| 원본 | 내용 | ref.lsmd_cont_ldreg | 인자 |
|---|---|---|---|
| A0 | 일련번호 | (쓰지 않음) | |
| **A1** | PNU(19) | `pnu` (+ 앞 2자리 → `sido` 파티션 키) | `--col-pnu` |
| A2 | 법정동코드(10) | `bjd_code` | `--col-bjd-code` |
| A3 | 법정동 이름(254) — "세종특별자치시  금남면 …"(공백 둘 가능) | `bjd_name` | `--col-bjd-name` |
| A4 | 지번(10, 본번-부번) | `jibun` | `--col-jibun` |
| A5 | 지번+지목(200) — "13-41 답" | `jibun_jimok` (지목 분리는 형식 확인 뒤 2단계) | `--col-jimok` |
| A6 | 기준일(YYYYMMDD) | `base_date` | `--col-base-date` |
| A7 | 시군구코드(5) | `sgg_code` | `--col-sgg` |

좌표계는 `.prj`(Korea 2000 Central Belt 2010 = EPSG:5186)를 따른다(`--s-srs`로 덮어씀).
**글자 인코딩은 기본 CP949다.** VWorld 파일의 `.cpg`에는 UTF-8이라고 적혀 있지만 DBF 실제 내용은 CP949다(2026-10 세종으로 확인 — `.cpg`를 따르면 `bjd_name`이 `����Ư����ġ`처럼 깨진다. GDAL로 `.cpg`=UTF-8·실제 CP949 파일을 만들어 같은 증상과 `SHAPE_ENCODING=CP949`로 고쳐지는 것을 재현해 확인했다). 진짜 UTF-8로 바뀐 자료면 `--encoding UTF-8`, `.cpg`를 따르려면 `--encoding auto`. 인코딩이 틀려도 행 수·PNU 검사는 통과하므로 검증에 **글자 점검**을 넣었다(아래).
2단계 주소 매칭은 `bjd_name`(법정동 이름)+`jibun`으로 PNU를 찾을 수 있으므로 별도 법정동코드 표 없이도 가능할 수 있다 — 2단계에서 정한다. 지금은 컬럼만 저장하고 인덱스는 만들지 않는다.

## 설계와 달라진 점 (이유)
- **기본 파티션을 두지 않는다.** 설계는 기본 파티션 + `DETACH CONCURRENTLY`였는데, 기본 파티션이 있으면 PostgreSQL이 `DETACH PARTITION ... CONCURRENTLY`를 거절한다("cannot detach partitions concurrently when a default partition exists"). 모르는 코드의 행은 적재 검증(PNU 앞 2자리 = 시도코드)에서 걸러진다.
- **교체는 CONCURRENTLY 대신 한 트랜잭션.** 떼기와 붙이기를 같은 트랜잭션에 넣으면 "그 시도 PNU가 잠깐 없는 필지로 보이는" 틈이 아예 없다. 부모 표에 몇 밀리초 배타 잠금이 걸리지만(CHECK 제약이 있어 붙일 때 전체 검사를 건너뜀) 읽기는 기다릴 뿐 실패하지 않는다(`lock_timeout` 30초 — 오래 걸리는 조회가 잡고 있으면 교체가 실패하고 지난달 데이터가 그대로이니 다시 실행). 그래서 `SWAPPING` 표시를 이 스크립트는 쓰지 않는다(앱은 그 값을 만나면 기다리는 기능을 갖고 있다).
- **시도코드 20개**: 현행 17 + **12(전남광주통합, 2026-10 파일에서 확인)** + 옛 29·46·42·45.

## UNLOGGED 적재 검토 (`--unlogged`, 기본 끔)
UNLOGGED 표는 WAL(복구 기록)을 쓰지 않아서 대량 적재가 빠르다고 알려져 있다. 그러나 이 설계에서는 득이 작아 기본을 끈다. 아래는 문서로 이해한 것이며 **이 PC에서 측정하지 못했다**(세종으로 직접 비교를 권한다).
- 부모 파티션에 **붙이려면 반드시 `SET LOGGED`** 가 필요하다(UNLOGGED 표는 일반 파티션 부모에 ATTACH 불가). `SET LOGGED`는 표(와 인덱스)를 **통째로 다시 쓰면서 WAL에 한꺼번에 기록**한다. 그래서 총 WAL 양은 비슷하고, 폭증 시점이 적재 중에서 교체 직전으로 옮겨질 뿐이다. 다시 쓰는 동안 그 시도분만큼 임시 디스크가 더 든다.
- 이득: 적재(COPY)와 인덱스 만들기 동안의 WAL이 없다 → 그 구간이 빠르다. WAL 아카이브·복제를 쓰지 않으면 단순히 시간이 줄어든다.
- 위험: 적재 중 서버가 죽으면 UNLOGGED 표는 비워진다 — 임시 표(`_new`)라 잃을 것이 없고 스크립트가 재시작 가능이라 실제 위험은 아니다. 복제(standby)·`archive_mode=on`이면 `SET LOGGED` 순간 WAL이 몰려 보관 공간이 갑자기 찬다.
- **권고**: 기본(LOGGED)으로 하고, WAL 폭증이 걱정되면 시도 단위로 나뉜다는 점(WAL이 시도별로 쪼개져 체크포인트·아카이브가 중간에 정리됨)과 서버 설정(`max_wal_size` 상향, `wal_compression=on`)으로 완화한다. `--unlogged`는 복제·아카이브가 없고 첫 전국 적재 시간을 줄이고 싶을 때만.
- 측정 방법(읽기 전용): 적재 전후에 `SELECT pg_current_wal_lsn();`을 찍어 `SELECT pg_size_pretty(pg_wal_lsn_diff('후','전'));`로 WAL 양을, 스크립트 로그의 초 단위 시간으로 시간을 본다.

## 문제 해결
- **"법정동명에 한글이 있는 행이 99% 미만" / "깨진 글자"**: 글자 인코딩이 틀렸다. 기본(CP949)이 안 맞는 자료면 `--encoding UTF-8` 또는 `--encoding auto`로 다시 실행(이 시도는 교체되지 않았으니 지난달 데이터는 그대로다). 이미 잘못된 인코딩으로 적재해 둔 시도는 `SELECT bjd_name, jibun_jimok FROM ref.lsmd_cont_ldreg_36 LIMIT 5;`로 확인하고 `--force --encoding CP949`로 다시 적재한다.
- **"PNU 앞 2자리가 <코드>가 아닌 행 N건"**: 시도 파일 하나에 다른 코드의 PNU가 섞인 경우(예: 12 파일에 옛 29·46 코드). 로그에 분포가 나온다. 파티션 규칙을 정해야 한다 — 12 파일이 29·46 접두 PNU를 담는다면 `ref.lsmd_cont_ldreg_12`를 `FOR VALUES IN ('12','29','46')`로 만들고 `sido`를 PNU 앞 2자리 그대로 두는 방식을 검토(앱은 PNU 앞 2자리로 파티션을 고르므로 이 방식이 앱과 맞다). 데이터를 본 뒤 결정.
- **`ogr2ogr` 직접 `-append`가 FID 칸이 없다며 실패**: `--via-stage`로 임시 표를 거쳐 INSERT..SELECT(시간·WAL 약 2배).
- **교체가 `lock_timeout`으로 실패**: 오래 걸리는 조회가 `ref.lsmd_cont_ldreg`을 잡고 있었다. 지난달 데이터는 그대로이니 같은 명령을 다시.
- **임시 표가 남았다**(스크립트가 강제 종료된 경우): `DROP TABLE IF EXISTS ref.lsmd_cont_ldreg_<c>_new, ref._stage_<c>;`
- **시도 상태 확인**: `SELECT * FROM ref.load_meta ORDER BY sido;`, 앱은 이 표의 `version`을 업로드 화면 "지적도 기준월"로 쓴다(시도별로 다르면 가장 이른 달).
- 같은 PNU가 여러 행인지: `SELECT pnu, count(*) FROM ref.lsmd_cont_ldreg_36 GROUP BY 1 HAVING count(*) > 1 LIMIT 20;` (앱은 같은 PNU 다중 폴리곤을 `ST_Union`으로 합쳐 하나로 쓴다)

## 이 스크립트를 시험한 방법 (DB 접속 없이)
가짜 `psql`·`ogr2ogr`·`ogrinfo`(인자만 기록하고 준비된 답을 내는 스크립트)를 `PSQL`·`OGR2OGR`·`OGRINFO` 환경 변수로 끼워 정상·검증 실패 5종·재시작(건너뜀)·`--force`·`--unlogged`·`--via-stage`·`--all`·csv·잘못된 인자를 확인했다. GDAL의 OGR SQL(컬럼 이름 바꾸기·`SUBSTR`)은 실제 `ogr2ogr`로 로컬 shp(zip)를 GPKG로 변환해 확인했다. 실제 PostgreSQL에서의 `ATTACH`/인덱스 연결·`-append` 동작은 **확인하지 못했다** — 세종 한 시도로 먼저 돌려 본다.

## 도로명주소 건물DB (주소 엑셀용)

주소 엑셀(도로명주소·지번주소 → PNU → 연속지적도 폴리곤)이 읽는 표다. 원본은 행정안전부 주소기반산업지원서비스(business.juso.go.kr) > 주소정보 자료제공 > **건물DB(전체분)**.
앱이 읽는 표는 `ref.ti_spbd_buld`(건물정보 — 법정동 사전과 도로명주소→지번)와 `ref.ti_sprd_stret`(도로명코드). `ref.ti_scco_mvmn`(관련지번)은 적재만 하고 아직 쓰지 않는다.
**PNU 만들기**: `adm_cd || (mntn_yn::int + 1) || lpad(lnbr_mnnm,4,'0') || lpad(lnbr_slno,4,'0')`. 연속지적도(`load_meta.dataset='parcel'`)와 별개로 적재·기록되며 서로 영향이 없다.

| 표 | 원본 파일 | 행 수(2026-09) | 키·인덱스 |
|---|---|---|---|
| `ref.ti_spbd_buld` | `build_*.txt` | 약 1,072만 | PK `bd_mgt_sn`, `ix_ti_spbd_buld_road (road_cd, udgd_yn, buld_mnnm, buld_slno)`, `ix_ti_spbd_buld_jibun (adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno)`(선택 — 아래 "지번 색인") |
| `ref.ti_scco_mvmn` | `jibun_*.txt` | 약 177만 | PK `(road_cd, udgd_yn, buld_mnnm, buld_slno, jibun_seq)` |
| `ref.ti_sprd_stret` | `road_code_total.txt` | 약 37만 | PK `(sgg_cd, road_no, emd_no)`, `ix_ti_sprd_stret_name (ctp_kor_nm, sig_kor_nm, rn)` |

### 처음 적재
1. 스키마(한 번): `psql -v ON_ERROR_STOP=1 -1 -f init-ref-schema.sql`(이미 했으면 건너뜀) 다음 `psql -v ON_ERROR_STOP=1 -1 -f init-ref-juso-schema.sql`. 접속 정보는 환경 변수(`PGHOST PGPORT PGDATABASE PGUSER`, `PGPASSWORD`)로만.
2. 원본 txt 세 종류가 든 폴더를 준비(MS949 그대로 — 스크립트가 `iconv`로 UTF-8로 바꿔 COPY).
3. `./load-juso.sh --dry-run --version 2026-09 <폴더>`로 명령 확인 후 `./load-juso.sh --first-load --version 2026-09 <폴더>`. 표 하나씩 새 표(`_new`)에 적재 → 행 수·한글 검증 → PK·인덱스 → 한 트랜잭션으로 교체. 같은 기준월로 이미 적재된 표는 건너뛰어 끊겨도 같은 명령을 다시 실행하면 된다(`--force`면 다시, `--only buld,mvmn,stret`로 일부만).
4. 확인(읽기 전용): `SELECT dataset, version, status, row_count FROM ref.load_meta WHERE sido = '00' ORDER BY dataset;` — 세 표가 `READY`여야 앱이 주소 업로드를 받는다(없으면 확정이 503 `MYMAP_REF_UNAVAILABLE`).

### 월 갱신
1. 매월 새 건물DB 전체분을 받아 **같은 폴더 구조**로 풀어 둔다(`--version`은 새 기준월 `YYYY-MM`).
2. `./load-juso.sh --version 2026-10 <폴더>` — `--first-load`를 빼면 지난달 대비 행 수 ±5%(`--tolerance`) 검사가 켜진다. 검증이 실패한 표는 교체하지 않아 지난달 데이터가 그대로다.
3. 앱 재시작은 필요 없다. 앱은 업로드 때마다 `load_meta`의 `ti_spbd_buld` version을 읽고, 기준월이 바뀌었으면 법정동 사전(메모리, 약 1.9만 건)을 **다시 만든다**.
4. 연속지적도(`load-parcel.sh`)와 갱신 시기가 달라도 된다 — 주소가 가리킨 PNU가 새 지적도에 없으면 그 행은 `PARCEL_NOT_FOUND`(지번 변경·말소)로 보고된다.

### 배포 주의 — 주소 변환·내보내기
- **프록시 읽기 제한 시간**: 주소 변환(`POST /api/mymap/upload/excel/convert`)은 동기 처리다. 처음 보는 PNU 묶음은 필지 대표점 쿼리가 묶음(500개)당 3.5~5.3초라 5,000행이 차가운 DB에서 **35~50초**일 수 있다. 운영 프록시(nginx)에 이 경로의 `proxy_read_timeout`을 **최소 120초**로 둔다(`location /api/mymap/upload/excel/convert { proxy_read_timeout 120s; … }` 또는 `/api/mymap/` 전체에 120s). 기본 60초면 504로 끊긴다.
- **내보내기 동시 2건**: 내보내기(`GET /api/mymap/{id}/export`)는 스트리밍하는 동안 DB 연결(커서)을 잡는다. 서버가 전체 동시 2건으로 제한해(초과는 429) 연결 풀 고갈을 막는다. 응답 버퍼링을 끄면(`proxy_buffering off`) 느린 클라이언트가 자리를 오래 잡는 것을 막는 데 도움이 된다.
- **임시 파일**: 변환은 결과를 저장하지 않는다. 올린 임시 파일은 변환 성공 직후 지우고, 실패하면 30분 만료 때 지운다.

### 지번 색인 `ix_ti_spbd_buld_jibun` (주소 변환 엑셀 — 선택)
주소 변환("엑셀로만 받기")은 결과에 **표준 도로명주소**를 채운다. 도로명으로 입력한 행은 해석 때 찾은 건물로 채우지만, **지번으로 입력한 행**은 건물정보를 `(adm_cd, mntn_yn, lnbr_mnnm, lnbr_slno)`로 다시 찾아야 하고 이 키의 색인이 없으면 1,072만 행 전체 스캔(행 하나에 수 초)이다. 그래서 색인이 있을 때만 채운다.

| | 색인 없음 | 색인 있음 |
|---|---|---|
| 도로명 입력 행의 `표준_도로명주소` | 채움(`ix_ti_spbd_buld_road` 사용) | 채움 |
| 지번 입력 행의 `표준_도로명주소` | **빈 칸**(건물 조회를 아예 하지 않음) | 건물본번·부번 오름차순 첫 건물로 채움 |
| `표준_지번주소`·PNU·좌표·면적, 업로드·가져오기 | 영향 없음 | 영향 없음 |

- **만드는 법(한 번)**: `psql -v ON_ERROR_STOP=1 -f add-ix-juso-jibun.sql` — 약 300MB(추정, 기존 `ix_ti_spbd_buld_road`가 300MB)·수 분. 이 파일은 `CREATE INDEX IF NOT EXISTS`라 여러 번 실행해도 안전하다. **운영 DB에 쓰기이므로 사용자가 직접 실행한다.**
- `load-juso.sh`는 새 건물정보 표에도 같은 색인을 만든다 → 월 갱신으로 표가 교체돼도 색인이 유지된다(적재 시간·디스크가 그만큼 늘어난다).
- 앱은 `to_regclass(ref.ix_ti_spbd_buld_jibun)`로 색인 유무를 확인해 결과를 기억한다: 적재 기준월이 바뀌면 다시 확인하고, "없음"은 5분 뒤 다시 확인한다 → **색인을 만든 뒤 앱 재시작은 필요 없다**(최대 5분 안에 켜진다).
- 지우면(`DROP INDEX ref.ix_ti_spbd_buld_jibun;`) 지번 입력 행의 도로명주소 열이 다시 빈 칸이 된다.

앱 계정에는 `ref` 스키마에 SELECT 권한만 주고(`to_regclass`·조회 모두 읽기), 적재 계정은 따로 쓴다. 앱은 새 표·인덱스를 만들지 않는다(법정동 사전은 앱 메모리). 색인은 위 SQL을 적재 계정이 실행한다.
