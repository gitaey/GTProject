package com.gtp.domain.mymap.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gtp.domain.mymap.infra.FakePnuParcelProvider;
import com.gtp.domain.mymap.infra.PostgisPnuParcelProvider;
import com.gtp.domain.mymap.infra.TableAddressResolver;
import com.gtp.domain.mymap.model.ImportMode;
import com.gtp.domain.mymap.port.AddressResolver;
import com.gtp.domain.mymap.port.PnuParcelProvider;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.PropertySourcesPlaceholdersResolver;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.task.TaskExecutor;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 설정이 다른 도메인을 망가뜨리지 않는지(Boot 자동 구성 보호), 기본값이 설계와 같은지, 메인 application.yml이 바인딩되고 비밀값이 없는지 본다.
 */
class MyMapConfigGuardTest {

    static final Path MAIN_YML = Path.of("src/main/resources/application.yml");

    private static MyMapProperties mainYmlProperties() throws Exception {
        List<PropertySource<?>> loaded = new YamlPropertySourceLoader().load("main", new FileSystemResource(MAIN_YML));
        MutablePropertySources sources = new MutablePropertySources();
        loaded.forEach(sources::addLast);
        Binder binder = new Binder(ConfigurationPropertySources.from(sources), new PropertySourcesPlaceholdersResolver(sources));
        return binder.bind("mymap", MyMapProperties.class).get();
    }

    @Test
    void 빈_메서드는_JdbcTemplate_DataSource_Executor_타입을_내놓지_않는다() {
        // 그런 타입의 빈이 생기면 Boot가 서비스용 jdbcTemplate/DataSource/applicationTaskExecutor를 만들지 않아 다른 도메인이 망가진다
        for (Method m : MyMapConfig.class.getDeclaredMethods()) {
            if (!m.isAnnotationPresent(Bean.class)) continue;
            Class<?> t = m.getReturnType();
            assertThat(DataSource.class.isAssignableFrom(t)).as(m.getName() + " → DataSource").isFalse();
            assertThat(JdbcOperations.class.isAssignableFrom(t)).as(m.getName() + " → JdbcOperations").isFalse();
            assertThat(Executor.class.isAssignableFrom(t)).as(m.getName() + " → Executor").isFalse();
            assertThat(TaskExecutor.class.isAssignableFrom(t)).as(m.getName() + " → TaskExecutor").isFalse();
        }
        assertThat(JdbcOperations.class.isAssignableFrom(MyMapRefJdbc.class)).isFalse();
        assertThat(Executor.class.isAssignableFrom(MyMapImportExecutor.class)).isFalse();
    }

    @Test
    void 참조_DB_주소가_비면_서비스_DataSource를_그대로_쓴다() {
        DriverManagerDataSource service = new DriverManagerDataSource("jdbc:h2:mem:svc_guard");
        MyMapRefJdbc ref = MyMapRefJdbc.create(new MyMapProperties.Datasource(), service);
        assertThat(ref.separate()).isFalse();
        assertThat(ref.template().getDataSource()).isSameAs(service);
    }

    @Test
    void 참조_DB_주소가_있으면_읽기_전용_별도_풀() throws Exception {
        MyMapProperties.Datasource conf = new MyMapProperties.Datasource();
        conf.setUrl("jdbc:h2:mem:ref_guard;DB_CLOSE_DELAY=-1");
        conf.setUsername("sa");
        try (MyMapRefJdbc ref = MyMapRefJdbc.create(conf, new DriverManagerDataSource("jdbc:h2:mem:svc_guard2"))) {
            assertThat(ref.separate()).isTrue();
            assertThat(ref.template().queryForObject("SELECT 1", Integer.class)).isEqualTo(1);
            assertThat(((com.zaxxer.hikari.HikariDataSource) ref.template().getDataSource()).isReadOnly()).isTrue();
        }
    }

