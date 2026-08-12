const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", message: "작동 중" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const ROLES = {
    PRINCIPAL: 'PRINCIPAL',
    GRADE_HEAD: 'GRADE_HEAD',
    HOMEROOM: 'HOMEROOM',
    SUBJECT: 'SUBJECT'
};

let users = [
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '학교장' },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 총괄부장' },
    { id: 'room1-1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1학년 1반 담임' },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '교과교사' }
];

// 학생 데이터에 seat(좌석 번호) 추가 (1번~25번 책상)
let students = [
    { id: 's1', seat: 1, name: '강감찬', grade: 1, classNum: 1, status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's2', seat: 5, name: '김유신', grade: 1, classNum: 1, status: 'offline', penalty: 0, reason: '병가 (독감)', lastHeartbeat: Date.now() - 70000 },
    { id: 's3', seat: 13, name: '이순신', grade: 1, classNum: 1, status: 'offline', penalty: 0, reason: '현장학습', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', seat: 24, name: '장영실', grade: 1, classNum: 1, status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's5', seat: 8, name: '홍길동', grade: 2, classNum: 1, status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's6', seat: 2, name: '유관순', grade: 3, classNum: 1, status: 'offline', penalty: 0, reason: '조퇴', lastHeartbeat: Date.now() - 70000 }
];

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

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 포트 ${PORT} 작동 중`));