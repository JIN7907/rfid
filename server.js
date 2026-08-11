const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path'); // [추가] 경로 처리를 위한 기본 모듈

const app = express();
const server = http.createServer(app);

// 미들웨어 설정 (CORS 및 JSON 파싱)
app.use(cors());
app.use(express.json());

// ==========================================
// 1. 기본 웹 접속 및 /admin 라우트
// ==========================================
// 기본 서버 상태 확인
app.get('/', (req, res) => {
    res.status(200).json({
        status: "ONLINE",
        message: "스마트 학급 관리 시스템 통합 서버 작동 중"
    });
});

// [추가] 홈페이지/admin 접속 시 admin.html 띄우기
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================================
// 2. 백엔드 핵심 로직 & 임시 데이터
// ==========================================
// 5단계 권한 설정: 1(최고관리자/학교장) ~ 5(학생)
const ROLES = {
    ADMIN: 1,
    TEACHER: 2,
    SUB_TEACHER: 3,
    MONITOR: 4,
    STUDENT: 5
};

// 임시 계정 데이터
let users = [
    { id: 'admin', pw: '1234', role: ROLES.ADMIN, name: '학교장' },
    { id: 'teacher', pw: '1234', role: ROLES.TEACHER, name: '담임교사' },
];

// 학생 통신 상태 감시를 위한 데이터
let students = [
    { id: 's1', name: '강감찬', status: 'offline', lastHeartbeat: Date.now() - 70000 },
    { id: 's2', name: '김유신', status: 'offline', lastHeartbeat: Date.now() - 70000 }
];

// [API] 권한별 로그인 기능
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    const user = users.find(u => u.id === id && u.pw === pw);
    
    if (user) {
        res.json({ success: true, user: { name: user.name, role: user.role } });
    } else {
        res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 틀렸습니다.' });
    }
});

// [API] 벌점 부여 기능
app.post('/api/penalty', (req, res) => {
    const { studentId, points, reason } = req.body;
    // 실제 DB 연동 시 이 부분에 저장 로직 추가
    res.json({ success: true, message: `${studentId} 학생에게 벌점 ${points}점 부여 완료 (사유: ${reason})` });
});

// [API] 학생 삭제 요청
app.delete('/api/student/:id', (req, res) => {
    const { id } = req.params;
    students = students.filter(s => s.id !== id);
    res.json({ success: true, message: '학생 데이터 삭제 완료' });
});

// [API] 학생 하트비트(생존 신호) 수신
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body;
    const student = students.find(s => s.id === id);
    if (student) {
        student.lastHeartbeat = Date.now();
        student.status = 'online';
    }
    res.json({ success: true });
});

// ==========================================
// 3. 학생 통신 끊김(앱 삭제) 감지 스케줄러
// ==========================================
setInterval(() => {
    const now = Date.now();
    students.forEach(student => {
        // 1분(60000ms) 이상 신호가 없으면 통신 끊김(앱 삭제)으로 간주
        if (now - student.lastHeartbeat > 60000) {
            console.log(`🚨 [경고] ${student.name} 학생 앱 삭제 또는 통신 끊김 적발!`);
            // 중복 경고를 방지하기 위해 시간을 현재로 초기화 (실제 서비스에서는 DB 상태 업데이트)
            student.lastHeartbeat = now;
        }
    });
}, 60000); // 1분마다 실행

// ==========================================
// 4. 서버 실행
// ==========================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 학급 관리 시스템 통합 서버가 포트 ${PORT}에서 작동 중입니다.`);
});