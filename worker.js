// FitCircle SmartChat MVP - Cloudflare Worker Backend
// RESTful API for FitCircle platform

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Root endpoint
    if (path === '/' || path === '/api') {
      return jsonResponse({ message: 'FitCircle API is running' }, 200, corsHeaders);
    }

    try {
      // Route handling
      if (path === '/api/login' && method === 'POST') {
        return await handleLogin(request, env.DB, corsHeaders);
      }

      if (path === '/api/admin/overview' && method === 'GET') {
        return await handleAdminOverview(env.DB, corsHeaders);
      }

      if (path === '/api/admin/coaches' && method === 'GET') {
        return await handleGetCoaches(env.DB, corsHeaders);
      }

      if (path === '/api/admin/coaches' && method === 'POST') {
        return await handleCreateCoach(request, env.DB, corsHeaders);
      }

      if (path === '/api/admin/students' && method === 'GET') {
        return await handleGetStudents(env.DB, corsHeaders);
      }

      if (path === '/api/admin/students' && method === 'POST') {
        return await handleCreateStudent(request, env.DB, corsHeaders);
      }

      if (path === '/api/classes' && method === 'GET') {
        return await handleGetClasses(env.DB, corsHeaders);
      }

      if (path === '/api/classes' && method === 'POST') {
        return await handleCreateClass(request, env.DB, corsHeaders);
      }

      // Student payments routes
      const studentPaymentsMatch = path.match(/^\/api\/students\/(\d+)\/payments$/);
      if (studentPaymentsMatch && method === 'GET') {
        const studentId = parseInt(studentPaymentsMatch[1]);
        return await handleGetStudentPayments(studentId, env.DB, corsHeaders);
      }

      if (studentPaymentsMatch && method === 'POST') {
        const studentId = parseInt(studentPaymentsMatch[1]);
        return await handleCreatePayment(studentId, request, env.DB, corsHeaders);
      }

      // Leave requests routes
      if (path === '/api/leave-requests' && method === 'GET') {
        return await handleGetLeaveRequests(url, env.DB, corsHeaders);
      }

      if (path === '/api/leave-requests' && method === 'POST') {
        return await handleCreateLeaveRequest(request, env.DB, corsHeaders);
      }

      const leaveDecisionMatch = path.match(/^\/api\/leave-requests\/(\d+)\/decision$/);
      if (leaveDecisionMatch && method === 'POST') {
        const leaveId = parseInt(leaveDecisionMatch[1]);
        return await handleLeaveDecision(leaveId, request, env.DB, corsHeaders);
      }

      return jsonResponse({ error: 'Not Found' }, 404, corsHeaders);
    } catch (error) {
      console.error('Error:', error);
      return jsonResponse({ error: error.message || 'Internal Server Error' }, 500, corsHeaders);
    }
  },
};

// Helper function for JSON responses
function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// 1. Login API
async function handleLogin(request, db, corsHeaders) {
  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return jsonResponse({ error: 'Email and password are required' }, 400, corsHeaders);
  }

  const result = await db.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();

  if (!result || result.password !== password) {
    return jsonResponse({ error: 'Invalid credentials' }, 401, corsHeaders);
  }

  if (result.role !== 'super_admin' && result.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized role' }, 403, corsHeaders);
  }

  const token = `token-${result.id}-${Date.now()}`;

  return jsonResponse({
    token,
    user: {
      id: result.id,
      email: result.email,
      name: result.name,
      role: result.role,
    },
  }, 200, corsHeaders);
}

// 2. Admin Overview
async function handleAdminOverview(db, corsHeaders) {
  const coachesResult = await db.prepare('SELECT COUNT(*) as count FROM coaches').first();
  const studentsResult = await db.prepare('SELECT COUNT(*) as count FROM students').first();
  const classesResult = await db.prepare('SELECT COUNT(*) as count FROM classes').first();
  const pendingLeavesResult = await db.prepare("SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'").first();
  const totalPaymentsResult = await db.prepare('SELECT SUM(amount) as total FROM payments').first();

  return jsonResponse({
    coaches: coachesResult?.count || 0,
    students: studentsResult?.count || 0,
    classes: classesResult?.count || 0,
    pendingLeaves: pendingLeavesResult?.count || 0,
    totalPayments: totalPaymentsResult?.total || 0,
  }, 200, corsHeaders);
}

// 3.1 Get Coaches
async function handleGetCoaches(db, corsHeaders) {
  const result = await db.prepare('SELECT * FROM coaches ORDER BY created_at DESC').all();
  return jsonResponse(result.results || [], 200, corsHeaders);
}

// 3.2 Create Coach
async function handleCreateCoach(request, db, corsHeaders) {
  const body = await request.json();
  const { name, email, phone, line_id } = body;

  if (!name) {
    return jsonResponse({ error: 'Name is required' }, 400, corsHeaders);
  }

  const result = await db.prepare(
    'INSERT INTO coaches (name, email, phone, line_id, active) VALUES (?, ?, ?, ?, 1)'
  ).bind(name, email || null, phone || null, line_id || null).run();

  return jsonResponse({ id: result.meta.last_row_id }, 201, corsHeaders);
}

// 4.1 Get Students
async function handleGetStudents(db, corsHeaders) {
  const result = await db.prepare('SELECT * FROM students ORDER BY created_at DESC').all();
  return jsonResponse(result.results || [], 200, corsHeaders);
}

