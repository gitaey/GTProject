package com.gtp.domain.wind.service;

/**
 * LDAPS 원본 격자(Lambert Conformal Conic) → 위경도 정규 격자 재격자(역방향 이중선형 보간). 바람(U·V 두 배열)과 스칼라(배열 하나)가 같은 계획을 쓴다.
 * <p>계획({@link Plan}): 출력 칸마다 LCC 순변환으로 원본 격자의 소수 좌표를 구해 둔다 — 같은 원본 기하·해상도면 변수가 달라도 같으므로 한 번만 계산한다.
 * <p>보간: 둘러싼 네 원본 점 중 값이 없는 점(NaN)은 빼고 남은 점의 가중치로 다시 나눈다. 전부 없거나 원본 격자 밖이면 그 칸은 null(자료 없음, 0이 아니다).
 */
final class LdapsRegridder {

    private LdapsRegridder() { }

    /** 출력 격자(header)와 칸마다의 원본 좌표 */
    static final class Plan {
        final int xdim, ydim;
        final int nx, ny;
        final double lo1, la1, lo2, la2, dx, dy;
        /** 칸 → 원본 왼쪽 위 점의 열·행(-1 = 원본 격자 밖) */
        final int[] i0, j0;
        final double[] tx, ty;

        Plan(int xdim, int ydim, int nx, int ny, double lo1, double la1, double lo2, double la2, double dx, double dy,
             int[] i0, int[] j0, double[] tx, double[] ty) {
            this.xdim = xdim; this.ydim = ydim; this.nx = nx; this.ny = ny;
            this.lo1 = lo1; this.la1 = la1; this.lo2 = lo2; this.la2 = la2; this.dx = dx; this.dy = dy;
            this.i0 = i0; this.j0 = j0; this.tx = tx; this.ty = ty;
        }
    }

    /** 원본 기하(gridKm·x0·y0·크기)와 출력 해상도(도)에 대한 계획. 출력 영역 = 원본 격자 테두리의 위경도 범위(볼록한 사각형이라 극값은 테두리에 있다) */
    static Plan plan(double gridKm, double x0, double y0, int xdim, int ydim, double resolutionDeg) {
        LccProjection projection = new LccProjection(gridKm, x0, y0);
        double minLon = Double.MAX_VALUE, maxLon = -Double.MAX_VALUE;
        double minLat = Double.MAX_VALUE, maxLat = -Double.MAX_VALUE;
        for (int i = 0; i < xdim; i++) {
            for (int j : new int[]{0, ydim - 1}) {
                double[] ll = projection.toLonLat(i, j);
                minLon = Math.min(minLon, ll[0]); maxLon = Math.max(maxLon, ll[0]);
                minLat = Math.min(minLat, ll[1]); maxLat = Math.max(maxLat, ll[1]);
            }
        }
        for (int j = 0; j < ydim; j++) {
            for (int i : new int[]{0, xdim - 1}) {
                double[] ll = projection.toLonLat(i, j);
                minLon = Math.min(minLon, ll[0]); maxLon = Math.max(maxLon, ll[0]);
                minLat = Math.min(minLat, ll[1]); maxLat = Math.max(maxLat, ll[1]);
            }
        }
        double dx = resolutionDeg, dy = resolutionDeg;
        int nx = (int) Math.round((maxLon - minLon) / dx) + 1;
        int ny = (int) Math.round((maxLat - minLat) / dy) + 1;
        double la1 = maxLat; // 북쪽부터
        double lo1 = minLon; // 서쪽부터

        int[] i0 = new int[nx * ny], j0 = new int[nx * ny];
        double[] tx = new double[nx * ny], ty = new double[nx * ny];
        for (int row = 0; row < ny; row++) {
            double lat = la1 - row * dy;
            for (int col = 0; col < nx; col++) {
                int cell = row * nx + col;
                double lon = lo1 + col * dx;
                double[] g = projection.toGrid(lon, lat);
                double gx = g[0], gy = g[1];
                if (gx < 0 || gy < 0 || gx > xdim - 1 || gy > ydim - 1) { i0[cell] = -1; j0[cell] = -1; continue; } // 원본 격자 밖
                int ci = Math.min((int) Math.floor(gx), xdim - 1);
                int cj = Math.min((int) Math.floor(gy), ydim - 1);
                i0[cell] = ci; j0[cell] = cj;
                tx[cell] = gx - ci; ty[cell] = gy - cj;
            }
        }
        return new Plan(xdim, ydim, nx, ny, lo1, la1, minLon + (nx - 1) * dx, maxLat - (ny - 1) * dy, dx, dy, i0, j0, tx, ty);
    }

    /**
     * 원본 배열 하나 이상(같은 크기, 행 우선, 값 없음 = NaN)을 같은 가중치로 보간한다. 결과 [배열 번호][칸] — 자료 없는 칸은 null.
     * 값이 있는지는 첫 배열로 판단한다(바람 U·V는 함께 비므로 같다).
     */
    static Double[][] regrid(Plan p, double[]... srcs) {
        int n = p.nx * p.ny;
        Double[][] out = new Double[srcs.length][n];
        double[] w = new double[4];
        int[] idx = new int[4];
        double[] sums = new double[srcs.length];
        double[] lead = srcs[0];
        for (int cell = 0; cell < n; cell++) {
            int ci = p.i0[cell];
            if (ci < 0) continue;
            int cj = p.j0[cell];
            int i1 = Math.min(ci + 1, p.xdim - 1);
            int j1 = Math.min(cj + 1, p.ydim - 1);
            double tx = p.tx[cell], ty = p.ty[cell];
            idx[0] = cj * p.xdim + ci; idx[1] = cj * p.xdim + i1; idx[2] = j1 * p.xdim + ci; idx[3] = j1 * p.xdim + i1;
            w[0] = (1 - tx) * (1 - ty); w[1] = tx * (1 - ty); w[2] = (1 - tx) * ty; w[3] = tx * ty;
            double sw = 0;
            java.util.Arrays.fill(sums, 0);
            for (int k = 0; k < 4; k++) {
                if (w[k] <= 0 || Double.isNaN(lead[idx[k]])) continue;
                sw += w[k];
                for (int a = 0; a < srcs.length; a++) sums[a] += srcs[a][idx[k]] * w[k];
            }
            if (sw <= 0) {
                // 가중치가 0인 점만 값이 있는 경계(격자점 위)는 그 점의 값
                int k0 = 0;
                for (int k = 1; k < 4; k++) if (w[k] > w[k0]) k0 = k;
                if (w[k0] <= 0 || Double.isNaN(lead[idx[k0]])) continue;
                for (int a = 0; a < srcs.length; a++) sums[a] = srcs[a][idx[k0]];
                sw = 1;
            }
            for (int a = 0; a < srcs.length; a++) out[a][cell] = sums[a] / sw;
        }
        return out;
    }
}
