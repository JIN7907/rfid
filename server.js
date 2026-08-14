const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// JSON 용량 제한 증가 (사진 base64 데이터 처리를 위함)
app.use(cors());
app.use(express.json({ limit: '10mb' })); 

// ==========================================
// 1. 시스템 라우트
// ==========================================
app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", system: "스마트 학교 통합 시스템" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ==========================================
// 2. 권한 및 인메모리 DB 설정
// ==========================================
const ROLES = { PRINCIPAL: 'PRINCIPAL', GRADE_HEAD: 'GRADE_HEAD', HOMEROOM: 'HOMEROOM', SUBJECT: 'SUBJECT' };

let users = [
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '학교장' },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 부장' },
    { id: 'room1-1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1-1 담임' },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '교과교사' }
];

let classes = [
    { grade: 1, classNum: 1, teacher: '김선생', isClassOn: true },
    { grade: 1, classNum: 2, teacher: '박선생', isClassOn: false }
];

// 학생 통합 DB (photo 데이터 필드 추가)
let students = [
    { id: 's1', seat: 1, name: '강감찬', grade: 1, classNum: 1, parentPhone: '010-1111-2222', photo: null, status: 'online', reason: '', lastHeartbeat: Date.now() },
    { id: 's2', seat: 5, name: '김유신', grade: 1, classNum: 1, parentPhone: '010-3333-4444', photo: null, status: 'offline', reason: '병가', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', seat: 24, name: '장영실', grade: 1, classNum: 2, parentPhone: '010-5555-6666', photo: null, status: 'online', reason: '', lastHeartbeat: Date.now() }
];

// ==========================================
// 3. 백엔드 시스템 API
// ==========================================
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    const user = users.find(u => u.id === id && u.pw === pw);
    if (user) res.json({ success: true, user });
    else res.status(401).json({ success: false, message: '아이디/비밀번호 오류' });
});

app.get('/api/dashboard', (req, res) => {
    const now = Date.now();
    students.forEach(s => {
        if (s.reason !== '🚨긴급 재난 해제') {
            s.status = (now - s.lastHeartbeat > 60000) ? 'offline' : 'online';
        }
    });
    res.json({ students, classes });
});

// [DB 등록] 신규 학생 추가 (사진 포함)
app.post('/api/students/add', (req, res) => {
    const { id, name, grade, classNum, seat, parentPhone, photo } = req.body;
    if (students.find(s => s.id === id)) {
        return res.status(400).json({ success: false, message: '이미 존재하는 학번(ID)입니다.' });
    }
    students.push({
        id, name, grade: Number(grade), classNum: Number(classNum), seat: Number(seat), parentPhone, photo,
        status: 'offline', reason: '', lastHeartbeat: 0
    });
    res.json({ success: true, message: '학생 DB 등록 완료' });
});

app.delete('/api/students/:id', (req, res) => {
    students = students.filter(s => s.id !== req.params.id);
    res.json({ success: true, message: '학생 DB 삭제 완료' });
});

app.post('/api/reason', (req, res) => {
    const { studentId, reason } = req.body;
    const student = students.find(s => s.id === studentId);
    if (student) { student.reason = reason; return res.json({ success: true }); }
    res.status(404).json({ success: false });
});

app.post('/api/emergency', (req, res) => {
    students.forEach(s => { s.status = 'offline'; s.reason = '🚨긴급 재난 해제'; });
    res.json({ success: true, message: '전교생 스마트폰 잠금 일괄 해제 완료' });
});

app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body;
    let student = students.find(s => s.id === id);
    let command = 'lock';
    if (student) {
        student.lastHeartbeat = Date.now();
        student.status = 'online';
        if (student.reason === '🚨긴급 재난 해제') command = 'unlock';
        else {
            const targetClass = classes.find(c => c.grade === student.grade && c.classNum === student.classNum);
            if (targetClass && !targetClass.isClassOn) command = 'unlock';
            else student.reason = '';
        }
    }
    res.json({ success: true, command });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 공공기관형 서버 작동 중 (포트 ${PORT})`));