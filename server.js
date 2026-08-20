const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ==========================================
// 1. 기초 DB (교직원, 학적, 시간표)
// ==========================================
app.get('/', (req, res) => res.status(200).json({ status: "ONLINE", system: "ETI SYSTEM" }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const ROLES = { PRINCIPAL: 'PRINCIPAL', GRADE_HEAD: 'GRADE_HEAD', HOMEROOM: 'HOMEROOM', SUBJECT: 'SUBJECT' };

// 💡 [신규] 교직원 통합 DB (출퇴근 상태 포함)
let staffs = [
    { id: 'master', pw: '1234', role: ROLES.PRINCIPAL, name: '학교장', phone: '010-0000-0001', commute: '미출근', lastHeartbeat: 0 },
    { id: 'head1', pw: '1234', role: ROLES.GRADE_HEAD, grade: 1, name: '1학년 부장', phone: '010-0000-0002', commute: '출근', lastHeartbeat: 0 },
    { id: 'room1-1', pw: '1234', role: ROLES.HOMEROOM, grade: 1, classNum: 1, name: '1-1 담임', phone: '010-0000-0003', commute: '출근', lastHeartbeat: 0 },
    { id: 'subject1', pw: '1234', role: ROLES.SUBJECT, name: '보건/교과', phone: '010-0000-0004', commute: '퇴근', lastHeartbeat: 0 }
];

// 💡 [신규] 교사별 시간표 DB (선생님들이 각자 짠 스케줄 저장)
// 구조: { 'room1-1': { '월_1교시': '1-1', '화_3교시': '1-2' } }
let timetables = {
    'room1-1': { 'mon_1': '1-1', 'mon_2': '1-1', 'tue_3': '1-2' },
    'subject1': { 'mon_1': '1-2', 'wed_4': '2-1' }
};

// 💡 현재 시연용 '학교 교시' 상태 (실제 시간 대신 컨트롤 가능)
let currentSchoolPeriod = 'NONE'; // 예: 'mon_1', 'tue_3', 'NONE'(쉬는시간/하교)

let students = [
    { id: 's1', seat: 1, name: '강감찬', grade: 1, classNum: 1, studentPhone: '010-1234-5678', parentPhone: '010-1111-2222', photo: null, status: 'online', reason: '', lastHeartbeat: Date.now() },
    { id: 's2', seat: 5, name: '김유신', grade: 1, classNum: 1, studentPhone: '010-2345-6789', parentPhone: '010-3333-4444', photo: null, status: 'offline', reason: '병가', lastHeartbeat: Date.now() - 70000 },
    { id: 's4', seat: 24, name: '장영실', grade: 1, classNum: 2, studentPhone: '010-3456-7890', parentPhone: '010-5555-6666', photo: null, status: 'online', reason: '', lastHeartbeat: Date.now() }
];

let academicCalendar = []; let approvalDocs = []; let docIdCounter = 1;

// ==========================================
// 2. 대시보드 및 교직원/시간표 API
// ==========================================
app.post('/api/login', (req, res) => {
    const { id, pw } = req.body;
    const user = staffs.find(u => u.id === id && u.pw === pw);
    if (user) res.json({ success: true, user }); else res.status(401).json({ success: false });
});

app.get('/api/dashboard', (req, res) => {
    const now = Date.now();
    students.forEach(s => { if (!s.reason.includes('✅') && s.reason !== '🚨긴급 재난 해제') s.status = (now - s.lastHeartbeat > 60000) ? 'offline' : 'online'; });
    staffs.forEach(t => { t.isDeviceOnline = (now - t.lastHeartbeat <= 60000); });
    res.json({ students, staffs, timetables, calendar: academicCalendar, approvals: approvalDocs, currentPeriod: currentSchoolPeriod });
});

// 출퇴근 처리
app.post('/api/commute', (req, res) => {
    const { staffId, status } = req.body;
    const staff = staffs.find(s => s.id === staffId);
    if (staff) { staff.commute = status; res.json({ success: true, status }); }
});

// 시간표 저장
app.post('/api/timetable', (req, res) => {
    const { staffId, schedule } = req.body;
    timetables[staffId] = schedule;
    res.json({ success: true });
});

// 현재 교시 강제 설정 (시연용)
app.post('/api/period/set', (req, res) => {
    currentSchoolPeriod = req.body.period;
    res.json({ success: true, period: currentSchoolPeriod });
});

// 교직원 DB 관리
app.post('/api/staff/add', (req, res) => {
    const { id, pw, role, name, grade, classNum, phone } = req.body;
    if (staffs.find(s => s.id === id)) return res.status(400).json({ success: false });
    staffs.push({ id, pw, role, name, grade: Number(grade), classNum: Number(classNum), phone, commute: '미출근', lastHeartbeat: 0 });
    res.json({ success: true });
});

// ==========================================
// 3. 기존 결재/학적 연동 API
// ==========================================
app.post('/api/approvals', (req, res) => {
    const { date, studentId, studentName, type, reason, requesterId, requesterName } = req.body;
    const targetStudent = students.find(s => s.id === studentId);
    const user = staffs.find(u => u.id === requesterId);
    let initialStatus = 'PENDING';
    if (user && (user.role === 'PRINCIPAL' || (user.role === 'GRADE_HEAD' && user.grade === targetStudent.grade) || (user.role === 'HOMEROOM' && user.grade === targetStudent.grade && user.classNum === targetStudent.classNum))) initialStatus = 'APPROVED';
    approvalDocs.push({ id: 'DOC-' + (docIdCounter++).toString().padStart(3, '0'), date, studentId, studentName, grade: targetStudent ? targetStudent.grade : 1, type, reason, requesterId, requesterName, status: initialStatus });
    res.json({ success: true, status: initialStatus });
});
app.post('/api/approvals/process', (req, res) => { const { docId, status } = req.body; const doc = approvalDocs.find(d => d.id === docId); if (doc) doc.status = status; res.json({ success: true }); });
app.post('/api/calendar', (req, res) => { const { date, title, type } = req.body; academicCalendar.push({ id: Date.now().toString(), date, title, type }); res.json({ success: true }); });
app.delete('/api/calendar/:id', (req, res) => { academicCalendar = academicCalendar.filter(c => c.id !== req.params.id); res.json({ success: true }); });
app.post('/api/students/add', (req, res) => { const { id, name, grade, classNum, seat, studentPhone, parentPhone, photo } = req.body; students.push({ id, name, grade: Number(grade), classNum: Number(classNum), seat: Number(seat), studentPhone, parentPhone, photo, status: 'offline', reason: '', lastHeartbeat: 0 }); res.json({ success: true }); });
app.delete('/api/students/:id', (req, res) => { students = students.filter(s => s.id !== req.params.id); res.json({ success: true }); });
app.post('/api/reason', (req, res) => { const { studentId, reason } = req.body; const student = students.find(s => s.id === studentId); if (student) { student.reason = reason; return res.json({ success: true }); } });
app.post('/api/emergency', (req, res) => { students.forEach(s => { s.status = 'offline'; s.reason = '🚨긴급 재난 해제'; }); res.json({ success: true }); });

// ==========================================
// 4. 💡 ETI 심장 엔진 (학생 + 교사 연동 잠금)
// ==========================================
app.post('/api/heartbeat', (req, res) => {
    const { id } = req.body; 
    let command = 'unlock'; // 기본은 해제 상태
    const today = new Date().toISOString().split('T')[0];

    // [로직 A] 이 기기가 '학생'인 경우
    let student = students.find(s => s.id === id); 
    if (student) {
        student.lastHeartbeat = Date.now(); student.status = 'online';

        if (student.reason === '🚨긴급 재난 해제') { command = 'unlock'; } 
        else {
            const todayEvent = academicCalendar.find(c => c.date === today);
            if (todayEvent && todayEvent.type === 'HOLIDAY') { command = 'unlock'; student.reason = `📅 학사일정: ${todayEvent.title}`; } 
            else if (todayEvent && todayEvent.type === 'EXAM') { command = 'lock'; student.reason = `📝 시험 중 철통 잠금`; } 
            else {
                const approvedDoc = approvalDocs.find(d => d.date === today && d.studentId === student.id && d.status === 'APPROVED');
                if (approvedDoc) { command = 'unlock'; student.reason = `✅ 승인완료 (${approvedDoc.type})`; student.status = 'offline'; } 
                else { 
                    // 학생 잠금 판단: 현재 교시에 해당 반 수업이 있는가?
                    if(currentSchoolPeriod === 'NONE') {
                        command = 'unlock'; student.reason = ''; // 쉬는시간
                    } else {
                        // 모든 교사의 시간표를 뒤져서 현재 교시에 이 반 수업이 있는지 확인
                        let isClassRunning = false;
                        for(const tId in timetables) {
                            if(timetables[tId][currentSchoolPeriod] === `${student.grade}-${student.classNum}`) {
                                isClassRunning = true; break;
                            }
                        }
                        if(isClassRunning) { command = 'lock'; student.reason = ''; }
                        else { command = 'unlock'; student.reason = '공강/자습'; }
                    }
                }
            }
        }
        return res.json({ success: true, command });
    }

    // [로직 B] 이 기기가 '교직원(선생님)'인 경우
    let staff = staffs.find(s => s.id === id);
    if(staff) {
        staff.lastHeartbeat = Date.now();
        // 현재 교시에 해당 교사가 수업이 있는지 확인
        if(currentSchoolPeriod !== 'NONE' && timetables[staff.id] && timetables[staff.id][currentSchoolPeriod]) {
            command = 'lock'; // 현재 수업 중이므로 선생님 폰도 잠금!
        } else {
            command = 'unlock'; // 공강, 쉬는시간이므로 해제
        }
        return res.json({ success: true, command });
    }

    res.json({ success: false, message: '등록되지 않은 기기' });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 교사/학생 동기화 ETI 시스템 가동 중 (포트 ${PORT})`));