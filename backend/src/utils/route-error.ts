// 路由 catch 块的对外错误消息消毒。
// 原因：大量路由自行 send 500/400 响应，不经过 server.ts 的全局 setErrorHandler，
//       直接回显 err.message 会把 SQLite 错误、内部绝对路径等细节泄露给客户端。
// 未删除服务端日志：调用方仍先 request.log.error 完整记录，消毒只影响响应体。
// debug 模式保留原文：与全局错误处理器的 isDebugMode 门控保持同一开关，方便开发排查。
export function routeErrorMessage(error: unknown, action: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  const isDebug = process.env.PAPYRUS_DEBUG === '1' || process.env.NODE_ENV === 'development';
  return isDebug ? `${action}: ${detail}` : action;
}
