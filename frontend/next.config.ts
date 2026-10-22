import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    devIndicators: false,
    eslint: { ignoreDuringBuilds: true },
    // next/image를 쓰지 않으므로 이미지 최적화 API(/_next/image)를 닫는다 — CVE-2026-96889(이미지 최적화·sharp)가 닿는 경로를 없앤다.
    // sharp 0.35.5 이상은 Node 20.9+가 필요한데 서버 빌드 컨테이너가 node:18이라 sharp를 올리는 대신 이 길을 닫는다.
    images: { unoptimized: true },
    // 프론트(3000)에서 /api/** 요청을 백엔드(8080)로 프록시
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://localhost:8080/api/:path*',
            },
        ]
    },
}

export default nextConfig
