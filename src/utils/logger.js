// 서버 내 예외 상황 발생 시 로그 기록을 위한 모듈 (향후 필요 시 import하여 사용 가능)

export function logAnonymousEvent(context, socketId) {
  const timestamp = new Date().toISOString();
  console.warn(`[익명 fallback] [${timestamp}] ${context} - socket.id: ${socketId}`);
}

export function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[INFO] [${timestamp}] ${message}`);
}

export function logError(message, err) {
  const timestamp = new Date().toISOString();
  console.error(`[ERROR] [${timestamp}] ${message}`);
  if (err) console.error(err);
}