    @Test
    void 설정_기본값은_설계와_같다() {
        MyMapProperties p = new MyMapProperties();
        MyMapProperties.Limits l = p.getLimits();
        assertThat(l.getMaxLayersPerUser()).isEqualTo(20);
        assertThat(l.getMaxRowsPnu()).isEqualTo(5000);
        assertThat(l.getMaxRowsAddress()).isEqualTo(5000);
        assertThat(l.getMaxRowsCoord()).isEqualTo(5000);
        assertThat(l.getMaxShpFeatures()).isEqualTo(100_000);
        assertThat(l.getMaxExcelMb()).isEqualTo(10);
        assertThat(l.getMaxShpMb()).isEqualTo(300);
        assertThat(p.getRef().getProvider()).isEqualTo("postgis");
        assertThat(p.getRef().getAllowedSidoCodes()).isEmpty();
        assertThat(p.getRef().getParcel().getTable()).isEqualTo("ref.lsmd_cont_ldreg");
        assertThat(p.getRef().getParcel().getSrid()).isEqualTo(4326);
        assertThat(p.getRef().getExpectedSidoCodes()).containsExactly("11", "12", "26", "27", "28", "30", "31", "36", "41", "43", "44", "47", "48", "50", "51", "52");
        assertThat(p.getUpload().getPreviewTtlMinutes()).isEqualTo(30);
        assertThat(p.getUpload().getStalledMinutes()).isEqualTo(30);
        assertThat(p.getUpload().getPoolSize()).isEqualTo(2);
        assertThat(p.getUpload().getQueueCapacity()).isEqualTo(20);
        assertThat(p.getMaintenance().getFailureRetentionDays()).isEqualTo(30);
        assertThat(p.getMaintenance().isEnabled()).isTrue();
        assertThat(p.maxRowsFor(ImportMode.PNU)).isEqualTo(5000);
        assertThat(p.maxRowsFor(ImportMode.COORD)).isEqualTo(5000);
        assertThat(p.maxRowsFor(ImportMode.ADDRESS)).isEqualTo(5000);
    }

    @Test
    void 모드별_행_한도는_각자_설정을_따른다() {
        MyMapProperties p = new MyMapProperties();
        p.getLimits().setMaxRowsPnu(11);
        p.getLimits().setMaxRowsAddress(22);
        p.getLimits().setMaxRowsCoord(33);
        assertThat(p.maxRowsFor(ImportMode.PNU)).isEqualTo(11);
        assertThat(p.maxRowsFor(ImportMode.ADDRESS)).isEqualTo(22);
        assertThat(p.maxRowsFor(ImportMode.COORD)).isEqualTo(33);
    }

    @Test
    void 메인_application_yml이_MyMapProperties로_바인딩되고_값이_설계와_같다() throws Exception {
        MyMapProperties p = mainYmlProperties();
        assertThat(p.getUploadDir()).isEqualTo("./mymap-uploads");
        assertThat(p.getLimits().getMaxLayersPerUser()).isEqualTo(20);
        assertThat(p.getLimits().getMaxRowsPnu()).isEqualTo(5000);
        assertThat(p.getLimits().getMaxRowsAddress()).isEqualTo(5000);
        assertThat(p.getLimits().getMaxRowsCoord()).isEqualTo(5000);
        assertThat(p.getLimits().getMaxShpFeatures()).isEqualTo(100_000);
        assertThat(p.getLimits().getMaxExcelMb()).isEqualTo(10);
        assertThat(p.getLimits().getMaxShpMb()).isEqualTo(300);
        assertThat(p.getRef().getProvider()).isEqualTo("postgis");
        assertThat(p.getRef().getAllowedSidoCodes()).isEmpty();          // 비움 = 전국
        assertThat(p.getRef().getParcel().getTable()).isEqualTo("ref.lsmd_cont_ldreg");
        assertThat(p.getRef().getParcel().getPnuColumn()).isEqualTo("pnu");
        assertThat(p.getRef().getParcel().getSidoColumn()).isEqualTo("sido");
        assertThat(p.getRef().getParcel().getGeomColumn()).isEqualTo("geom");
        assertThat(p.getRef().getParcel().getSrid()).isEqualTo(4326);
        assertThat(p.getRef().getLoadMetaTable()).isEqualTo("ref.load_meta");
        assertThat(p.getRef().getAddress().getBuildingTable()).isEqualTo("ref.ti_spbd_buld");
        assertThat(p.getRef().getAddress().getRoadCodeTable()).isEqualTo("ref.ti_sprd_stret");
        assertThat(p.getRef().getAddress().getMaxCandidates()).isEqualTo(5);
        assertThat(p.getRef().getExpectedSidoCodes()).hasSize(16).contains("12", "36");   // 전국 기준 16개(전남광주통합 12 포함)
        assertThat(p.getRef().getDatasource().isConfigured()).isFalse(); // 환경 변수가 없으면 서비스 DataSource
        assertThat(p.getMaintenance().isEnabled()).isTrue();
    }