// 4.2 Create Student
async function handleCreateStudent(request, db, corsHeaders) {
  const body = await request.json();
  const { name, email, phone, line_id } = body;

  if (!name) {
    return jsonResponse({ error: 'Name is required' }, 400, corsHeaders);
  }

  const result = await db.prepare(
    'INSERT INTO students (name, email, phone, line_id) VALUES (?, ?, ?, ?)'
  ).bind(name, email || null, phone || null, line_id || null).run();

  return jsonResponse({ id: result.meta.last_row_id }, 201, corsHeaders);
}

// 5.1 Get Classes
async function handleGetClasses(db, corsHeaders) {
  const result = await db.prepare(`
    SELECT c.*, co.name as coach_name
    FROM classes c
    LEFT JOIN coaches co ON c.coach_id = co.id
    ORDER BY c.created_at DESC
  `).all();

  const classes = (result.results || []).map(cls => ({
    ...cls,
    rule_no_leave: cls.rule_no_leave === 1,
    rule_allow_delay: cls.rule_allow_delay === 1,
    rule_allow_dropin: cls.rule_allow_dropin === 1,
  }));

  return jsonResponse(classes, 200, corsHeaders);
}

// 5.2 Create Class
async function handleCreateClass(request, db, corsHeaders) {
  const body = await request.json();
  const {
    coach_id,
    name,
    location,
    schedule_text,
    capacity,
    term_price,
    term_classes,
    dropin_price,
    rule_no_leave,
    rule_allow_delay,
    rule_allow_dropin,
  } = body;

  if (!coach_id || !name) {
    return jsonResponse({ error: 'coach_id and name are required' }, 400, corsHeaders);
  }

  const result = await db.prepare(
    `INSERT INTO classes (
      coach_id, name, location, schedule_text, capacity,
      term_price, term_classes, dropin_price,
      rule_no_leave, rule_allow_delay, rule_allow_dropin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    coach_id,
    name,
    location || null,
    schedule_text || null,
    capacity || null,
    term_price || null,
    term_classes || null,
    dropin_price || null,
    rule_no_leave ? 1 : 0,
    rule_allow_delay ? 1 : 0,
    rule_allow_dropin ? 1 : 0,
  ).run();

  return jsonResponse({ id: result.meta.last_row_id }, 201, corsHeaders);
}

// 6.1 Get Student Payments
async function handleGetStudentPayments(studentId, db, corsHeaders) {
  const result = await db.prepare(`
    SELECT p.*, c.name as class_name
    FROM payments p
    LEFT JOIN classes c ON p.class_id = c.id
    WHERE p.student_id = ?
    ORDER BY p.paid_at DESC
  `).bind(studentId).all();

  return jsonResponse(result.results || [], 200, corsHeaders);
}

// 6.2 Create Payment
async function handleCreatePayment(studentId, request, db, corsHeaders) {
  const body = await request.json();
  const { class_id, amount, paid_at, channel, note } = body;

  if (!amount || !paid_at) {
    return jsonResponse({ error: 'amount and paid_at are required' }, 400, corsHeaders);
  }

  const result = await db.prepare(
    'INSERT INTO payments (student_id, class_id, amount, paid_at, channel, note) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    studentId,
    class_id || null,
    amount,
    paid_at,
    channel || null,
    note || null,
  ).run();

  return jsonResponse({ id: result.meta.last_row_id }, 201, corsHeaders);
}

// 7.1 Get Leave Requests
async function handleGetLeaveRequests(url, db, corsHeaders) {
  const status = url.searchParams.get('status');
  let query = `
    SELECT lr.*, s.name as student_name, c.name as class_name
    FROM leave_requests lr
    LEFT JOIN students s ON lr.student_id = s.id
    LEFT JOIN classes c ON lr.class_id = c.id
  `;

  const params = [];
  if (status) {
    query += ' WHERE lr.status = ?';
    params.push(status);
  }

  query += ' ORDER BY lr.created_at DESC';

  const stmt = db.prepare(query);
  const result = status ? await stmt.bind(status).all() : await stmt.all();

  return jsonResponse(result.results || [], 200, corsHeaders);
}

// 7.2 Create Leave Request
async function handleCreateLeaveRequest(request, db, corsHeaders) {
  const body = await request.json();
  const {
    student_id,
    class_id,
    type,
    lesson_date,
    new_lesson_date,
    reason_student,
  } = body;

  if (!student_id || !class_id || !type || !lesson_date) {
    return jsonResponse({ error: 'student_id, class_id, type, and lesson_date are required' }, 400, corsHeaders);
  }

  const result = await db.prepare(
    `INSERT INTO leave_requests (
      student_id, class_id, type, lesson_date, new_lesson_date, reason_student, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(
    student_id,
    class_id,
    type,
    lesson_date,
    new_lesson_date || null,
    reason_student || null,
  ).run();

  return jsonResponse({ id: result.meta.last_row_id }, 201, corsHeaders);
}

// 7.3 Leave Decision
async function handleLeaveDecision(leaveId, request, db, corsHeaders) {
  const body = await request.json();
  const { decision, reason_coach } = body;

  if (!decision || (decision !== 'accept' && decision !== 'reject')) {
    return jsonResponse({ error: 'decision must be "accept" or "reject"' }, 400, corsHeaders);
  }

  const status = decision === 'accept' ? 'accepted' : 'rejected';
  const updatedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);

  await db.prepare(
    'UPDATE leave_requests SET status = ?, reason_coach = ?, updated_at = ? WHERE id = ?'
  ).bind(status, reason_coach || null, updatedAt, leaveId).run();

  return jsonResponse({ ok: true }, 200, corsHeaders);
}

