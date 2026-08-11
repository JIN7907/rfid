const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ====================================================================
// 💾 메모리 데이터베이스 (실제 DB 연결 전 인메모리 저장소)
// ====================================================================

// 1. 학급 및 진도표 (일자/교시별 과목, 범위, 준비물, 과제)
let lessonPlans = [
    { date: "2026-08-11", period: 1, grade: 3, classNum: 1, subject: "국어", scope: "1단원 문학의 이해 p.12~20", supplies: "교재, 공책", homework: "p.21 문제 풀기" },
    { date: "2026-08-11", period: 2, grade: 3, classNum: 2, subject: "수학", scope: "3단원 삼각비의 활용 p.84~92", supplies: "각도기, 삼각자", homework: "익힘책 p.45" }
];

// 2. 학생 데이터 (출석 상태, 잠금 여부, 하트비트, 벌점 등)
let students = [
    { id: 1, schoolId: 101, grade: 3, classNum: 1, studentNum: 1, name: "강감찬", status: "출석(잠금)", demeritPoints: 0, lastHeartbeat: Date.now(), deletionAllowed: false },
    { id: 2, schoolId: 101, grade: 3, classNum: 1, studentNum: 2, name: "김유신", status: "출석(잠금)", demeritPoints: 2, lastHeartbeat: Date.now(), deletionAllowed: false },
    { id: 3, schoolId: 101, grade: 3, classNum: 2, studentNum: 3, name: "홍길동", status: "미출석", demeritPoints: 5, lastHeartbeat: null, deletionAllowed: false }
];

// 3. 앱 삭제/권한 해제 요청 사유서 목록
let deletionRequests = [];

// ====================================================================
// 🔐 [HTTP REST API] 5단계 권한 & 기능별 엔드포인트
// ====================================================================

// 1. 5단계 권한 로그인 API
// Role: SUPER_ADMIN(총괄), PRINCIPAL(교장), GRADE_ADMIN(선도/학년총괄), HOMEROOM(담임), SUBJECT(클래스교사)
app.post('/api/auth/login', (req, res) => {
    const { username, password, role } = req.body;
    
    // 권한 세션 생성
    res.json({
        success: true,
        user: {
            username: username,
            name: `${username} 선생님`,
            role: role || "HOMEROOM",
            assignedGrade: 3,
            assignedClass: 1
        },
        token: "jwt-session-token-example"
    });
});

// 2. [클래스 교사] 현재 시간/교시별 동적 수업 반 학생 목록 조회 (등록/해제 권한 차단)
app.get('/api/teacher/current-lesson', (req, res) => {
    const { grade, classNum } = req.query;
    
    const targetStudents = students.filter(s => s.grade == (grade || 3) && s.classNum == (classNum || 2));
    
    res.json({
        period: 2,
        subject: "수학",
        grade: grade || 3,
        classNum: classNum || 2,
        permissions: {
            canRegister: false, // 학생 신규 등록 불가
            canDeleteApp: false, // 앱 해제 승인 불가
            canDemerit: true     // 벌점 부여만 가능
        },
        students: targetStudents
    });
});

// 3. [선도부 / 학년총괄 / 담임 / 클래스교사] 벌점 부여 API
app.post('/api/admin/demerit', (req, res) => {
    const { studentId, points, reason, teacherName } = req.body;
    
    const student = students.find(s => s.id == studentId);
    if (student) {
        student.demeritPoints += parseInt(points);
        console.log(`🚨 [벌점 부여] ${student.name} 학생 +${points}점 (사유: ${reason}) - 담당: ${teacherName}`);
        
        // 전체 관리자 대시보드로 실시간 방송
        broadcast(JSON.stringify({
            type: "DEMERIT_UPDATED",
            studentId: student.id,
            studentName: student.name,
            totalPoints: student.demeritPoints,
            reason
        }));

        return res.json({ success: true, totalPoints: student.demeritPoints });
    }
    res.status(404).json({ error: "학생을 찾을 수 없습니다." });
});

// 4. [선도부 / 학년총괄] 전교생 엑셀 일괄 등록 API
app.post('/api/admin/batch-register', (req, res) => {
    const { studentList } = req.body; // 엑셀 파싱 데이터 배열
    if (Array.isArray(studentList)) {
        studentList.forEach(st => {
            students.push({
                id: students.length + 1,
                schoolId: st.schoolId || 101,
                grade: st.grade,
                classNum: st.classNum,
                studentNum: st.studentNum,
                name: st.name,
                status: "미출석",
                demeritPoints: 0,
                lastHeartbeat: null,
                deletionAllowed: false
            });
        });
        return res.json({ success: true, registeredCount: studentList.length });
    }
    res.status(400).json({ error: "올바른 학생 리스트 형식이 아닙니다." });
});

// 5. [수업 진도 & 준비물 관리 API] (과목교사/담임 작성 ➔ 학생 앱 및 잠금화면에 표기)
app.get('/api/lesson-plans', (req, res) => {
    const { date, grade, classNum } = req.query;
    const plans = lessonPlans.filter(p => p.grade == grade && p.classNum == classNum);
    res.json({ success: true, plans });
});

