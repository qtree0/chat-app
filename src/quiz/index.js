import { currentVote } from '../vote/index.js';
let currentQuiz = null;

function startQuiz(io, socket, { question, answer, duration }, nickname) {
  if (currentQuiz?.isActive) {
    socket.emit('quiz_error', '다른 퀴즈가 진행 중입니다.');
    return;
  }
  if (currentVote?.isActive) {
    socket.emit('quiz_error', '투표가 진행 중일 때는 퀴즈를 시작할 수 없습니다.');
    return;
  }

  const now = Date.now();
  const durationMs = duration * 1000;

  currentQuiz = {
    question,
    answer,
    startedBy: socket.id,
    startedByName: nickname,
    startTime: now,
    duration: durationMs,
    submissions: {},
    nicknames: {},
    isActive: true
  };

  currentQuiz.nicknames[socket.id] = nickname;

  io.emit('quiz_started', { question, duration: durationMs, startTime: now });

  io.emit('system_message', `${nickname}님이 퀴즈를 출제했습니다. /answer 명령어로 정답을 제출하세요.`);
  io.emit('system_message', `문제: ${question} / 제한시간: ${duration}초`);

  // 카운트다운 (5초 전부터)
  const countdownSeconds = [5, 4, 3, 2, 1];
  countdownSeconds.forEach(sec => {
    setTimeout(() => {
      if (currentQuiz?.isActive) {
        if (sec === 5) {
          io.emit('system_message', `⏱ ${sec}초 남았습니다. 정답을 제출하세요!`);
        } else {
          io.emit('system_message', `⏱ ${sec}...`);
        }
      }
    }, durationMs - sec * 1000);
  });

  // 퀴즈 자동 종료
  setTimeout(() => {
    if (currentQuiz?.isActive) {
      endQuiz(io);
    }
  }, durationMs);
}

function submitAnswer(socket, answer) {
  if (!currentQuiz?.isActive) {
    socket.emit('quiz_error', '현재 진행 중인 퀴즈가 없습니다.');
    return;
  }

  if (!answer) {
    socket.emit('quiz_error', '정답을 입력하세요. (/answer 정답)');
    return;
  }

  currentQuiz.submissions[socket.id] = answer;
  currentQuiz.nicknames[socket.id] = currentQuiz.nicknames[socket.id] || socket.nickname || '익명';

  socket.emit('answer_submitted', answer); // 사용자에게 본인의 정답 알림
}

function manualEndQuiz(io, socket) {
  if (!currentQuiz?.isActive) return;
  if (socket.id !== currentQuiz.startedBy) {
    socket.emit('quiz_error', '퀴즈를 종료할 권한이 없습니다.');
    return;
  }
  endQuiz(io);
}

function endQuiz(io) {
  currentQuiz.isActive = false;

  const result = Object.entries(currentQuiz.submissions).map(([socketId, submitted]) => {
    const nickname = currentQuiz.nicknames[socketId] || '익명';
    const isCorrect = submitted.trim().toLowerCase() === currentQuiz.answer.trim().toLowerCase();
    return { socketId, nickname, submitted, isCorrect };
  });

  io.emit('quiz_ended', {
    answer: currentQuiz.answer,
    result
  });

  const correct = result.filter(r => r.isCorrect);
  const incorrect = result.filter(r => !r.isCorrect);

  if (correct.length > 0) {
    const pick = pickRandom(correct);
    io.emit('system_message', `${pick.nickname}님 외 ${correct.length - 1}명 정답입니다!`);
  }

  if (incorrect.length > 0) {
    const pick = pickRandom(incorrect);
    io.emit('system_message', `${pick.nickname}님은 "${pick.submitted}"라고 썼어요!`);
  }

  currentQuiz = null;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export {
  startQuiz,
  submitAnswer,
  manualEndQuiz,
  endQuiz,
  currentQuiz
};
