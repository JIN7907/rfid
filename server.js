const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", system: "ETI SYSTEM 마더 서버" }));

// 💡 [핵심] 스마트폰이 옛날 화면을 기억하지 못하게 강제로 캐시(Cache)를 지우는 명령 추가!
app.get('/admin', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const ROLES = { SUPER_ADMIN: 'SUPER_ADMIN', PRINCIPAL: 'PRINCIPAL', GRADE_HEAD: 'GRADE_HEAD', HOMEROOM: 'HOMEROOM', SUBJECT: 'SUBJECT', STUDENT: 'STUDENT' };

let schools = [{ id: 'sch_1', schoolCode: 'B100000001', name: '한국제일고등학교', status: 'APPROVED', etiStart: "08:30", etiEnd: "16:30", logo: null }];

let users = [
    { id: 'eti_hq', pw: '1234', role: ROLES.SUPER_ADMIN, name: 'ETI 본사 관리자', schoolId: null, status: 'APPROVED', commute: '출근', lastHeartbeat: 0, rfidCard: null },
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '이순신 교장', teacherCode: 'P00001', schoolId: 'sch_1', status: 'APPROVED', commute: '미출근', lastHeartbeat: 0, rfidCard: 't_master' },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 부장', teacherCode: 'T10001', schoolId: 'sch_1', status: 'APPROVED', commute: '미출근', lastHeartbeat: 0, rfidCard: 't_head1' },
    { id: 'teacher1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1-1 담임', teacherCode: 'T10002', schoolId: 'sch_1', status: 'APPROVED', commute: '미출근', lastHeartbeat: 0, rfidCard: 't_room1' },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '보건/교과 교사', teacherCode: 'T10003', schoolId: 'sch_1', status: 'APPROVED', commute: '미출근', lastHeartbeat: 0, rfidCard: 't_sub1' }
];

let students = [
    { id: 'stu1', pw: '1234', admissionNumber: 'A2026001', name: '강감찬', schoolId: 'sch_1', grade: 1, classNum: 1, seat: 1, rfidCard: 's1', status: 'APPROVED', isOnline: false, reason: '', lastHeartbeat: 0 },
    { id: 'stu2', pw: '1234', admissionNumber: 'A2026002', name: '장영실', schoolId: 'sch_1', grade: 1, classNum: 1, seat: 5, rfidCard: 's2', status: 'APPROVED', isOnline: false, reason: '', lastHeartbeat: 0 },
    { id: 'stu3', pw: '1234', admissionNumber: 'A2026003', name: '유관순', schoolId: 'sch_1', grade: 1, classNum: 1, seat: 24, rfidCard: 's3', status: 'APPROVED', isOnline: false, reason: '', lastHeartbeat: 0 }
];

let timetables = { 
    'teacher1': { 'mon_1': '1-1', 'mon_2': '1-1', 'tue_3': '1-2' },
    'subject1': { 'mon_1': '1-2', 'wed_4': '2-1' } 
};
let currentSchoolPeriod = 'NONE';
let academicCalendar = []; let approvalDocs = []; let docIdCounter = 1;

app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    let user = users.find(u => u.id === id && u.pw === pw);
    if(!user) { user = students.find(s => s.id === id && s.pw === pw); if(user) user.role = ROLES.STUDENT; }
    
    if (user) {
        if(user.status !== 'APPROVED') return res.status(403).json({ success: false, message: '가입 승인 대기 중입니다.' });
        let schoolName = 'ETI 마더 서버', schoolLogo = null;
        if(user.schoolId) { const school = schools.find(s => s.id === user.schoolId); if(school) { schoolName = school.name; schoolLogo = school.logo; } }
        const myTeaching = timetables[user.id] || null;
        res.json({ success: true, user: { ...user, schoolName, schoolLogo, teachingMap: myTeaching } });
    } else { res.status(401).json({ success: false, message: '아이디/비밀번호 오류' }); }
});

app.get('/api/dashboard', (req, res) => {
    const now = Date.now();
    students.forEach(s => { if (!s.reason.includes('✅') && s.reason !== '🚨긴급 재난 해제') s.isOnline = (now - s.lastHeartbeat <= 60000); });
    users.forEach(u => { u.isDeviceOnline = (now - u.lastHeartbeat <= 60000); });
    res.json({ schools, users, students, timetables, calendar: academicCalendar, approvals: approvalDocs, currentPeriod: currentSchoolPeriod });
});
app.get('/api/schools/approved', (req, res) => { res.json({ success: true, schools: schools.filter(s => s.status === 'APPROVED') }); });

// 자리 배치 저장
app.post('/api/seat/update', (req, res) => {
    const { updates } = req.body;
    updates.forEach(u => { const student = students.find(s => s.id === u.id); if(student) student.seat = u.seat; });
    res.json({ success: true });
});

