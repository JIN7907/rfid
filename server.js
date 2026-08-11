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
app.get('/', (req, res) => {
    res.status(200).json({
        status: "ONLINE",
        message: "스마트 학급 관리 시스템 통합 서버 작동 중"
    });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================================
// 2. 서버 메모리 데이터 (실제 서버 상태)
// ==========================================
const ROLES = { ADMIN: 1, TEACHER: 2, SUB_TEACHER: 3, MONITOR: 4, STUDENT: 5 };

let users = [
    { id: 'admin', pw: '1234', role: ROLES.ADMIN, name: '학교장' },
    { id: 'teacher', pw: '1234', role: ROLES.TEACHER, name: '담임교사' },
];

let students = [
    { id: 's1', name: '강감찬', status: 'offline', penalty: 0, lastHeartbeat: Date.now() - 70000 },
    { id: 's2', name: '김유신', status: 'offline', penalty: 0, lastHeartbeat: Date.now() - 70000 }
];

// ==========================================
// 3. 진짜 서버 연동 API
// ==========================================

// [API] 실시간 학생 목록 및 상태 조회 (3초마다 웹에서 가져감)
app.get('/api/students', (req, res) => {
    const now = Date.now();
    // 60초 이상 신호 없으면 offline 자동 변경
    const updated = students.map(s => ({
        ...s,
        status: (now - s.lastHeartbeat > 60000) ? 'offline' : 'online'
    }));
    res.json(updated);
});

// [API] 로그인
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    const user = users.find(u => u.id === id && u.pw === pw);
    
    if (user) {
        res.json({ success: true, user: { name: user.name, role: user.role } });
    } else {
        res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
});

// [API] 벌점 부여 (서버 데이터 실제 수정)
app.post('/api/penalty', (req, res) => {
    const { studentId, points, reason } = req.body;
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.penalty = (student.penalty || 0) + Number(points);
        return res.json({ success: true, message: `${student.name} 학생에게 벌점 ${points}점 부여 완료`, currentPenalty: student.penalty });
    }
    res.status(404).json({ success: false, message: '학생을 찾을 수 없습니다.' });
});

// [API] 학생 삭제 (서버 데이터 실제 삭제)
app.delete('/api/student/:id', (req, res) => {
    const { id } = req.params;
    const initialLen = students.length;
    students = students.filter(s => s.id !== id);
    if (students.length < initialLen) {
        return res.json({ success: true, message: '학생이 서버에서 삭제되었습니다.' });
    }
    res.status(404).json({ success: false, message: '삭제할 학생을 찾지 못했습니다.' });
});

// [API] 학생 앱/하드웨어 신호(하트비트) 수신
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body;
    let student = students.find(s => s.id === id);
    if (student) {
        student.lastHeartbeat = Date.now();
        student.status = 'online';
    } else {
        // 새 신호가 오면 자동으로 서버 목록에 추가
        students.push({
            id: id,
            name: `학생_${id}`,
            status: 'online',
            penalty: 0,
            lastHeartbeat: Date.now()
        });
    }
    res.json({ success: true, status: 'online' });
});

// 감시 스케줄러 (1분 주기)
setInterval(() => {
    const now = Date.now();
    students.forEach(student => {
        if (now - student.lastHeartbeat > 60000 && student.status === 'online') {
            console.log(`🚨 [경고] ${student.name} 학생 통신 끊김 적발!`);
            student.status = 'offline';
        }
    });
}, 60000);

// 서버 실행
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 학급 관리 시스템 통합 서버가 포트 ${PORT}에서 작동 중입니다.`);
});