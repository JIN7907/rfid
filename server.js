const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==========================================
// 1. 시스템 라우트 & 기초 DB
// ==========================================
app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", system: "ETI SYSTEM (enter time internet)" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const ROLES = { PRINCIPAL: 'PRINCIPAL', GRADE_HEAD: 'GRADE_HEAD', HOMEROOM: 'HOMEROOM', SUBJECT: 'SUBJECT' };

let users = [
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '학교장' },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 부장' },
    { id: 'room1-1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1-1 담임', teaching: { grade: 1, classNum: 2, subject: '수학', period: '3교시' } },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '보건/교과교사', teaching: { grade: 2, classNum: 1, subject: '보건', period: '3교시' } }
];

let classes = [
    { grade: 1, classNum: 1, teacher: '1-1 담임', isClassOn: true },
    { grade: 1, classNum: 2, teacher: '1-2 담임', isClassOn: true },
    { grade: 2, classNum: 1, teacher: '2-1 담임', isClassOn: true }
];

let students = [
    { id: 's1', seat: 1, name: '강감찬', grade: 1, classNum: 1, studentPhone: '010-1234-5678', parentPhone: '010-1111-2222', photo: null, status: 'online', reason: '', lastHeartbeat: Date.now() },
    { id: 's2', seat: 5, name: '김유신', grade: 1, classNum: 1, studentPhone: '010-2345-6789', parentPhone: '010-3333-4444', photo: null, status: 'offline', reason: '병가', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', seat: 24, name: '장영실', grade: 1, classNum: 2, studentPhone: '010-3456-7890', parentPhone: '010-5555-6666', photo: null, status: 'online', reason: '', lastHeartbeat: Date.now() },
    { id: 's5', seat: 12, name: '유관순', grade: 2, classNum: 1, studentPhone: '010-4567-8901', parentPhone: '010-6666-7777', photo: null, status: 'online', reason: '', lastHeartbeat: Date.now() }
];

let systemSettings = {
    1: { etiStart: "08:30", etiEnd: "16:30", schedule: { mon: "09:00~15:00", tue: "09:00~15:00", wed: "09:00~15:00", thu: "09:00~15:00", fri: "09:00~15:00", sat: "휴무" } },
    2: { etiStart: "08:30", etiEnd: "16:30", schedule: { mon: "09:00~16:00", tue: "09:00~16:00", wed: "09:00~16:00", thu: "09:00~16:00", fri: "09:00~16:00", sat: "휴무" } },
    3: { etiStart: "08:00", etiEnd: "22:00", schedule: { mon: "08:30~17:00", tue: "08:30~17:00", wed: "08:30~17:00", thu: "08:30~17:00", fri: "08:30~17:00", sat: "09:00~13:00" } }
};

let academicCalendar = []; 
let approvalDocs = []; 
let docIdCounter = 1;

// ==========================================
// 2. 통합 API
// ==========================================
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    const user = users.find(u => u.id === id && u.pw === pw);
    if (user) res.json({ success: true, user }); else res.status(401).json({ success: false });
});

app.get('/api/dashboard', (req, res) => {
    const now = Date.now();
    students.forEach(s => {
        if (!s.reason.includes('✅') && s.reason !== '🚨긴급 재난 해제') s.status = (now - s.lastHeartbeat > 60000) ? 'offline' : 'online';
    });
    res.json({ students, classes, settings: systemSettings, calendar: academicCalendar, approvals: approvalDocs });
});