app.post('/api/lesson-plans', (req, res) => {
    const { date, period, grade, classNum, subject, scope, supplies, homework } = req.body;
    const newPlan = { date, period, grade, classNum, subject, scope, supplies, homework };
    lessonPlans.push(newPlan);
    
    // 학생 앱으로 진도표 업데이트 신호 전송
    broadcast(JSON.stringify({ type: "LESSON_PLAN_UPDATED", plan: newPlan }));
    res.json({ success: true, message: "수업 진도 및 준비물이 등록되었습니다." });
});

// 6. [학생 앱] 앱 삭제/해제 사유서 제출 API
app.post('/api/student/request-deletion', (req, res) => {
    const { studentId, studentName, reason } = req.body;
    const requestItem = {
        id: deletionRequests.length + 1,
        studentId,
        studentName,
        reason,
        status: "PENDING", // PENDING, APPROVED, REJECTED
        timestamp: new Date()
    };
    deletionRequests.push(requestItem);

    // 담임 및 관리자 PC로 알림 팝업 전송
    broadcast(JSON.stringify({
        type: "DELETION_REQUEST_RECEIVED",
        request: requestItem
    }));

    res.json({ success: true, message: "사유서가 선생님께 제출되었습니다." });
});

// 7. [담임 / 학년총괄 / 학교장] 사유서 승인/거절 처리 API
app.post('/api/admin/approve-deletion', (req, res) => {
    const { requestId, approve } = req.body;
    const reqItem = deletionRequests.find(r => r.id == requestId);
    
    if (reqItem) {
        reqItem.status = approve ? "APPROVED" : "REJECTED";
        
        const student = students.find(s => s.id == reqItem.studentId);
        if (student && approve) {
            student.deletionAllowed = true; // 앱 삭제/하트비트 끊김 경고 예외 처리
        }

        // 해당 학생 폰으로 삭제 권한 부여 신호 전송
        broadcast(JSON.stringify({
            type: "DELETION_PERMIT_RESPONSE",
            studentId: reqItem.studentId,
            approved: approve
        }));

        return res.json({ success: true, status: reqItem.status });
    }
    res.status(404).json({ error: "요청을 찾을 수 없습니다." });
});


// ====================================================================
// ⚡ [WebSocket] 실시간 소켓 통신 & 하트비트 감시
// ====================================================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

function broadcast(message) {
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

wss.on('connection', (ws) => {
    clients.push(ws);
    console.log('🔗 클라이언트 연결됨. 현재 접속자 수:', clients.length);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('📩 수신 메시지:', data);

            // A. 학생 앱 생존 신호(Heartbeat) 수신
            if (data.type === "HEARTBEAT") {
                const student = students.find(s => s.id == data.studentId);
                if (student) {
                    student.lastHeartbeat = Date.now();
                    student.status = "출석(잠금)";
                }
            }

            // B. 긴급 호출 (화장실, 보건실, 선생님 호출)
            if (data.type === "STUDENT_CALL") {
                broadcast(JSON.stringify({
                    type: "ALERT_TEACHER_CALL",
                    studentName: data.studentName,
                    callType: data.callType, // 화장실, 보건실, 호출
                    grade: data.grade,
                    classNum: data.classNum
                }));
            }

            // C. 일반 통신 메시지 전체 방송
            broadcast(JSON.stringify(data));

        } catch (e) {
            // 일반 텍스트 신호 예외 처리
            broadcast(message.toString());
        }
    });

    ws.on('close', () => {
        clients = clients.filter(c => c !== ws);
        console.log('❌ 클라이언트 연결 해제. 남은 접속자 수:', clients.length);
    });
});

// ====================================================================
// 🕵️ [하트비트 감시 스케줄러] 1분마다 앱 무단 삭제/통신 끊김 적발
// ====================================================================
setInterval(() => {
    const NOW = Date.now();
    students.forEach(student => {
        // 출석 상태인데, 승인 없이 2분 이상 하트비트가 끊긴 경우
        if (student.status === "출석(잠금)" && !student.deletionAllowed) {
            if (student.lastHeartbeat && (NOW - student.lastHeartbeat > 120000)) {
                student.status = "🚨 무단삭제/우회 의심";
                console.log(`🚨 [경고] ${student.name} 학생 앱 삭제 또는 통신 끊김 적발!`);

                // 선생님 PC 및 웹 관리자 화면으로 경고 팝업 방송
                broadcast(JSON.stringify({
                    type: "WARNING_APP_TAMPERED",
                    studentId: student.id,
                    studentName: student.name,
                    grade: student.grade,
                    classNum: student.classNum
                }));
            }
        }
    });
}, 60000); // 60초 주기 검사

// 서버 실행
server.listen(PORT, () => {
    console.log(`🚀 학급 관리 시스템 통합 서버가 포트 ${PORT}에서 작동 중입니다.`);
});