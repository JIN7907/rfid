const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", system: "ETI SYSTEM 마더 서버" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const ROLES = { SUPER_ADMIN: 'SUPER_ADMIN', PRINCIPAL: 'PRINCIPAL', GRADE_HEAD: 'GRADE_HEAD', HOMEROOM: 'HOMEROOM', SUBJECT: 'SUBJECT', STUDENT: 'STUDENT' };

// 💡 도입 학교 DB
let schools = [{ id: 'sch_1', name: '한국제일고등학교', status: 'APPROVED', etiStart: "08:30", etiEnd: "16:30" }];

// 💡 교직원 및 관리자 DB
let users = [
    { id: 'eti_hq', pw: '1234', role: ROLES.SUPER_ADMIN, name: 'ETI 본사 관리자', schoolId: null, status: 'APPROVED', commute: '미출근', lastHeartbeat: 0 },
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '이순신 교장', schoolId: 'sch_1', status: 'APPROVED', commute: '출근', lastHeartbeat: 0 },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 부장', schoolId: 'sch_1', status: 'APPROVED', commute: '출근', lastHeartbeat: 0 },
    { id: 'teacher1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1-1 담임', schoolId: 'sch_1', status: 'APPROVED', commute: '출근', lastHeartbeat: 0 }
];

// 💡 학생 DB (회원가입과 RFID 카드 분리)
let students = [
    { id: 'stu1', pw: '1234', name: '강감찬', schoolId: 'sch_1', grade: 1, classNum: 1, seat: 1, rfidCard: 's1', status: 'APPROVED', isOnline: false, reason: '', lastHeartbeat: 0 },
    { id: 'stu2', pw: '1234', name: '장영실', schoolId: 'sch_1', grade: 1, classNum: 1, seat: 5, rfidCard: null, status: 'PENDING', isOnline: false, reason: '', lastHeartbeat: 0 },
    { id: 'stu3', pw: '1234', name: '유관순', schoolId: 'sch_1', grade: 1, classNum: 2, seat: 12, rfidCard: 's4', status: 'APPROVED', isOnline: false, reason: '', lastHeartbeat: 0 }
];

let timetables = { 'teacher1': { 'mon_1': '1-1', 'mon_2': '1-1', 'tue_3': '1-2' } };
let currentSchoolPeriod = 'NONE';
let systemSettings = {
    1: { etiStart: "08:30", etiEnd: "16:30", schedule: { mon: "09:00~15:00", tue: "09:00~15:00", wed: "09:00~15:00", thu: "09:00~15:00", fri: "09:00~15:00", sat: "휴무" } },
    2: { etiStart: "08:30", etiEnd: "16:30", schedule: { mon: "09:00~16:00", tue: "09:00~16:00", wed: "09:00~16:00", thu: "09:00~16:00", fri: "09:00~16:00", sat: "휴무" } }
};
let academicCalendar = []; let approvalDocs = []; let docIdCounter = 1;

// ==========================================
// 로그인 및 대시보드
// ==========================================
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    let user = users.find(u => u.id === id && u.pw === pw);
    if(!user) { user = students.find(s => s.id === id && s.pw === pw); if(user) user.role = ROLES.STUDENT; }
    
    if (user) {
        if(user.status !== 'APPROVED') return res.status(403).json({ success: false, message: '가입 승인 대기 중입니다.' });
        let schoolName = 'ETI SYSTEM 마더 서버';
        if(user.schoolId) { const school = schools.find(s => s.id === user.schoolId); if(school) schoolName = school.name; }
        
        // 💡 로그인 시 본인 시간표 객체도 같이 내려줌 (모바일 연동을 위함)
        const myTeaching = timetables[user.id] || null;
        res.json({ success: true, user: { ...user, schoolName, teachingMap: myTeaching } });
    } else { res.status(401).json({ success: false, message: '아이디/비밀번호 오류' }); }
});

app.get('/api/dashboard', (req, res) => {
    const now = Date.now();
    students.forEach(s => { if (!s.reason.includes('✅') && s.reason !== '🚨긴급 재난 해제') s.isOnline = (now - s.lastHeartbeat <= 60000); });
    users.forEach(u => { u.isDeviceOnline = (now - u.lastHeartbeat <= 60000); });
    res.json({ schools, users, students, timetables, calendar: academicCalendar, approvals: approvalDocs, currentPeriod: currentSchoolPeriod, settings: systemSettings });
});
app.get('/api/schools/approved', (req, res) => { res.json({ success: true, schools: schools.filter(s => s.status === 'APPROVED') }); });

// ==========================================
// 💡 [핵심] 가입, 폭포수 승인, RFID 매핑
// ==========================================
app.post('/api/signup/school', (req, res) => {
    const { schoolName, principalId, principalPw, principalName } = req.body;
    const newSchoolId = 'sch_' + Date.now();
    schools.push({ id: newSchoolId, name: schoolName, status: 'PENDING' });
    users.push({ id: principalId, pw: principalPw, role: ROLES.PRINCIPAL, name: principalName, schoolId: newSchoolId, status: 'PENDING', commute: '미출근', lastHeartbeat: 0 });
    res.json({ success: true });
});
app.post('/api/signup/user', (req, res) => {
    const { type, schoolId, id, pw, name, grade, classNum } = req.body;
    if(type === 'TEACHER') users.push({ id, pw, role: 'TEACHER_PENDING', name, schoolId, status: 'PENDING', commute: '미출근', lastHeartbeat: 0 });
    else if(type === 'STUDENT') students.push({ id, pw, name, schoolId, grade: Number(grade), classNum: Number(classNum), seat: Math.floor(Math.random()*25)+1, rfidCard: null, status: 'PENDING', isOnline: false, reason: '', lastHeartbeat: 0 });
    res.json({ success: true });
});
app.post('/api/approve/school', (req, res) => {
    const { schoolId } = req.body; const school = schools.find(s => s.id === schoolId); const principal = users.find(u => u.schoolId === schoolId && u.role === ROLES.PRINCIPAL);
    if(school) school.status = 'APPROVED'; if(principal) principal.status = 'APPROVED'; res.json({ success: true });
});
app.post('/api/approve/teacher', (req, res) => {
    const { targetId, role, grade, classNum } = req.body; const teacher = users.find(u => u.id === targetId);
    if(teacher) { teacher.status = 'APPROVED'; teacher.role = role; if(grade) teacher.grade = Number(grade); if(classNum) teacher.classNum = Number(classNum); } res.json({ success: true });
});
app.post('/api/approve/student', (req, res) => { const { studentId } = req.body; const student = students.find(s => s.id === studentId); if(student) student.status = 'APPROVED'; res.json({ success: true }); });
app.post('/api/rfid/map', (req, res) => { const { studentId, rfidCode } = req.body; const student = students.find(s => s.id === studentId); if(student) { student.rfidCard = rfidCode; res.json({ success: true }); } else res.status(404).json({ success: false }); });