// 💡 [핵심] 전자결재 자동 승인 처리 로직 추가
app.post('/api/approvals', (req, res) => {
    const { date, studentId, studentName, type, reason, requesterId, requesterName } = req.body;
    const targetStudent = students.find(s => s.id === studentId);
    const user = users.find(u => u.id === requesterId);
    
    let initialStatus = 'PENDING';
    
    // 💡 학급장(담임)이나 학년장이 본인 소속 학생을 올리면 즉시 '자동 승인'
    if (user) {
        if (user.role === 'PRINCIPAL') initialStatus = 'APPROVED';
        else if (user.role === 'GRADE_HEAD' && user.grade === targetStudent.grade) initialStatus = 'APPROVED';
        else if (user.role === 'HOMEROOM' && user.grade === targetStudent.grade && user.classNum === targetStudent.classNum) initialStatus = 'APPROVED';
    }

    approvalDocs.push({ 
        id: 'DOC-' + (docIdCounter++).toString().padStart(3, '0'), 
        date, studentId, studentName, grade: targetStudent ? targetStudent.grade : 1, 
        type, reason, requesterId, requesterName, status: initialStatus 
    });
    res.json({ success: true, status: initialStatus });
});

app.post('/api/approvals/process', (req, res) => { const { docId, status } = req.body; const doc = approvalDocs.find(d => d.id === docId); if (doc) doc.status = status; res.json({ success: true }); });
app.post('/api/calendar', (req, res) => { const { date, title, type } = req.body; academicCalendar.push({ id: Date.now().toString(), date, title, type }); res.json({ success: true }); });
app.delete('/api/calendar/:id', (req, res) => { academicCalendar = academicCalendar.filter(c => c.id !== req.params.id); res.json({ success: true }); });

// 기존 DB API
app.get('/api/settings', (req, res) => res.json({ success: true, settings: systemSettings }));
app.post('/api/settings', (req, res) => { const { grade, data } = req.body; if(systemSettings[grade]) { systemSettings[grade] = data; res.json({ success: true }); } });
app.post('/api/students/add', (req, res) => { const { id, name, grade, classNum, seat, studentPhone, parentPhone, photo } = req.body; students.push({ id, name, grade: Number(grade), classNum: Number(classNum), seat: Number(seat), studentPhone, parentPhone, photo, status: 'offline', reason: '', lastHeartbeat: 0 }); res.json({ success: true }); });
app.post('/api/students/promote', (req, res) => { const { studentIds, targetGrade, targetClass } = req.body; students.forEach(s => { if (studentIds.includes(s.id)) { s.grade = Number(targetGrade); s.classNum = Number(targetClass); s.seat = 0; } }); res.json({ success: true }); });
app.delete('/api/students/:id', (req, res) => { students = students.filter(s => s.id !== req.params.id); res.json({ success: true }); });
app.post('/api/reason', (req, res) => { const { studentId, reason } = req.body; const student = students.find(s => s.id === studentId); if (student) { student.reason = reason; return res.json({ success: true }); } });
app.post('/api/emergency', (req, res) => { students.forEach(s => { s.status = 'offline'; s.reason = '🚨긴급 재난 해제'; }); res.json({ success: true }); });

// ==========================================
// 3. ETI 기기 통제 심장
// ==========================================
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body; 
    let student = students.find(s => s.id === id); 
    let command = 'lock';
    const today = new Date().toISOString().split('T')[0];

    if (student) {
        student.lastHeartbeat = Date.now(); student.status = 'online';

        if (student.reason === '🚨긴급 재난 해제') {
            command = 'unlock';
        } else {
            const todayEvent = academicCalendar.find(c => c.date === today);
            if (todayEvent && todayEvent.type === 'HOLIDAY') { command = 'unlock'; student.reason = `📅 학사일정: ${todayEvent.title}`; } 
            else if (todayEvent && todayEvent.type === 'EXAM') { command = 'lock'; student.reason = `📝 시험 중 철통 잠금`; } 
            else {
                const approvedDoc = approvalDocs.find(d => d.date === today && d.studentId === student.id && d.status === 'APPROVED');
                if (approvedDoc) { command = 'unlock'; student.reason = `✅ 승인완료 (${approvedDoc.type})`; student.status = 'offline'; } 
                else { const targetClass = classes.find(c => c.grade === student.grade && c.classNum === student.classNum); if (targetClass && !targetClass.isClassOn) command = 'unlock'; else student.reason = ''; }
            }
        }
    }
    res.json({ success: true, command });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 ETI SYSTEM 백엔드 서버 가동 (포트 ${PORT})`));