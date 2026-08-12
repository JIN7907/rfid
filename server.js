const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// ==========================================
// 1. 웹 접속 라우트
// ==========================================
app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", message: "스마트 학급 관리 시스템 작동 중" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ==========================================
// 2. 권한 및 사용자 계정 DB
// ==========================================
const ROLES = {
    PRINCIPAL: 'PRINCIPAL',   // 1. 교장 (전교생 총괄)
    GRADE_HEAD: 'GRADE_HEAD', // 2. 학년 총괄 (해당 학년 전체)
    HOMEROOM: 'HOMEROOM',     // 3. 담임 교사 (해당 반 전체, 사유 등록)
    SUBJECT: 'SUBJECT'        // 4. 교과 교사 (수업할 반 선택, 벌점 및 출결 체크)
};

// 💡 테스트용 로그인 계정들
let users = [
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '학교장' },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 총괄부장' },
    { id: 'head2', pw: '1234', role: ROLES.GRADE_HEAD, grade: 2, name: '2학년 총괄부장' },
    { id: 'room1-1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1학년 1반 담임' },
    { id: 'room1-2', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 2, name: '1학년 2반 담임' },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '음악 교과교사' } // 교과교사는 접속 후 반을 선택
];

// 테스트용 학생 데이터
let students = [
    { id: 's1', name: '강감찬', grade: 1, classNum: 1, status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's2', name: '김유신', grade: 1, classNum: 1, status: 'offline', penalty: 0, reason: '병가 (독감)', lastHeartbeat: Date.now() - 70000 },
    { id: 's3', name: '이순신', grade: 1, classNum: 2, status: 'offline', penalty: 0, reason: '현장학습', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', name: '홍길동', grade: 2, classNum: 1, status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's5', name: '유관순', grade: 3, classNum: 1, status: 'offline', penalty: 0, reason: '조퇴 (병원)', lastHeartbeat: Date.now() - 70000 }
];

// ==========================================
// 3. 백엔드 API
// ==========================================
app.get('/api/students', (req, res) => {
    const now = Date.now();
    const updated = students.map(s => {
        const isOffline = (now - s.lastHeartbeat > 60000);
        return { ...s, status: isOffline ? 'offline' : 'online' };
    });
    res.json(updated);
});

app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    const user = users.find(u => u.id === id && u.pw === pw);
    if (user) res.json({ success: true, user });
    else res.status(401).json({ success: false, message: '아이디/비밀번호가 올바르지 않습니다.' });
});

app.post('/api/reason', (req, res) => {
    const { studentId, reason } = req.body;
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.reason = reason;
        return res.json({ success: true, message: '사유가 등록되었습니다.' });
    }
    res.status(404).json({ success: false, message: '학생을 찾을 수 없습니다.' });
});

app.post('/api/penalty', (req, res) => {
    const { studentId, points, reason } = req.body;
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.penalty = (student.penalty || 0) + Number(points);
        return res.json({ success: true, message: `벌점 ${points}점 부여 완료` });
    }
    res.status(404).json({ success: false, message: '학생을 찾을 수 없습니다.' });
});

app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body;
    let student = students.find(s => s.id === id);
    if (student) {
        student.lastHeartbeat = Date.now();
        student.status = 'online';
        student.reason = '';
    }
    res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 시스템이 포트 ${PORT}에서 작동 중입니다.`));