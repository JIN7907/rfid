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
app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", message: "ETI 스마트 학교 통합 시스템 작동 중" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ==========================================
// 2. 권한 및 사용자 계정 DB
// ==========================================
const ROLES = { PRINCIPAL: 'PRINCIPAL', GRADE_HEAD: 'GRADE_HEAD', HOMEROOM: 'HOMEROOM', SUBJECT: 'SUBJECT' };

let users = [
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '학교장' },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 총괄부장' },
    { id: 'room1-1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1학년 1반 담임 (김선생)' },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '교과교사' }
];

// 학생 데이터 (캐시 포인트, 학부모 알림 상태 추가)
let students = [
    { id: 's1', seat: 1, name: '강감찬', grade: 1, classNum: 1, homeroomTeacher: '김선생', status: 'online', penalty: 0, cash: 1250, parentNoti: '발송완료', reason: '', lastHeartbeat: Date.now() },
    { id: 's2', seat: 5, name: '김유신', grade: 1, classNum: 1, homeroomTeacher: '김선생', status: 'offline', penalty: 0, cash: 800, parentNoti: '발송완료', reason: '병가 (독감)', lastHeartbeat: Date.now() - 70000 },
    { id: 's3', seat: 13, name: '이순신', grade: 1, classNum: 2, homeroomTeacher: '박선생', status: 'offline', penalty: 2, cash: 1500, parentNoti: '발송완료', reason: '현장학습', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', seat: 24, name: '장영실', grade: 1, classNum: 2, homeroomTeacher: '박선생', status: 'online', penalty: 0, cash: 2100, parentNoti: '발송완료', reason: '', lastHeartbeat: Date.now() },
    { id: 's5', seat: 8, name: '홍길동', grade: 2, classNum: 1, homeroomTeacher: '이선생', status: 'online', penalty: 0, cash: 950, parentNoti: '발송대기', reason: '', lastHeartbeat: Date.now() },
    { id: 's6', seat: 2, name: '유관순', grade: 3, classNum: 1, homeroomTeacher: '최선생', status: 'offline', penalty: 0, cash: 3200, parentNoti: '발송완료', reason: '조퇴 (병원)', lastHeartbeat: Date.now() - 70000 }
];

let teacherRfidLogs = []; // 교사 RFID 태그 로그

// ==========================================
// 3. 백엔드 핵심 상업 API
// ==========================================
app.get('/api/students', (req, res) => {
    const now = Date.now();
    const updated = students.map(s => {
        // 긴급 해제 상태가 아닌 경우에만 1분 미수신 시 오프라인 처리
        if (s.reason !== '🚨긴급 재난 해제') {
            const isOffline = (now - s.lastHeartbeat > 60000);
            s.status = isOffline ? 'offline' : 'online';
        }
        return s;
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

// [상용 기능 1] RFID 태그 시 캐시 적립 및 학부모 알림 
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body;
    let student = students.find(s => s.id === id);
    if (student) {
        // 새로 등교(온라인 전환) 시 50 캐시 지급 및 알림 상태 변경
        if (student.status !== 'online') {
            student.cash += 50;
            student.parentNoti = '발송완료'; // 알림톡/앱 푸시 시뮬레이션
        }
        student.lastHeartbeat = Date.now();
        student.status = 'online';
        student.reason = '';
    }
    res.json({ success: true });
});

// [상용 기능 2] 전교생 일괄 긴급 해제 (비상 재난 상황)
app.post('/api/emergency', (req, res) => {
    students.forEach(s => {
        s.status = 'offline'; // 통제 해제 (자유 사용)
        s.reason = '🚨긴급 재난 해제';
        s.parentNoti = '긴급문자 발송'; // 학부모에게 긴급 문자 발송됨
    });
    res.json({ success: true, message: '전교생 스마트 기기 제어 일괄 해제 완료 및 학부모 긴급 문자 발송' });
});

// [상용 기능 3] 교직원 RFID 태그 수신
app.post('/api/rfid/teacher-tag', (req, res) => {
    const { teacherName, subject, grade, classNum, cardId } = req.body;
    const now = new Date();
    teacherRfidLogs.unshift({
        id: 'l_' + Date.now(),
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('ko-KR', { hour12: false }),
        teacherName: teacherName || '교과 선생님',
        subject: subject || '수업',
        grade: Number(grade) || 1,
        classNum: Number(classNum) || 1,
        cardId: cardId || 'RFID-TEMP',
        status: now.getMinutes() > 5 ? '지연입실' : '정시입실'
    });
    res.json({ success: true });
});

app.get('/api/teachers/logs', (req, res) => res.json(teacherRfidLogs));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 ETI 상용화 백엔드 포트 ${PORT} 작동 중`));