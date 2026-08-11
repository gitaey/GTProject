#!/bin/bash
# 로컬 titiler 실행 스크립트
# 백엔드 실행 전에 한 번만 실행하면 됨

mkdir -p ./geotiff-uploads

docker run -d \
  --name gtp-titiler-local \
  -p 8000:80 \
  -v "D:/git/GTProject/geotiff-uploads:/data" \
  ghcr.io/developmentseed/titiler

echo "titiler 실행됨: http://localhost:8000"
echo "중지: docker stop gtp-titiler-local && docker rm gtp-titiler-local"