    @Test
    void 메인_yml에_참조_DB_비밀값_기본값이_없다() throws Exception {
        List<String> lines = Files.readAllLines(MAIN_YML);
        int start = -1;
        for (int i = 0; i < lines.size(); i++) if (lines.get(i).startsWith("mymap:")) start = i;
        assertThat(start).isPositive();
        boolean sawPassword = false;
        for (int i = start; i < lines.size(); i++) {
            String line = lines.get(i);
            if (i > start && !line.isBlank() && !line.startsWith(" ") && !line.startsWith("#")) break; // 다음 최상위 키
            if (line.trim().startsWith("password:")) {
                sawPassword = true;
                // 환경 변수 자리표시자이고 기본값은 비어 있어야 한다: ${MYMAP_REF_DB_PASSWORD:}
                assertThat(line.trim()).matches("password: \\$\\{MYMAP_REF_DB_PASSWORD:}.*");
            }
            if (line.trim().startsWith("username:")) assertThat(line.trim()).matches("username: \\$\\{MYMAP_REF_DB_USERNAME:}.*");
            if (line.trim().startsWith("url:")) assertThat(line.trim()).matches("url: \\$\\{MYMAP_REF_DB_URL:}.*");
        }
        assertThat(sawPassword).isTrue();
    }

    @Test
    void provider_설정에_따라_구현이_고르고_모르는_값은_기동_때_실패() {
        MyMapConfig config = new MyMapConfig();
        DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:svc_guard3");
        MyMapProperties props = new MyMapProperties();
        MyMapRefJdbc ref = MyMapRefJdbc.create(props.getRef().getDatasource(), ds);

        props.getRef().setProvider("postgis");
        PnuParcelProvider postgis = config.pnuParcelProvider(props, ref, new ObjectMapper());
        assertThat(postgis).isInstanceOf(PostgisPnuParcelProvider.class);

        props.getRef().setProvider("FAKE");
        assertThat(config.pnuParcelProvider(props, ref, new ObjectMapper())).isInstanceOf(FakePnuParcelProvider.class);

        props.getRef().setProvider("postgres");
        assertThatThrownBy(() -> config.pnuParcelProvider(props, ref, new ObjectMapper()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("postgres");
    }

    @Test
    void 주소_해석기는_provider에_따라_표_구현과_메모리_구현_모두_지원한다() {
        MyMapConfig config = new MyMapConfig();
        MyMapProperties props = new MyMapProperties();
        MyMapRefJdbc ref = MyMapRefJdbc.create(props.getRef().getDatasource(), new DriverManagerDataSource("jdbc:h2:mem:svc_guard4"));

        props.getRef().setProvider("postgis");
        AddressResolver postgis = config.addressResolver(props, ref);
        assertThat(postgis).isInstanceOf(TableAddressResolver.class);
        assertThat(postgis.supported()).isTrue();

        props.getRef().setProvider("fake");
        AddressResolver fake = config.addressResolver(props, ref);
        assertThat(fake).isInstanceOf(TableAddressResolver.class);
        assertThat(fake.available()).isTrue();   // 메모리 자료는 늘 준비됨
        assertThat(fake.resolve(List.of("서울특별시 중구 세종대로 110")).get(0).pnu()).isEqualTo("1114010300100310000");

        // 표 이름이 식별자 모양이 아니면 기동 때 바로 실패(SQL 주입 방지)
        props.getRef().setProvider("postgis");
        props.getRef().getAddress().setBuildingTable("ref.x; DROP TABLE y");
        assertThatThrownBy(() -> config.addressResolver(props, ref)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 주소_표_기본값은_건물DB_표다() {
        MyMapProperties.Address a = new MyMapProperties().getRef().getAddress();
        assertThat(a.getBuildingTable()).isEqualTo("ref.ti_spbd_buld");
        assertThat(a.getRoadCodeTable()).isEqualTo("ref.ti_sprd_stret");
        assertThat(a.getMaxCandidates()).isEqualTo(5);
    }

    @Test
    void 가져오기_풀은_가득_차면_거절한다() throws Exception {
        MyMapImportExecutor ex = new MyMapImportExecutor(1, 1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch started = new java.util.concurrent.CountDownLatch(1);
        try {
            ex.submit(() -> {
                started.countDown();
                try {
                    release.await();
                } catch (InterruptedException ignored) {
                }
            });
            started.await();
            ex.submit(() -> {
            });   // 대기열 1칸
            assertThatThrownBy(() -> ex.submit(() -> {
            })).isInstanceOf(java.util.concurrent.RejectedExecutionException.class);
        } finally {
            release.countDown();
            ex.close();
        }
    }
}
