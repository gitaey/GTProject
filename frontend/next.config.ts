import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    devIndicators: false,
    eslint: { ignoreDuringBuilds: true },
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