// ==========================================
// 일반 행정 (결재, 시간표, 출퇴근)
// ==========================================
app.post('/api/approvals', (req, res) => {
    const { date, studentId, studentName, type, reason, requesterId, requesterName } = req.body;
    const targetStudent = students.find(s => s.id === studentId); const user = users.find(u => u.id === requesterId);
    let initialStatus = 'PENDING';
    if (user && (user.role === 'PRINCIPAL' || (user.role === 'GRADE_HEAD' && user.grade === targetStudent.grade) || (user.role === 'HOMEROOM' && user.grade === targetStudent.grade && user.classNum === targetStudent.classNum))) initialStatus = 'APPROVED';
    approvalDocs.push({ id: 'DOC-' + (docIdCounter++).toString().padStart(3, '0'), date, studentId, studentName, grade: targetStudent ? targetStudent.grade : 1, type, reason, requesterId, requesterName, status: initialStatus });
    res.json({ success: true, status: initialStatus });
});
app.post('/api/approvals/process', (req, res) => { const { docId, status } = req.body; const doc = approvalDocs.find(d => d.id === docId); if (doc) doc.status = status; res.json({ success: true }); });
app.post('/api/calendar', (req, res) => { const { date, title, type } = req.body; academicCalendar.push({ id: Date.now().toString(), date, title, type }); res.json({ success: true }); });
app.delete('/api/calendar/:id', (req, res) => { academicCalendar = academicCalendar.filter(c => c.id !== req.params.id); res.json({ success: true }); });
app.post('/api/commute', (req, res) => { const { staffId, status } = req.body; const staff = users.find(s => s.id === staffId); if (staff) { staff.commute = status; res.json({ success: true }); } });
app.post('/api/timetable', (req, res) => { const { staffId, schedule } = req.body; timetables[staffId] = schedule; res.json({ success: true }); });
app.post('/api/period/set', (req, res) => { currentSchoolPeriod = req.body.period; res.json({ success: true }); });
app.post('/api/emergency', (req, res) => { students.forEach(s => { s.isOnline = false; s.reason = '🚨긴급 재난 해제'; }); res.json({ success: true }); });

// ==========================================
// 💡 ETI 심장 엔진 (학생+교사 자동 잠금 / RFID 기준)
// ==========================================
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body; // 앱에서 올라오는 id (학생은 RFID, 교사는 계정ID)
    let command = 'unlock';
    const today = new Date().toISOString().split('T')[0];

    // [로직 A] 학생 판별 (rfidCard 로 매칭)
    let student = students.find(s => s.rfidCard === id && s.status === 'APPROVED'); 
    if (student) {
        student.lastHeartbeat = Date.now(); student.isOnline = true;
        if (student.reason === '🚨긴급 재난 해제') { command = 'unlock'; } 
        else {
            const todayEvent = academicCalendar.find(c => c.date === today);
            if (todayEvent && todayEvent.type === 'HOLIDAY') { command = 'unlock'; student.reason = `📅 학사일정: ${todayEvent.title}`; } 
            else if (todayEvent && todayEvent.type === 'EXAM') { command = 'lock'; student.reason = `📝 시험 중 철통 잠금`; } 
            else {
                const approvedDoc = approvalDocs.find(d => d.date === today && d.studentId === student.id && d.status === 'APPROVED');
                if (approvedDoc) { command = 'unlock'; student.reason = `✅ 승인완료 (${approvedDoc.type})`; student.isOnline = false; } 
                else { 
                    if(currentSchoolPeriod === 'NONE') { command = 'unlock'; student.reason = ''; } 
                    else {
                        let isClassRunning = false;
                        for(const tId in timetables) { if(timetables[tId][currentSchoolPeriod] === `${student.grade}-${student.classNum}`) { isClassRunning = true; break; } }
                        if(isClassRunning) { command = 'lock'; student.reason = ''; } else { command = 'unlock'; student.reason = '공강/자습'; }
                    }
                }
            }
        }
        return res.json({ success: true, command });
    }

    // [로직 B] 교직원 판별
    let staff = users.find(s => s.id === id && s.status === 'APPROVED');
    if(staff) {
        staff.lastHeartbeat = Date.now();
        if(currentSchoolPeriod !== 'NONE' && timetables[staff.id] && timetables[staff.id][currentSchoolPeriod]) command = 'lock';
        else command = 'unlock';
        return res.json({ success: true, command });
    }

    res.json({ success: false, message: '등록되지 않은 기기 또는 미승인' });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 ETI SYSTEM 마더서버(관제 내장) 가동 중 (포트 ${PORT})`));