import { currentQuiz } from '../quiz/index.js';
let currentVote = null;

function startVote(io, socket, {
    question,
    options,
    allowMultiple = false,
    revealOnSubmit = false,
    duration = 180000 // default 180s
}) {
    if (currentVote?.isActive) {
        socket.emit('vote_error', '이미 진행 중인 투표가 있습니다.');
        return;
    }
    if (currentQuiz?.isActive) {
        socket.emit('vote_error', '퀴즈가 진행 중일 때는 투표를 시작할 수 없습니다.');
        return;
    }
    if (!question || !Array.isArray(options) || options.length < 2) {
        socket.emit('vote_error', '투표 질문과 최소 2개의 선택지를 입력해야 합니다.');
        return;
    }

    const now = Date.now();
    currentVote = {
        question,
        options,
        allowMultiple,
        revealOnSubmit,
        startedBy: socket.id,
        startTime: now,
        duration,
        submissions: {},
        isActive: true
    };

    io.emit('vote_started', {
        question,
        options,
        allowMultiple,
        revealOnSubmit,
        startTime: now,
        duration,
        startedByName: socket.nickname || '익명'
    });

    const summary = `${socket.nickname || '익명'}님이 투표를 생성했습니다.<br/>
                    질문: ${question}<br/>
                    제한시간: ${Math.floor(duration / 1000)}초<br/>
                    --- 선택지 ---<br/>
                    ${options.map((o, i) => `${i + 1}. ${o}`).join("<br/>")}`;
    io.emit('system_message', summary);

    // 카운트다운 메시지 (5초부터)
    const countdownSeconds = [5, 4, 3, 2, 1];
    countdownSeconds.forEach(sec => {
        setTimeout(() => {
            if (currentVote?.isActive) {
                if (sec === 5) {
                    io.emit('system_message', `⏳ ${sec}초 남았습니다. 곧 마감됩니다!`);
                } else {
                    io.emit('system_message', `⏳ ${sec}...`);
                }
            }
        }, duration - sec * 1000);
    });

    // 자동 종료
    setTimeout(() => {
        if (currentVote?.isActive) {
            endVote(io, { id: currentVote.startedBy });
        }
    }, duration);
}

function submitVote(io, socket, voteIndexes) {
    if (!currentVote?.isActive) {
        socket.emit('vote_error', '현재 진행 중인 투표가 없습니다.');
        return;
    }

    const selected = Array.isArray(voteIndexes) ? voteIndexes : [voteIndexes];

    if (!currentVote.allowMultiple && selected.length > 1) {
        socket.emit('vote_error', '단일 선택 투표입니다.');
        return;
    }

    if (!selected.every(i => typeof i === 'number' && i >= 0 && i < currentVote.options.length)) {
        socket.emit('vote_error', '잘못된 선택지입니다.');
        return;
    }

    currentVote.submissions[socket.id] = selected;

    // 실시간 투표 결과 업데이트
    // if (currentVote.revealOnSubmit) {
    //   const counts = countVotes();
    //   io.emit('vote_update', counts);
    // }
}

function endVote(io, socket) {
    if (!currentVote?.isActive) return;
    if (socket.id !== currentVote.startedBy) {
        socket.emit('vote_error', '투표를 종료할 권한이 없습니다.');
        return;
    }

    currentVote.isActive = false;
    const result = countVotes();

    io.emit('vote_ended', {
        question: currentVote.question,
        result: result.map((count, idx) => ({
            option: currentVote.options[idx],
            count
        }))
    });

    currentVote = null;
}

function countVotes() {
    const counts = new Array(currentVote.options.length).fill(0);
    for (const vote of Object.values(currentVote.submissions)) {
        for (const i of vote) {
            counts[i]++;
        }
    }
    return counts;
}

function handleDisconnect(socket) {
    if (currentVote?.isActive && currentVote.submissions[socket.id]) {
        delete currentVote.submissions[socket.id];
    }
}

function sendCurrentVoteInfo(socket) {
    if (!currentVote?.isActive) return;
    const remaining = Math.max(0, Math.floor((currentVote.startTime + currentVote.duration - Date.now()) / 1000));
    const summary = `${socket.nickname || '익명'}님의 투표가 현재 진행 중 입니다.<br/>
                    질문: ${currentVote.question}<br/>
                    남은 시간: ${remaining}초<br/>
                    --- 선택지 ---<br/>
                    ${currentVote.options.map((o, i) => `${i + 1}. ${o}`).join("<br/>")}`;
    socket.emit('system_message', summary);

    socket.emit('vote_info', {
        question: currentVote.question,
        options: currentVote.options,
        allowMultiple: currentVote.allowMultiple,
        revealOnSubmit: currentVote.revealOnSubmit,
        remainingTime: remaining
    });
}

export {
    startVote,
    submitVote,
    endVote,
    handleDisconnect,
    sendCurrentVoteInfo,
    currentVote
};
