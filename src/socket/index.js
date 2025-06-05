import * as quizHandler from '../quiz/index.js';
import * as voteHandler from '../vote/index.js';
import logger from "../utils/logger.js";

const connectedUsers = new Map();
const nicknameSet = new Set();

export default function socketHandler(io, socket) {
  // ===== 닉네임 등록 =====
  socket.on('set_nickname', (nickname) => {
    if (nicknameSet.has(nickname)) {
      socket.emit('nickname_error', { msg: '이미 사용 중인 닉네임입니다.', source: 'join' });
      socket.disconnect(true);
      logger.warn(`중복된 닉네임 시도 ${nickname} - ${socket.id}`);
      return;
    }

    connectedUsers.set(socket.id, nickname);
    nicknameSet.add(nickname);
    socket.nickname = nickname;

    io.emit('system_message', `${nickname}님이 입장했습니다.`);
    io.emit('user_count', connectedUsers.size);

    logger.info(`유저 입장: ${nickname} - ${socket.id}`);
    broadcastUserList(io);

    // 퀴즈 안내
    if (quizHandler.currentQuiz?.isActive) {
      const quiz = quizHandler.currentQuiz;
      const remaining = Math.max(0, Math.floor((quiz.startTime + quiz.duration - Date.now()) / 1000));

      socket.emit('system_message', `현재 ${quiz.startedByName}님이 출제한 퀴즈가 진행 중입니다. /answer 명령어로 정답을 제출하세요.`);
      socket.emit('quiz_info', {
        question: quiz.question,
        remainingTime: remaining,
        startedByName: quiz.startedByName
      });
    }

    // 투표 안내
    voteHandler.sendCurrentVoteInfo(socket);
  });

  // ===== 닉네임 변경 =====
  socket.on('change_nickname', (newNickname) => {
    const oldNickname = connectedUsers.get(socket.id);
    if (!oldNickname) return;

    if (nicknameSet.has(newNickname)) {
      socket.emit('nickname_error', { msg: '이미 사용 중인 닉네임입니다.', source: 'change' });
      logger.warn(`중복된 닉네임 시도 ${oldNickname} - ${socket.id}`);
      return;
    }

    connectedUsers.set(socket.id, newNickname);
    nicknameSet.delete(oldNickname);
    nicknameSet.add(newNickname);
    socket.nickname = newNickname;
    logger.info(`닉네임 변경 ${oldNickname} => ${newNickname} = ${socket.id}`);

    io.emit('system_message', `${oldNickname}님이 닉네임을 ${newNickname}(으)로 변경했습니다.`);
    broadcastUserList(io);
  });

  // ===== 채팅 처리 =====
  socket.on('chat_message', (message) => {
    const nickname = connectedUsers.get(socket.id);
    if (!nickname) {
      logger.warn('닉네임 설정 없는 메시지 전송');
      return;
    }

    const time = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // ===== 퀴즈 명령어 =====
    if (message.startsWith('/quiz')) {
      const parsed = parseQuizCommand(message);
      if (!parsed) {
        socket.emit('quiz_error', '형식 오류: /quiz 질문: ... 정답: ... 제한시간: ...');
        logger.warn(`${nickname} - ${socket.id} : 퀴즈 파싱 에러`);
        return;
      }
      logger.info(`${nickname} - ${socket.id} : 퀴즈 시작 시도`);
      quizHandler.startQuiz(io, socket, parsed, nickname);
      return;
    }

    // ===== 정답 제출 =====
    if (message.startsWith('/answer')) {
      const answer = message.slice(8).trim();
      quizHandler.submitAnswer(socket, answer);
      logger.info(`${nickname} - ${socket.id} : 정답 제출`);
      return;
    }

    // ===== 귓속말 처리 =====
    if (message.startsWith('@')) {
      const spaceIndex = message.indexOf(' ');
      if (spaceIndex === -1) {
        socket.emit('chat_error', '형식 오류: @상대닉네임 메시지');
        return;
      }

      const targetName = message.slice(1, spaceIndex);
      const content = message.slice(spaceIndex + 1).trim();
      const targetSocketId = getSocketIdByNickname(targetName);

      if (!targetSocketId) {
        socket.emit('chat_error', `존재하지 않는 사용자: ${targetName}`);
        return;
      }

      socket.emit('private_message', {
        from: nickname,
        to: targetName,
        message: content,
        time
      });

      io.to(targetSocketId).emit('private_message', {
        from: nickname,
        to: targetName,
        message: content,
        time
      });

      logger.info(`${nickname} → ${targetName} : (귓속말) ${content}`);
      return;
    }

    // ===== 일반 채팅 =====
    io.emit('chat_message', {
      nickname,
      message,
      time
    });
  });

  // ===== 퀴즈 종료 =====
  socket.on('end_quiz', () => {
    quizHandler.manualEndQuiz(io, socket);
    logger.info(`퀴즈 종료`);
  });

  // ===== 투표 관련 이벤트 =====
  socket.on('start_vote', (data) => voteHandler.startVote(io, socket, data));
  socket.on('submit_vote', (data) => voteHandler.submitVote(io, socket, data));
  socket.on('end_vote', () => voteHandler.endVote(io, socket));

  // ===== 연결 종료 =====
  socket.on('disconnect', () => {
    const nickname = connectedUsers.get(socket.id);
    if (nickname) {
      connectedUsers.delete(socket.id);
      nicknameSet.delete(nickname);
      logger.info(`${nickname} - ${socket.id} : 웹소켓 연결 해제`);

      if (quizHandler.currentQuiz?.startedBy === socket.id) {
        quizHandler.endQuiz(io);
        logger.info(`${nickname} - ${socket.id} : 퇴장으로 인한 퀴즈 종료`);
      }

      voteHandler.handleDisconnect(socket);

      io.emit('system_message', `${nickname}님이 퇴장했습니다.`);
      io.emit('user_count', connectedUsers.size);
      broadcastUserList(io);
    }
  });
}

// ===== 퀴즈 명령어 파싱 =====
function parseQuizCommand(message) {
  try {
    const questionMatch = message.match(/질문:\s*(.*?)\s*정답:/s);
    const answerMatch = message.match(/정답:\s*(.*?)\s*(제한시간:|$)/s);
    const durationMatch = message.match(/제한시간:\s*(\d+)/);

    if (!questionMatch || !answerMatch) return null;

    const question = questionMatch[1].trim();
    const answer = answerMatch[1].trim();
    const duration = durationMatch ? parseInt(durationMatch[1]) : 180;

    if (!question || !answer || isNaN(duration)) return null;

    return { question, answer, duration };
  } catch {
    return null;
  }
}

// ===== 닉네임으로 socket.id 찾기 =====
function getSocketIdByNickname(nickname) {
  for (const [socketId, name] of connectedUsers.entries()) {
    if (name === nickname) return socketId;
  }
  return null;
}

// ===== 접속자 목록 브로드캐스트 =====
function broadcastUserList(io) {
  const nicknames = Array.from(nicknameSet).sort();
  io.emit('user_list', nicknames);
}
