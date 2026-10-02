// 옛 패널 코드의 "요청은 보내되 서버의 실패 응답은 보지 않는다" 동작을 그대로 옮기기 위한 도우미.
// 옛 코드(ImagePanel·MyMapPanel의 삭제·좌표 재추출, MyMapShareDialog의 저장)는 fetch 결과를 검사하지 않았다.
//   - 서버가 실패로 답해도(HTTP 오류·success:false·본문이 JSON이 아님) 목록에서 빼거나 창을 닫았다
//   - 네트워크 오류(fetch 자체가 실패 → TypeError)만 밖으로 드러났다
// 소스(어댑터)는 설계대로 실패하면 throw하고, 옛 화면 동작은 이 도우미로 되살린다.

/** fetch가 네트워크 오류로 실패했을 때 던지는 TypeError인지 */
export function isNetworkError(err: unknown): boolean {
    return err instanceof TypeError
}

/** 요청을 기다리되 서버의 실패 응답은 무시한다. 네트워크 오류만 다시 던진다 */
export async function ignoreServerFailure(request: Promise<unknown>): Promise<void> {
    try {
        await request
    } catch (err) {
        if (isNetworkError(err)) throw err
    }
}
