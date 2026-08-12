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
app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", message: "스마트 학급 및 교사 통합 관제 시스템 작동 중" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ==========================================
// 2. 권한 및 사용자 계정 DB
// ==========================================
const ROLES = {
    PRINCIPAL: 'PRINCIPAL',   // 교장 (전교생 및 교사 전체 관제)
    GRADE_HEAD: 'GRADE_HEAD', // 학년부장
    HOMEROOM: 'HOMEROOM',     // 담임교사
    SUBJECT: 'SUBJECT'        // 교과교사
};

let users = [
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '학교장' },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 총괄부장' },
    { id: 'room1-1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1학년 1반 담임 (김선생)' },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '교과교사' }
];

// 학생 데이터 (담임 교사 정보 homeroomTeacher 추가)
let students = [
    { id: 's1', seat: 1, name: '강감찬', grade: 1, classNum: 1, homeroomTeacher: '김선생', status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's2', seat: 5, name: '김유신', grade: 1, classNum: 1, homeroomTeacher: '김선생', status: 'offline', penalty: 0, reason: '병가 (독감)', lastHeartbeat: Date.now() - 70000 },
    { id: 's3', seat: 13, name: '이순신', grade: 1, classNum: 2, homeroomTeacher: '박선생', status: 'offline', penalty: 0, reason: '현장학습', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', seat: 24, name: '장영실', grade: 1, classNum: 2, homeroomTeacher: '박선생', status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's5', seat: 8, name: '홍길동', grade: 2, classNum: 1, homeroomTeacher: '이선생', status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's6', seat: 2, name: '유관순', grade: 3, classNum: 1, homeroomTeacher: '최선생', status: 'offline', penalty: 0, reason: '조퇴 (병원)', lastHeartbeat: Date.now() - 70000 }
];

// 선생님 교시별 수업 입실/출결 데이터
let teacherSessions = [
    { id: 't1', period: '1교시', grade: 1, classNum: 1, subject: '국어', teacherName: '김국어 선생님', status: 'IN_CLASS', entryTime: '09:02' },
    { id: 't2', period: '1교시', grade: 1, classNum: 2, subject: '수학', teacherName: '이수학 선생님', status: 'DELAYED', entryTime: '미입실' },
    { id: 't3', period: '1교시', grade: 2, classNum: 1, subject: '영어', teacherName: '박영어 선생님', status: 'IN_CLASS', entryTime: '09:00' },
    { id: 't4', period: '1교시', grade: 3, classNum: 1, subject: '과학', teacherName: '최과학 선생님', status: 'IN_CLASS', entryTime: '09:01' }
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
    else res.status(401).json({ success: false, message: '아이디/비밀번호 오류' });
});

app.post('/api/reason', (req, res) => {
    const { studentId, reason } = req.body;
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.reason = reason;
        return res.json({ success: true, message: '사유 등록 완료' });
    }
    res.status(404).json({ success: false });
});

app.post('/api/penalty', (req, res) => {
    const { studentId, points } = req.body;
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.penalty = (student.penalty || 0) + Number(points);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
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

// 선생님 수업 입실 현황 조회 API
app.get('/api/teachers/sessions', (req, res) => {
    res.json(teacherSessions);
});

// 선생님 입실 상태 수동 토글 API
app.post('/api/teachers/check', (req, res) => {
    const { id, status } = req.body;
    const session = teacherSessions.find(t => t.id === id);
    if (session) {
        session.status = status;
        session.entryTime = status === 'IN_CLASS' ? new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '미입실';
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 학급 및 교사 통합 관제 서버 작동 중 (포트 ${PORT})`));