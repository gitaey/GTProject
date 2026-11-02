// Blob 저장은 코어(core/lib/saveBlob)로 옮겼다(UMD에서도 GisMap.saveBlob으로 쓴다). 기존 import 경로를 위해 다시 내보낸다.
export { saveBlob } from '../../core'
