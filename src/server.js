import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import socketHandler from './socket/index.js';
import logger from './utils/logger.js';

// .env 설정 로드
dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS 설정 (개발 중엔 허용)
app.use(cors());

// JSON 파싱 (차후 REST API 추가할 때)
app.use(express.json());

// Socket.io 초기화
const io = new Server(server, {
  cors: {
    origin: '*', // 배포 시 수정
    methods: ['GET', 'POST']
  }
});

// 소켓 연결 처리
io.on('connection', (socket) => {
  socketHandler(io, socket); // 실제 이벤트는 socket/index.js에서 처리
});

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0',  () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

app.get('/', (req, res) => {
  logger.info('EC2 - CONNECTED! (3000번 포트 GET 요청)')
  return res.send("EC2 - CONNECTED!")
})