const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", system: "ETI 마더 서버 (SaaS)" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// ==========================================
// 1. [근본 아키텍처] 마더 서버 및 다중 학교 DB
// ==========================================
const ROLES = { SUPER_ADMIN: 'SUPER_ADMIN', PRINCIPAL: 'PRINCIPAL', GRADE_HEAD: 'GRADE_HEAD', HOMEROOM: 'HOMEROOM', SUBJECT: 'SUBJECT', STUDENT: 'STUDENT' };

// 💡 도입 학교 DB
let schools = [
    { id: 'sch_1', name: '한국제일고등학교', status: 'APPROVED', etiStart: "08:30", etiEnd: "16:30" }
];

// 💡 전국의 모든 사용자 (ETI 본사 + 교장 + 교사 + 학생) 통합 DB
// 초기 가입 시에는 권한이 'PENDING' 이거나 직책이 확정되지 않은 상태로 들어옴
let users = [
    // ETI 마더 서버 최고 관리자
    { id: 'eti_hq', pw: '1234', role: ROLES.SUPER_ADMIN, name: 'ETI 본사 관리자', schoolId: null, status: 'APPROVED' },
    // 한국제일고 교장 (마더서버에서 승인 완료됨)
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '이순신 교장', schoolId: 'sch_1', status: 'APPROVED' },
    // 한국제일고 교직원 (교장이 직책을 확정해주기 전엔 임시 교사 상태)
    { id: 'teacher1', pw: '1234', role: ROLES.HOMEROOM, name: '김담임', schoolId: 'sch_1', grade: 1, classNum: 1, status: 'APPROVED' }
];

// 💡 학생 가입 DB (회원가입과 RFID 카드는 분리됨. rfidCard 필드 추가)
let students = [
    { id: 'stu1', pw: '1234', name: '홍길동', schoolId: 'sch_1', grade: 1, classNum: 1, rfidCard: 's1', status: 'APPROVED', isOnline: true, reason: '', lastHeartbeat: Date.now() },
    { id: 'stu2', pw: '1234', name: '장영실', schoolId: 'sch_1', grade: 1, classNum: 1, rfidCard: null, status: 'PENDING', isOnline: false, reason: '', lastHeartbeat: 0 } // 아직 승인 대기중 (RFID 없음)
];

// ==========================================
// 2. 통합 로그인 & 데이터 API
// ==========================================
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    let user = users.find(u => u.id === id && u.pw === pw);
    if(!user) {
        // 학생 로그인 체크
        user = students.find(s => s.id === id && s.pw === pw);
        if(user) user.role = ROLES.STUDENT;
    }
    
    if (user) {
        if(user.status !== 'APPROVED') return res.status(403).json({ success: false, message: '가입 승인 대기 중입니다.' });
        
        let schoolName = 'ETI SYSTEM 마더 서버';
        if(user.schoolId) {
            const school = schools.find(s => s.id === user.schoolId);
            if(school) schoolName = school.name;
        }
        res.json({ success: true, user: { ...user, schoolName } });
    } else {
        res.status(401).json({ success: false, message: '아이디 또는 비밀번호 오류' });
    }
});

app.get('/api/dashboard', (req, res) => {
    res.json({ schools, users, students });
});

app.get('/api/schools/approved', (req, res) => {
    res.json({ success: true, schools: schools.filter(s => s.status === 'APPROVED') });
});

// ==========================================
// 3. 💡 [핵심] 회원가입 (신청) API
// ==========================================
// 3-1. 학교 신규 도입 신청 (교장이 신청)
app.post('/api/signup/school', (req, res) => {
    const { schoolName, principalId, principalPw, principalName } = req.body;
    const newSchoolId = 'sch_' + Date.now();
    
    schools.push({ id: newSchoolId, name: schoolName, status: 'PENDING' });
    users.push({ id: principalId, pw: principalPw, role: ROLES.PRINCIPAL, name: principalName, schoolId: newSchoolId, status: 'PENDING' });
    
    res.json({ success: true, message: 'ETI 마더 서버로 학교 도입 신청이 접수되었습니다.' });
});

// 3-2. 교직원/학생 가입 신청
app.post('/api/signup/user', (req, res) => {
    const { type, schoolId, id, pw, name, grade, classNum } = req.body;
    
    if(type === 'TEACHER') {
        users.push({ id, pw, role: 'TEACHER_PENDING', name, schoolId, status: 'PENDING' });
    } else if(type === 'STUDENT') {
        students.push({ id, pw, name, schoolId, grade: Number(grade), classNum: Number(classNum), rfidCard: null, status: 'PENDING', isOnline: false, reason: '', lastHeartbeat: 0 });
    }
    res.json({ success: true, message: '가입 신청 완료. 관리자 승인을 기다려주세요.' });
});

// ==========================================
// 4. 💡 [핵심] 폭포수 승인 API
// ==========================================
// 마더서버 -> 학교 승인
app.post('/api/approve/school', (req, res) => {
    const { schoolId } = req.body;
    const school = schools.find(s => s.id === schoolId);
    const principal = users.find(u => u.schoolId === schoolId && u.role === ROLES.PRINCIPAL);
    if(school) school.status = 'APPROVED';
    if(principal) principal.status = 'APPROVED';
    res.json({ success: true });
});

// 교장 -> 교사 승인 및 직책(롤) 부여
app.post('/api/approve/teacher', (req, res) => {
    const { targetId, role, grade, classNum } = req.body;
    const teacher = users.find(u => u.id === targetId);
    if(teacher) {
        teacher.status = 'APPROVED';
        teacher.role = role;
        if(grade) teacher.grade = Number(grade);
        if(classNum) teacher.classNum = Number(classNum);
    }
    res.json({ success: true });
});

// 담임/부장 -> 학생 승인
app.post('/api/approve/student', (req, res) => {
    const { studentId } = req.body;
    const student = students.find(s => s.id === studentId);
    if(student) student.status = 'APPROVED';
    res.json({ success: true });
});

// ==========================================
// 5. 💡 RFID 카드 매핑 (계정 연결)
// ==========================================
app.post('/api/rfid/map', (req, res) => {
    const { studentId, rfidCode } = req.body;
    const student = students.find(s => s.id === studentId);
    if(student) {
        student.rfidCard = rfidCode; // 계정에 실물 RFID 태그 고유번호 연동
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

// 통제 엔진 (기존과 동일하되 RFID 카드를 기준으로 판단)
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body; // 안드로이드 앱에서 올라오는 id는 이제 계정 ID가 아니라 'RFID 카드번호'임
    let student = students.find(s => s.rfidCard === id && s.status === 'APPROVED'); 
    let command = 'lock';
    if(student) {
        student.lastHeartbeat = Date.now(); student.isOnline = true;
        // ... (이전에 만든 캘린더, 결재, 시간표 연동 로직이 이 자리에 들어감. 현 MVP에서는 구조 테스트를 위해 간소화) ...
    }
    res.json({ success: true, command });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 ETI 마더 서버(SaaS) 가동 중 (포트 ${PORT})`));