app.post('/api/signup/school', (req, res) => { const { schoolName, schoolCode, principalId, principalPw, principalName, schoolLogo } = req.body; if(schools.find(s => s.schoolCode === schoolCode)) return res.status(400).json({ success: false, message: '이미 도입 신청된 학교코드입니다.' }); const newSchoolId = 'sch_' + Date.now(); schools.push({ id: newSchoolId, schoolCode, name: schoolName, logo: schoolLogo, status: 'PENDING' }); users.push({ id: principalId, pw: principalPw, role: ROLES.PRINCIPAL, name: principalName, teacherCode: 'PRINCIPAL', schoolId: newSchoolId, status: 'PENDING', commute: '미출근', lastHeartbeat: 0, rfidCard: null }); res.json({ success: true }); });
app.post('/api/signup/user', (req, res) => { const { type, schoolId, id, pw, name, grade, classNum, teacherCode, admissionNumber } = req.body; if(users.find(u => u.id === id) || students.find(s => s.id === id)) return res.status(400).json({ success: false, message: '중복 아이디' }); if(type === 'TEACHER') { if(users.find(u => u.teacherCode === teacherCode)) return res.status(400).json({ success: false, message: '중복 교원번호' }); users.push({ id, pw, role: 'TEACHER_PENDING', name, teacherCode, schoolId, status: 'PENDING', commute: '미출근', lastHeartbeat: 0, rfidCard: null }); } else if(type === 'STUDENT') { if(students.find(s => s.admissionNumber === admissionNumber)) return res.status(400).json({ success: false, message: '중복 입학번호' }); students.push({ id, pw, name, admissionNumber, schoolId, grade: Number(grade), classNum: Number(classNum), seat: Math.floor(Math.random()*25)+1, rfidCard: null, status: 'PENDING', isOnline: false, reason: '', lastHeartbeat: 0 }); } res.json({ success: true }); });
app.post('/api/approve/school', (req, res) => { const { schoolId } = req.body; const school = schools.find(s => s.id === schoolId); const principal = users.find(u => u.schoolId === schoolId && u.role === ROLES.PRINCIPAL); if(school) school.status = 'APPROVED'; if(principal) principal.status = 'APPROVED'; res.json({ success: true }); });
app.post('/api/approve/teacher', (req, res) => { const { targetId, role, grade, classNum } = req.body; const teacher = users.find(u => u.id === targetId); if(teacher) { teacher.status = 'APPROVED'; teacher.role = role; if(grade) teacher.grade = Number(grade); if(classNum) teacher.classNum = Number(classNum); } res.json({ success: true }); });
app.post('/api/approve/student', (req, res) => { const { studentId } = req.body; const student = students.find(s => s.id === studentId); if(student) student.status = 'APPROVED'; res.json({ success: true }); });
app.post('/api/rfid/map', (req, res) => { const { targetId, rfidCode, targetType } = req.body; if(targetType === 'STAFF') { const staff = users.find(u => u.id === targetId); if(staff) { staff.rfidCard = rfidCode; return res.json({ success: true }); } } else { const student = students.find(s => s.id === targetId); if(student) { student.rfidCard = rfidCode; return res.json({ success: true }); } } res.status(404).json({ success: false }); });
app.post('/api/rfid/tag', (req, res) => { const { rfidCode } = req.body; let staff = users.find(u => u.rfidCard === rfidCode && u.status === 'APPROVED'); if(staff) { staff.commute = staff.commute === '출근' ? '퇴근' : '출근'; return res.json({ success: true, type: 'STAFF', message: `${staff.name} 선생님 [${staff.commute}] 처리 완료` }); } let student = students.find(s => s.rfidCard === rfidCode && s.status === 'APPROVED'); if(student) { return res.json({ success: true, type: 'STUDENT', message: `${student.name} 학생 인식 완료` }); } res.status(404).json({ success: false, message: '등록되지 않은 RFID 카드입니다.' }); });
app.post('/api/approvals', (req, res) => { const { date, studentId, studentName, type, reason, requesterId, requesterName } = req.body; const targetStudent = students.find(s => s.id === studentId); const user = users.find(u => u.id === requesterId); let initialStatus = 'PENDING'; if (user && (user.role === 'PRINCIPAL' || (user.role === 'GRADE_HEAD' && user.grade === targetStudent.grade) || (user.role === 'HOMEROOM' && user.grade === targetStudent.grade && user.classNum === targetStudent.classNum))) initialStatus = 'APPROVED'; approvalDocs.push({ id: 'DOC-' + (docIdCounter++).toString().padStart(3, '0'), date, studentId, studentName, grade: targetStudent ? targetStudent.grade : 1, type, reason, requesterId, requesterName, status: initialStatus }); res.json({ success: true, status: initialStatus }); });
app.post('/api/approvals/process', (req, res) => { const { docId, status } = req.body; const doc = approvalDocs.find(d => d.id === docId); if (doc) doc.status = status; res.json({ success: true }); });
app.post('/api/calendar', (req, res) => { const { date, title, type } = req.body; academicCalendar.push({ id: Date.now().toString(), date, title, type }); res.json({ success: true }); });
app.delete('/api/calendar/:id', (req, res) => { academicCalendar = academicCalendar.filter(c => c.id !== req.params.id); res.json({ success: true }); });
app.post('/api/timetable', (req, res) => { const { staffId, schedule } = req.body; timetables[staffId] = schedule; res.json({ success: true }); });
app.post('/api/period/set', (req, res) => { currentSchoolPeriod = req.body.period; res.json({ success: true }); });
app.post('/api/emergency', (req, res) => { students.forEach(s => { s.isOnline = false; s.reason = '🚨긴급 재난 해제'; }); res.json({ success: true }); });
app.post('/api/reason', (req, res) => { const { studentId, reason } = req.body; const student = students.find(s => s.id === studentId); if (student) { student.reason = reason; return res.json({ success: true }); } });

// 앱 하트비트 엔진
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body; let command = 'unlock'; const today = new Date().toISOString().split('T')[0];
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
    let staff = users.find(s => s.id === id && s.status === 'APPROVED');
    if(staff) {
        staff.lastHeartbeat = Date.now();
        if(currentSchoolPeriod !== 'NONE' && timetables[staff.id] && timetables[staff.id][currentSchoolPeriod]) command = 'lock'; else command = 'unlock';
        return res.json({ success: true, command });
    }
    res.json({ success: false, command: 'unlock', message: '미등록 기기' });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 ETI SYSTEM 백엔드 서버 구동 중 (포트 ${PORT})`));