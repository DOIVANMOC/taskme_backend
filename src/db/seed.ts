import bcrypt from 'bcryptjs';
import { query, queryOne, execute } from './database.js';

export async function seedDatabase(): Promise<void> {
  const existingClassrooms = query('SELECT COUNT(*) as count FROM classrooms');
  if (existingClassrooms[0]?.count > 0) {
    return; // Already seeded
  }

  console.log('Seeding database with realistic initial education data...');

  // Clear any partial data to ensure clean referential integrity
  execute('DELETE FROM notifications');
  execute('DELETE FROM task_completions');
  execute('DELETE FROM tasks');
  execute('DELETE FROM classroom_members');
  execute('DELETE FROM classrooms');
  execute('DELETE FROM users');

  const teacherHash = await bcrypt.hash('teacher123', 10);
  const studentHash = await bcrypt.hash('student123', 10);
  const now = new Date().toISOString();

  // 1. Users
  const teacherId = execute(
    `INSERT INTO users (name, email, username, password_hash, avatar, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'Thầy Nguyễn Văn An',
      'teacher@taskme.edu.vn',
      'teacher_an',
      teacherHash,
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      'ROOM_OWNER',
      now
    ]
  ).lastInsertRowid;

  const student1Id = execute(
    `INSERT INTO users (name, email, username, password_hash, avatar, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'Trần Bảo Nam',
      'student@taskme.edu.vn',
      'baonam',
      studentHash,
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
      'STUDENT',
      now
    ]
  ).lastInsertRowid;

  const student2Id = execute(
    `INSERT INTO users (name, email, username, password_hash, avatar, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'Lê Thu Trang',
      'trang@taskme.edu.vn',
      'thutrang',
      studentHash,
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      'STUDENT',
      now
    ]
  ).lastInsertRowid;

  const student3Id = execute(
    `INSERT INTO users (name, email, username, password_hash, avatar, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'Phạm Hoàng Đức',
      'duc@taskme.edu.vn',
      'hoangduc',
      studentHash,
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      'STUDENT',
      now
    ]
  ).lastInsertRowid;

  // 2. Classrooms
  const class1Id = execute(
    `INSERT INTO classrooms (name, subject, description, image, join_code, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'Lớp 10A1',
      'Toán học',
      'Phòng học chuyên đề Đại số & Hình học không gian lớp 10, THPT Chu Văn An.',
      'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
      '10A1-X7K92',
      teacherId,
      now
    ]
  ).lastInsertRowid;

  const class2Id = execute(
    `INSERT INTO classrooms (name, subject, description, image, join_code, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'Lớp 10A2',
      'Vật lý',
      'Chương trình Vật lý đại cương: Động học chất điểm, Các định luật Newton và Năng lượng.',
      'https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=600&auto=format&fit=crop&q=80',
      '10A2-P4M81',
      teacherId,
      now
    ]
  ).lastInsertRowid;

  // 3. Classroom Members (Teacher + Students)
  execute(`INSERT OR IGNORE INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)`, [class1Id, teacherId, now]);
  execute(`INSERT OR IGNORE INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)`, [class1Id, student1Id, now]);
  execute(`INSERT OR IGNORE INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)`, [class1Id, student2Id, now]);
  execute(`INSERT OR IGNORE INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)`, [class1Id, student3Id, now]);

  execute(`INSERT OR IGNORE INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)`, [class2Id, teacherId, now]);
  execute(`INSERT OR IGNORE INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)`, [class2Id, student1Id, now]);
  execute(`INSERT OR IGNORE INTO classroom_members (classroom_id, user_id, joined_at) VALUES (?, ?, ?)`, [class2Id, student2Id, now]);

  // 4. Tasks
  // Deadline 5 days from now
  const task1Deadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const task1Id = execute(
    `INSERT INTO tasks (classroom_id, creator_id, title, description, deadline, attachment_name, attachment_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      class1Id,
      teacherId,
      'Bài tập Toán – Hàm số bậc hai và Đồ thị parabol',
      'Học sinh hoàn thành 15 câu trắc nghiệm và 3 câu tự luận dạng lập bảng biến thiên và vẽ đồ thị hàm số bậc hai trong tài liệu đính kèm.',
      task1Deadline,
      'De_on_tap_Ham_so_bac_hai.pdf',
      '/uploads/sample_math.pdf',
      now
    ]
  ).lastInsertRowid;

  // Deadline 2 days from now (due soon)
  const task2Deadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const task2Id = execute(
    `INSERT INTO tasks (classroom_id, creator_id, title, description, deadline, attachment_name, attachment_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      class2Id,
      teacherId,
      'Khảo sát chuyển động biến đổi đều và Đồ thị vận tốc',
      'Đọc trước bài 3 SGK Vật lý 10 và làm các bài tập định luật vận tốc theo thời gian v = v0 + at.',
      task2Deadline,
      'Bai_tap_Dong_hoc_lop_10.docx',
      '/uploads/sample_physics.docx',
      now
    ]
  ).lastInsertRowid;

  // 5. Task Completions (Student 2 completed task 1, Student 1 has not completed yet)
  execute(
    `INSERT INTO task_completions (task_id, user_id, completed, completed_at) VALUES (?, ?, 1, ?)`,
    [task1Id, student2Id, now]
  );

  // 6. Notifications for student1
  execute(
    `INSERT INTO notifications (user_id, task_id, classroom_id, type, title, message, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      student1Id,
      task1Id,
      class1Id,
      'TASK_CREATED',
      'Nhiệm vụ mới',
      'Lớp 10A1 vừa đăng: "Bài tập Toán – Hàm số bậc hai và Đồ thị parabol"',
      now
    ]
  );

  execute(
    `INSERT INTO notifications (user_id, task_id, classroom_id, type, title, message, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      student1Id,
      task2Id,
      class2Id,
      'TASK_CREATED',
      'Nhiệm vụ mới',
      'Lớp 10A2 vừa đăng: "Khảo sát chuyển động biến đổi đều và Đồ thị vận tốc"',
      now
    ]
  );

  execute(
    `INSERT INTO notifications (user_id, task_id, classroom_id, type, title, message, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      student1Id,
      null,
      class1Id,
      'CLASSROOM_JOINED',
      'Phòng học',
      'Bạn đã tham gia phòng Lớp 10A1 thành công.',
      now
    ]
  );

  console.log('Database seeded successfully!');
}
