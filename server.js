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
app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", message: "스마트 학교 통합 시스템 작동 중" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ==========================================
// 2. 권한 및 사용자 계정 DB
// ==========================================
const ROLES = {
    PRINCIPAL: 'PRINCIPAL',   // 교장 (전교생 및 업무평가 다운로드 권한)
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

// 학생 데이터 (담임 교사 정보 포함)
let students = [
    { id: 's1', seat: 1, name: '강감찬', grade: 1, classNum: 1, homeroomTeacher: '김선생', status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's2', seat: 5, name: '김유신', grade: 1, classNum: 1, homeroomTeacher: '김선생', status: 'offline', penalty: 0, reason: '병가 (독감)', lastHeartbeat: Date.now() - 70000 },
    { id: 's3', seat: 13, name: '이순신', grade: 1, classNum: 2, homeroomTeacher: '박선생', status: 'offline', penalty: 0, reason: '현장학습', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', seat: 24, name: '장영실', grade: 1, classNum: 2, homeroomTeacher: '박선생', status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's5', seat: 8, name: '홍길동', grade: 2, classNum: 1, homeroomTeacher: '이선생', status: 'online', penalty: 0, reason: '', lastHeartbeat: Date.now() },
    { id: 's6', seat: 2, name: '유관순', grade: 3, classNum: 1, homeroomTeacher: '최선생', status: 'offline', penalty: 0, reason: '조퇴 (병원)', lastHeartbeat: Date.now() - 70000 }
];

// 💡 교직원 RFID 신분증 태그 누적 기록 (업무평가 다운로드용 샘플 데이터)
let teacherRfidLogs = [
    { id: 'l1', date: '2026-08-01', time: '08:58:12', teacherName: '김국어 선생님', subject: '국어', grade: 1, classNum: 1, cardId: 'RFID-T881', status: '정시입실' },
    { id: 'l2', date: '2026-08-01', time: '09:04:30', teacherName: '이수학 선생님', subject: '수학', grade: 1, classNum: 2, cardId: 'RFID-T882', status: '지연입실(4분)' },
    { id: 'l3', date: '2026-08-02', time: '08:59:00', teacherName: '박영어 선생님', subject: '영어', grade: 2, classNum: 1, cardId: 'RFID-T883', status: '정시입실' },
    { id: 'l4', date: '2026-08-02', time: '08:57:40', teacherName: '최과학 선생님', subject: '과학', grade: 3, classNum: 1, cardId: 'RFID-T884', status: '정시입실' }
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

// 💳 [RFID] 교직원 신분증 태그 수신 API (교실 입구 단말기에서 전달받음)
app.post('/api/rfid/teacher-tag', (req, res) => {
    const { teacherName, subject, grade, classNum, cardId } = req.body;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('ko-KR', { hour12: false });

    const newLog = {
        id: 'l_' + Date.now(),
        date: dateStr,
        time: timeStr,
        teacherName: teacherName || '교과 선생님',
        subject: subject || '수업',
        grade: Number(grade) || 1,
        classNum: Number(classNum) || 1,
        cardId: cardId || 'RFID-TEMP',
        status: now.getMinutes() > 5 ? '지연입실' : '정시입실'
    };

    teacherRfidLogs.unshift(newLog); // 최신 기록을 맨 앞으로
    res.json({ success: true, message: `${teacherName} 선생님 RFID 태그 기록 완료`, log: newLog });
});

// 📊 월간 교사 수업입실 로그 조회 API
app.get('/api/teachers/logs', (req, res) => {
    res.json(teacherRfidLogs);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 포트 ${PORT} 작동 중`));