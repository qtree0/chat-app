import * as quizHandler from '../quiz/index.js';
import * as voteHandler from '../vote/index.js';

const connectedUsers = new Map();
const nicknameSet = new Set();

export default function socketHandler(io, socket) {
  // ===== 닉네임 등록 =====
  socket.on('set_nickname', (nickname) => {
    if (nicknameSet.has(nickname)) {
      socket.emit('nickname_error', { msg: '이미 사용 중인 닉네임입니다.', source: 'join' });
      socket.disconnect(true);
      return;
    }

    connectedUsers.set(socket.id, nickname);
    nicknameSet.add(nickname);
    socket.nickname = nickname;

    io.emit('system_message', `${nickname}님이 입장했습니다.`);
    io.emit('user_count', connectedUsers.size);
    broadcastUserList(io);

    // 퀴즈 진행 중이면 입장자에게 안내
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

    // 투표 진행 중이면 안내
    voteHandler.sendCurrentVoteInfo(socket);
  });

  // ===== 닉네임 변경 =====
  socket.on('change_nickname', (newNickname) => {
    const oldNickname = connectedUsers.get(socket.id);
    if (!oldNickname) return;

    if (nicknameSet.has(newNickname)) {
      socket.emit('nickname_error', { msg: '이미 사용 중인 닉네임입니다.', source: 'change' });
      return;
    }

    connectedUsers.set(socket.id, newNickname);
    nicknameSet.delete(oldNickname);
    nicknameSet.add(newNickname);
    socket.nickname = newNickname;

    io.emit('system_message', `${oldNickname}님이 닉네임을 ${newNickname}(으)로 변경했습니다.`);
    broadcastUserList(io);
  });

  // ===== 일반 채팅 및 명령어 파싱 =====
  socket.on('chat_message', (message) => {
    const nickname = connectedUsers.get(socket.id);
    if (!nickname) return;

    // /quiz 명령어 처리
    if (message.startsWith('/quiz')) {
      const parsed = parseQuizCommand(message);
      if (!parsed) {
        socket.emit('quiz_error', '형식 오류: /quiz 질문: ... 정답: ... 제한시간: ...');
        return;
      }
      quizHandler.startQuiz(io, socket, parsed, nickname);
      return;
    }

    // /answer 정답 제출
    if (message.startsWith('/answer')) {
      const answer = message.slice(8).trim();
      quizHandler.submitAnswer(socket, answer);
      return;
    }

    // 일반 채팅
    const time = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    io.emit('chat_message', {
      nickname,
      message,
      time
    });
  });

  // ===== 퀴즈 관련 추가 이벤트 =====
  socket.on('end_quiz', () => {
    quizHandler.manualEndQuiz(io, socket);
  });

  // ===== 투표 관련 이벤트 연결 =====
  socket.on('start_vote', (data) => voteHandler.startVote(io, socket, data));
  socket.on('submit_vote', (data) => voteHandler.submitVote(io, socket, data));
  socket.on('end_vote', () => voteHandler.endVote(io, socket));

  // ===== 연결 종료 처리 =====
  socket.on('disconnect', () => {
    const nickname = connectedUsers.get(socket.id);
    if (nickname) {
      connectedUsers.delete(socket.id);
      nicknameSet.delete(nickname);

      if (quizHandler.currentQuiz?.startedBy === socket.id) {
        quizHandler.endQuiz(io);
      }

      voteHandler.handleDisconnect(socket);

      io.emit('system_message', `${nickname}님이 퇴장했습니다.`);
      io.emit('user_count', connectedUsers.size);
      broadcastUserList(io);
    }
  });
}

// ===== 퀴즈 명령어 파싱 함수 =====
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

// ===== 접속자 목록 브로드캐스트 함수 =====
function broadcastUserList(io) {
  const nicknames = Array.from(nicknameSet).sort();
  io.emit('user_list', nicknames);
}
