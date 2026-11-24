package com.gtp.domain.mymap.util;

import org.geotools.api.data.FeatureWriter;
import org.geotools.api.data.Transaction;
import org.geotools.api.feature.simple.SimpleFeature;
import org.geotools.api.feature.simple.SimpleFeatureType;
import org.geotools.data.shapefile.ShapefileDataStore;
import org.geotools.data.shapefile.ShapefileDataStoreFactory;
import org.geotools.feature.simple.SimpleFeatureTypeBuilder;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryCollection;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.MultiLineString;
import org.locationtech.jts.geom.MultiPoint;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.Polygon;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.io.Serializable;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 나만의지도 내보내기용 shp 압축 파일(zip) 작성기. 스프링·DB에 의존하지 않는다(단독 시험 가능).
 *
 * <b>shp는 한 파일에 도형 종류 하나</b>만 담을 수 있어서 점·여러 점·선·면을 종류별 파일로 나눈다(한 종류뿐이면 이름에 종류를 붙이지 않는다).
 * GeometryCollection·Multi 계열은 선·면은 Multi로 묶고, 점 모음(MultiPoint)은 따로, 컬렉션은 조각으로 풀어 같은 속성으로 각각 쓴다.
 *
 * <b>속성(DBF)</b>: 열은 모두 글자. 열 이름은 10바이트(CP949 한글 5자)까지라 넘으면 줄이고 겹치면 숫자를 붙인다 — 줄어든 이름이 있으면 zip에
 * `열이름_대응표.txt`를 넣는다. 인코딩은 국내 GIS(ArcGIS·QGIS)가 그대로 읽는 CP949(.cpg 동봉) — 못 쓰는 문자는 '?'가 된다.
 * 좌표계는 .prj를 직접 쓴다(GeoTools CRS 조회는 폐쇄망에서 멈추므로 쓰지 않는다 — 네 가지 좌표계의 WKT를 상수로 둔다).
 *
 * 쓰는 동안은 임시 폴더의 파일로 쌓고(메모리에 전부 올리지 않는다) {@link #writeTo}가 zip으로 묶는다. {@link #close}가 임시 폴더를 지운다.
 */
public final class ShpZipWriter implements AutoCloseable {

    /** DBF 열 이름 최대 바이트, 글자 열 최대 바이트 */
    public static final int MAX_FIELD_NAME_BYTES = 10;
    public static final int MAX_STRING_BYTES = 254;

    private enum Family {
        POINT("점", Point.class),
        MULTIPOINT("여러점", MultiPoint.class),
        LINE("선", MultiLineString.class),
        POLYGON("면", MultiPolygon.class);

        final String label;
        final Class<? extends Geometry> binding;

        Family(String label, Class<? extends Geometry> binding) {
            this.label = label;
            this.binding = binding;
        }
    }

    private static final GeometryFactory GF = new GeometryFactory();
    private static final Charset CP949 = cp949();
    private static final boolean CP949_OK = CP949 != null;
    private static final Charset CHARSET = CP949_OK ? CP949 : StandardCharsets.UTF_8;
    private static final String CPG = CP949_OK ? "CP949" : "UTF-8";

    private final String baseName;
    private final int srid;
    private final List<String> fieldNames;      // DBF 열 이름(줄이고 겹침 없앤 것)
    private final List<String> originalNames;
    private final int[] fieldBytes;             // 열마다 글자 칸 바이트(1~254)
    private final Path dir;
    private final Map<Family, Writer> writers = new EnumMap<>(Family.class);

    private int written = 0;

    private static final class Writer {
        final ShapefileDataStore store;
        final FeatureWriter<SimpleFeatureType, SimpleFeature> out;
        final String stem;

        Writer(ShapefileDataStore store, FeatureWriter<SimpleFeatureType, SimpleFeature> out, String stem) {
            this.store = store;
            this.out = out;
            this.stem = stem;
        }
    }

    /**
     * @param baseName 압축 파일 안 파일 이름의 바탕(확장자 없음)
     * @param srid     4326·5186·5179·3857 — .prj에 쓴다. 도형 좌표는 호출한 쪽이 이미 이 좌표계로 바꿔 넘긴다
     * @param columns  속성 열 이름(원래 이름, 순서 그대로)
     * @param maxBytes 열마다 값의 최대 바이트 수(UTF-8 기준 상한 — 모르면 {@link #MAX_STRING_BYTES}). {@code columns}와 길이가 같아야 한다
     */
    public ShpZipWriter(String baseName, int srid, List<String> columns, int[] maxBytes) throws IOException {
        if (maxBytes.length != columns.size()) throw new IllegalArgumentException("열 수와 길이 배열 크기가 다릅니다");
        if (prjWkt(srid) == null) throw new IllegalArgumentException("지원하지 않는 좌표계입니다: " + srid);
        this.baseName = baseName;
        this.srid = srid;
        this.originalNames = List.copyOf(columns);
        this.fieldNames = dbfFieldNames(columns);
        this.fieldBytes = new int[columns.size()];
        for (int i = 0; i < fieldBytes.length; i++) fieldBytes[i] = Math.max(1, Math.min(maxBytes[i], MAX_STRING_BYTES));
        this.dir = Files.createTempDirectory("mymap-shp-");
    }

    /** 도형 하나와 속성 값(열 순서대로, null은 빈 값)을 쓴다. 컬렉션·빈 도형은 조각으로 풀거나 건너뛴다. 쓴 행 수가 늘면 true */
    public boolean add(Geometry geometry, List<String> values) throws IOException {
        if (geometry == null || geometry.isEmpty()) return false;
        boolean any = false;
        List<Geometry> parts = new ArrayList<>();
        flatten(geometry, parts);
        // 같은 종류의 선·면 조각은 하나의 Multi로 묶는다(속성을 쪼개 중복하지 않는다)
        List<LineString> lines = new ArrayList<>();
        List<Polygon> polygons = new ArrayList<>();
        for (Geometry g : parts) {
            if (g instanceof Point p) any |= write(Family.POINT, p, values);
            else if (g instanceof MultiPoint mp) any |= write(Family.MULTIPOINT, mp, values);
            else if (g instanceof LineString ls && !(g instanceof LinearRing)) lines.add(ls);
            else if (g instanceof LinearRing lr) lines.add(GF.createLineString(lr.getCoordinateSequence()));
            else if (g instanceof Polygon pg) polygons.add(pg);
        }
        if (!lines.isEmpty()) any |= write(Family.LINE, GF.createMultiLineString(lines.toArray(new LineString[0])), values);
        if (!polygons.isEmpty()) any |= write(Family.POLYGON, GF.createMultiPolygon(polygons.toArray(new Polygon[0])), values);
        return any;
    }

    /** 컬렉션(점·선·면이 섞인 것 포함)을 단일 도형 조각으로 푼다. MultiPoint는 조각으로 풀지 않고 그대로 둔다 */
    private static void flatten(Geometry g, List<Geometry> out) {
        if (g instanceof MultiPoint) {
            out.add(g);
        } else if (g instanceof MultiLineString || g instanceof MultiPolygon || g instanceof GeometryCollection) {
            for (int i = 0; i < g.getNumGeometries(); i++) flatten(g.getGeometryN(i), out);
        } else {
            out.add(g);
        }
    }

    private boolean write(Family family, Geometry geometry, List<String> values) throws IOException {
        Writer w = writers.get(family);
        if (w == null) {
            w = open(family);
            writers.put(family, w);
        }
        SimpleFeature f = w.out.next();
        f.setDefaultGeometry(geometry);
        for (int i = 0; i < fieldNames.size(); i++) {
            String v = i < values.size() ? values.get(i) : null;
            f.setAttribute(i + 1, v == null ? "" : clipBytes(v, fieldBytes[i]));
        }
        w.out.write();
        written++;
        return true;
    }

    private Writer open(Family family) throws IOException {
        String stem = family.name().toLowerCase(Locale.ROOT);
        File shp = dir.resolve(stem + ".shp").toFile();
        Map<String, Serializable> params = new HashMap<>();
        params.put(ShapefileDataStoreFactory.URLP.key, shp.toURI().toURL());
        params.put(ShapefileDataStoreFactory.CREATE_SPATIAL_INDEX.key, Boolean.FALSE);
        ShapefileDataStore store = (ShapefileDataStore) new ShapefileDataStoreFactory().createNewDataStore(params);
        store.setCharset(CHARSET);

        SimpleFeatureTypeBuilder b = new SimpleFeatureTypeBuilder();
        b.setName(stem);
        b.add("the_geom", family.binding);   // 좌표계는 넣지 않는다 — .prj는 직접 쓴다
        for (int i = 0; i < fieldNames.size(); i++) {
            b.length(fieldBytes[i]);
            b.add(fieldNames.get(i), String.class);
        }
        store.createSchema(b.buildFeatureType());
        FeatureWriter<SimpleFeatureType, SimpleFeature> out = store.getFeatureWriterAppend(store.getTypeNames()[0], Transaction.AUTO_COMMIT);
        return new Writer(store, out, stem);
    }

    /** 쓴 행 수 */
    public int written() {
        return written;
    }

    /** 열 이름이 줄었거나 바뀐 것이 하나라도 있는가 */
    public boolean hasRenamedFields() {
        return !fieldNames.equals(originalNames);
    }

    /**
     * 파일을 마무리하고 zip으로 묶어 쓴다(스트림은 닫지 않는다). 쓴 행이 하나도 없으면 안내 글 한 장만 넣는다.
     */
    public void writeTo(OutputStream target) throws IOException {
        for (Writer w : writers.values()) {
            w.out.close();
            w.store.dispose();
        }
        boolean single = writers.size() == 1;
        ZipOutputStream zip = new ZipOutputStream(target, StandardCharsets.UTF_8);
        if (writers.isEmpty()) {
            putText(zip, baseName + "_안내.txt", "내보낼 위치 정보가 있는 피처가 없어 shp 파일을 만들지 못했습니다.\n");
        }
        for (Map.Entry<Family, Writer> e : writers.entrySet()) {
            Writer w = e.getValue();
            String name = single ? baseName : baseName + "_" + e.getKey().label;
            Files.writeString(dir.resolve(w.stem + ".prj"), prjWkt(srid), StandardCharsets.US_ASCII);
            Files.writeString(dir.resolve(w.stem + ".cpg"), CPG, StandardCharsets.US_ASCII);
            for (String ext : new String[]{"shp", "shx", "dbf", "prj", "cpg"}) {
                Path f = dir.resolve(w.stem + "." + ext);
                if (!Files.exists(f)) continue;
                zip.putNextEntry(new ZipEntry(name + "." + ext));
                Files.copy(f, zip);
                zip.closeEntry();
            }
        }
        if (hasRenamedFields()) {
            StringBuilder sb = new StringBuilder("shp 열 이름은 10바이트(한글 5자)까지라 줄어들었습니다.\nshp 열 이름 = 원래 이름\n");
            for (int i = 0; i < fieldNames.size(); i++) {
                if (!fieldNames.get(i).equals(originalNames.get(i))) sb.append(fieldNames.get(i)).append(" = ").append(originalNames.get(i)).append('\n');
            }
            putText(zip, "열이름_대응표.txt", sb.toString());
        }
        zip.finish();
        zip.flush();
    }

    private static void putText(ZipOutputStream zip, String entry, String text) throws IOException {
        zip.putNextEntry(new ZipEntry(entry));
        zip.write(text.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    /** 임시 폴더를 지운다(열린 파일이 남아 있으면 먼저 닫는다) */
    @Override
    public void close() throws IOException {
        for (Writer w : writers.values()) {
            try {
                w.out.close();
            } catch (IOException | RuntimeException ignored) {
                // 이미 닫힘
            }
            try {
                w.store.dispose();
            } catch (RuntimeException ignored) {
                // 이미 정리됨
            }
        }
        writers.clear();
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        }
    }

    // ---------- 열 이름·값 ----------

    /** 원래 열 이름을 DBF 규칙(10바이트·겹침 없음·비어 있지 않음)에 맞춘다. 순서와 개수는 그대로 */
    static List<String> dbfFieldNames(List<String> columns) {
        List<String> out = new ArrayList<>(columns.size());
        Set<String> used = new HashSet<>();
        used.add("the_geom");
        for (String raw : columns) {
            String base = clipBytes(raw == null ? "" : raw.strip(), MAX_FIELD_NAME_BYTES);
            if (base.isEmpty()) base = "FIELD";
            String name = base;
            for (int k = 1; !used.add(name.toLowerCase(Locale.ROOT)); k++) {
                String suffix = String.valueOf(k);
                name = clipBytes(base, MAX_FIELD_NAME_BYTES - suffix.length()) + suffix;
            }
            out.add(name);
        }
        return out;
    }

    /** 글자 단위로(서로게이트 쌍을 가르지 않게) 자르되 CP949(없으면 UTF-8)로 인코딩한 바이트가 limit를 넘지 않게 한다 */
    static String clipBytes(String s, int limit) {
        if (limit <= 0) return "";
        int bytes = 0;
        int i = 0;
        while (i < s.length()) {
            int cp = s.codePointAt(i);
            int n = CHARSET.encode(new String(Character.toChars(cp))).remaining();
            if (bytes + n > limit) break;
            bytes += n;
            i += Character.charCount(cp);
        }
        return s.substring(0, i);
    }

    /** 이 문자열을 shp 인코딩으로 썼을 때의 바이트 수(열 길이 계산용) */
    public static int byteLength(String s) {
        return s == null || s.isEmpty() ? 0 : CHARSET.encode(s).remaining();
    }

    // ---------- 좌표계 .prj ----------

    /** 네 가지 좌표계의 .prj 내용(ESRI 방식 WKT — ArcGIS·QGIS가 그대로 읽는다). 그 밖은 null */
    public static String prjWkt(int srid) {
        return switch (srid) {
            case 4326 -> "GEOGCS[\"GCS_WGS_1984\",DATUM[\"D_WGS_1984\",SPHEROID[\"WGS_1984\",6378137.0,298.257223563]],"
                    + "PRIMEM[\"Greenwich\",0.0],UNIT[\"Degree\",0.0174532925199433]]";
            case 3857 -> "PROJCS[\"WGS_1984_Web_Mercator_Auxiliary_Sphere\",GEOGCS[\"GCS_WGS_1984\",DATUM[\"D_WGS_1984\","
                    + "SPHEROID[\"WGS_1984\",6378137.0,298.257223563]],PRIMEM[\"Greenwich\",0.0],UNIT[\"Degree\",0.0174532925199433]],"
                    + "PROJECTION[\"Mercator_Auxiliary_Sphere\"],PARAMETER[\"False_Easting\",0.0],PARAMETER[\"False_Northing\",0.0],"
                    + "PARAMETER[\"Central_Meridian\",0.0],PARAMETER[\"Standard_Parallel_1\",0.0],PARAMETER[\"Auxiliary_Sphere_Type\",0.0],UNIT[\"Meter\",1.0]]";
            case 5186 -> "PROJCS[\"Korea_2000_Korea_Central_Belt_2010\",GEOGCS[\"GCS_Korea_2000\",DATUM[\"D_Korea_2000\","
                    + "SPHEROID[\"GRS_1980\",6378137.0,298.257222101]],PRIMEM[\"Greenwich\",0.0],UNIT[\"Degree\",0.0174532925199433]],"
                    + "PROJECTION[\"Transverse_Mercator\"],PARAMETER[\"False_Easting\",200000.0],PARAMETER[\"False_Northing\",600000.0],"
                    + "PARAMETER[\"Central_Meridian\",127.0],PARAMETER[\"Scale_Factor\",1.0],PARAMETER[\"Latitude_Of_Origin\",38.0],UNIT[\"Meter\",1.0]]";
            case 5179 -> "PROJCS[\"Korea_2000_Unified_CS\",GEOGCS[\"GCS_Korea_2000\",DATUM[\"D_Korea_2000\","
                    + "SPHEROID[\"GRS_1980\",6378137.0,298.257222101]],PRIMEM[\"Greenwich\",0.0],UNIT[\"Degree\",0.0174532925199433]],"
                    + "PROJECTION[\"Transverse_Mercator\"],PARAMETER[\"False_Easting\",1000000.0],PARAMETER[\"False_Northing\",2000000.0],"
                    + "PARAMETER[\"Central_Meridian\",127.5],PARAMETER[\"Scale_Factor\",0.9996],PARAMETER[\"Latitude_Of_Origin\",38.0],UNIT[\"Meter\",1.0]]";
            default -> null;
        };
    }

    private static Charset cp949() {
        try {
            return Charset.forName("MS949");
        } catch (RuntimeException e) {
            return null;   // jdk.charsets가 없는 JRE면 UTF-8로 쓰고 .cpg에 알린다
        }
    }
}
