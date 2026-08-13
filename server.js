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
app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", message: "ETI 스마트 통합 관제 서버 작동 중" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ==========================================
// 2. 권한, 학급, 학생 데이터베이스
// ==========================================
const ROLES = { PRINCIPAL: 'PRINCIPAL', GRADE_HEAD: 'GRADE_HEAD', HOMEROOM: 'HOMEROOM', SUBJECT: 'SUBJECT' };

// 4단계 직급별 로그인 계정
let users = [
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '학교장' },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 부장' },
    { id: 'room1-1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1-1 담임' },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '교과교사' }
];

// 학급(반)별 현재 수업 진행 상태 데이터
let classes = [
    { grade: 1, classNum: 1, teacher: '김선생', isClassOn: true },
    { grade: 1, classNum: 2, teacher: '박선생', isClassOn: false }, // 수업 아님 (화면에서 붉은 알람 점멸)
    { grade: 2, classNum: 1, teacher: '이선생', isClassOn: true },
    { grade: 3, classNum: 1, teacher: '최선생', isClassOn: true }
];

// 학생 데이터
let students = [
    { id: 's1', seat: 1, name: '강감찬', grade: 1, classNum: 1, status: 'online', reason: '', lastHeartbeat: Date.now() },
    { id: 's2', seat: 5, name: '김유신', grade: 1, classNum: 1, status: 'offline', reason: '병가', lastHeartbeat: Date.now() - 70000 },
    { id: 's3', seat: 13, name: '이순신', grade: 1, classNum: 2, status: 'offline', reason: '현장학습', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', seat: 24, name: '장영실', grade: 1, classNum: 2, status: 'online', reason: '', lastHeartbeat: Date.now() }, // 안드로이드 테스트 계정
    { id: 's5', seat: 8, name: '홍길동', grade: 2, classNum: 1, status: 'online', reason: '', lastHeartbeat: Date.now() },
    { id: 's6', seat: 2, name: '유관순', grade: 3, classNum: 1, status: 'offline', reason: '조퇴', lastHeartbeat: Date.now() - 70000 }
];

// ==========================================
// 3. 백엔드 핵심 API
// ==========================================
// 통합 관제 데이터 전송
app.get('/api/dashboard', (req, res) => {
    const now = Date.now();
    students.forEach(s => {
        // 긴급 해제 상태가 아닌 경우 1분 미수신 시 오프라인 처리
        if (s.reason !== '🚨긴급 재난 해제') {
            s.status = (now - s.lastHeartbeat > 60000) ? 'offline' : 'online';
        }
    });
    res.json({ students, classes });
});

// 직급별 로그인
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    const user = users.find(u => u.id === id && u.pw === pw);
    if (user) res.json({ success: true, user });
    else res.status(401).json({ success: false, message: '아이디/비밀번호 오류' });
});

// 사유 입력
app.post('/api/reason', (req, res) => {
    const { studentId, reason } = req.body;
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.reason = reason;
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

// 전교생 기기 제어 일괄 해제 (긴급 상황)
app.post('/api/emergency', (req, res) => {
    students.forEach(s => {
        s.status = 'offline'; // 잠금 해제
        s.reason = '🚨긴급 재난 해제';
    });
    res.json({ success: true, message: '전교생 스마트폰 잠금 및 제어가 일괄 해제되었습니다.' });
});

// 학생 생존 신호 수신 및 앱 제어 명령(lock/unlock) 하달
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body;
    let student = students.find(s => s.id === id);
    let command = 'lock'; // 기본적으로 수업 중이면 잠금

    if (student) {
        student.lastHeartbeat = Date.now();
        student.status = 'online';

        // 1. 긴급 해제 상태일 때
        if (student.reason === '🚨긴급 재난 해제') {
            command = 'unlock';
        } else {
            // 2. 해당 학생 반의 수업 상태가 '수업 아님' 일 때
            const targetClass = classes.find(c => c.grade === student.grade && c.classNum === student.classNum);
            if (targetClass && !targetClass.isClassOn) {
                command = 'unlock';
            } else {
                student.reason = ''; // 정상 수업 및 잠금 상태
            }
        }
    }
    // 안드로이드로 최종 명령 하달
    res.json({ success: true, command });
});

// 반 수업 상태 변경 (관제 테스트용)
app.post('/api/class-status', (req, res) => {
    const { grade, classNum, isClassOn } = req.body;
    const targetClass = classes.find(c => c.grade === grade && c.classNum === classNum);
    if (targetClass) {
        targetClass.isClassOn = isClassOn;
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 심플 통합 관제 서버 포트 ${PORT} 작동 중`));