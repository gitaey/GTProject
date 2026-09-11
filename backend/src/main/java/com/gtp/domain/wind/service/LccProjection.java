package com.gtp.domain.wind.service;

/**
 * 기상청 수치모델(LDAPS 등)이 쓰는 Lambert Conformal Conic 격자 좌표계를
 * 위경도로 변환하는 유틸리티. 동네예보 API의 격자-위경도 변환 공식(공식 문서 공개)과
 * 동일한 투영 파라미터를 쓰되, 격자 간격(gridKm)만 API 응답값을 그대로 사용한다.
 */
public final class LccProjection {

    private static final double DEGRAD = Math.PI / 180.0;

    private static final double SLAT1 = 30.0 * DEGRAD;
    private static final double SLAT2 = 60.0 * DEGRAD;
    private static final double OLON = 126.0 * DEGRAD;
    private static final double OLAT = 38.0 * DEGRAD;

    private final double re;   // 격자 단위로 환산한 지구 반경
    private final double sn;
    private final double sf;
    private final double ro;
    private final double xo;
    private final double yo;

    /**
     * @param gridKm 격자 간격(km). API 응답의 gridKm 값을 그대로 넣는다.
     * @param xo     격자 원점 X (API 응답의 x0)
     * @param yo     격자 원점 Y (API 응답의 y0)
     */
    public LccProjection(double gridKm, double xo, double yo) {
        this.re = 6371.00877 / gridKm;

        double sn = Math.log(Math.cos(SLAT1) / Math.cos(SLAT2))
                / Math.log(Math.tan(Math.PI * 0.25 + SLAT2 * 0.5) / Math.tan(Math.PI * 0.25 + SLAT1 * 0.5));
        double sf = Math.pow(Math.tan(Math.PI * 0.25 + SLAT1 * 0.5), sn) * Math.cos(SLAT1) / sn;
        double ro = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + OLAT * 0.5), sn);

        this.sn = sn;
        this.sf = sf;
        this.ro = ro;
        this.xo = xo;
        this.yo = yo;
    }

    /** 0-based 격자 인덱스(x, y)를 위경도(도)로 변환. 결과: [lon, lat] */
    public double[] toLonLat(double x, double y) {
        double xn = x - xo;
        double yn = ro - y + yo;
        double ra = Math.sqrt(xn * xn + yn * yn);
        if (sn < 0) ra = -ra;

        double alat = 2.0 * Math.atan(Math.pow(re * sf / ra, 1.0 / sn)) - Math.PI * 0.5;

        double theta;
        if (Math.abs(xn) <= 1e-9) {
            theta = 0.0;
        } else {
            if (Math.abs(yn) <= 1e-9) {
                theta = Math.PI * 0.5 * Math.signum(xn);
            } else {
                theta = Math.atan2(xn, yn);
            }
        }
        double alon = theta / sn + OLON;

        return new double[]{alon / DEGRAD, alat / DEGRAD};
    }
}
