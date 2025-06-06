const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

let currentAccessToken = null;
const JWT_SECRET = 'tôi-đã-ở-đây-power5@2024';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

// Cấu hình multer để upload ảnh
const upload = multer({ storage });

// Kết nối SQLite
var db;
try {
  db = new sqlite3.Database('../database/blog.db');
  if (db) {
    console.log("Connected to DB successfully.");
  }
} catch (error) {
  console.log("Cannot connect to DB", error);
}

// Tạo bảng nếu chưa có
db.serialize(() => {
  // Bảng articles (hiện tại)
  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    thumbnail TEXT,
    link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date TEXT
  )`);

  // Bảng editor_articles (mới)
  db.run(`CREATE TABLE IF NOT EXISTS editor_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    thumbnail TEXT,
    link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date TEXT
  )`);
});

// Thông tin admin
const adminUser = {
  username: 'admin@power5.vn',
  passwordHash: '$2b$10$7cNtEvpGPHunoISHQbm3Qeodm.qAybk7JPQkP.LJUyaFYmxr4K.my'
};

// --- API Hiện Tại (Giữ Nguyên) ---

// API thêm bài viết vào bảng articles
app.post('/api/articles/:topic', (req, res) => {
  const topic = req.params.topic;
  const { title, summary, link, thumbnail } = req.body;

  console.log("Dữ liệu nhận từ frontend (articles):", req.body);

  if (!title || !summary || !thumbnail) {
    return res.status(400).json({ message: 'Thiếu tiêu đề hoặc nội dung bài viết.' });
  }

  const currentDate = new Date().toISOString().split('T')[0];
  db.run(
    `INSERT INTO articles (topic, title, summary, link, thumbnail, created_at, date) 
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    [topic, title, summary, link || '', thumbnail, currentDate],
    function (err) {
      if (err) {
        console.error("Lỗi ghi vào database (articles):", err);
        return res.status(500).json({ message: 'Lỗi lưu bài viết vào database.' });
      }
      res.status(201).json({ message: 'Thêm bài viết thành công!', id: this.lastID });
    }
  );
});

// API lấy bài viết theo topic từ bảng articles
app.get('/api/articles/:topic', (req, res) => {
  const { topic } = req.params;
  db.all("SELECT * FROM articles WHERE topic = ? ORDER BY created_at DESC", [topic], (err, rows) => {
    if (err) {
      console.error("LỖI SQL (articles):", err.message);
      return res.status(500).json({ error: `Lỗi SQL: ${err.message}` });
    }
    res.json(rows);
  });
});

// API lấy bài viết theo topic và id
app.get('/api/articles/:topic/:id', (req, res) => {
  const { topic, id } = req.params;
  if (topic === "tintuc") {
    db.get("SELECT * FROM articles WHERE topic = ? AND id = ?", [topic, id], (err, row) => {
      if (err) {
        console.error("Lỗi khi lấy bài viết theo topic và id:", err);
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ message: "Không tìm thấy bài viết!" });
      }
      res.json(row);
    });
  } else {
    db.get("SELECT * FROM editor_articles WHERE topic = ? AND id = ?", [topic, id], (err, row) => {
      if (err) {
        console.error("Lỗi khi lấy bài viết theo topic và id:", err);
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ message: "Không tìm thấy bài viết!" });
      }
      res.json(row);
    });
  }
});

// API lấy tất cả bài viết từ bảng articles
app.get('/api/articles', (req, res) => {
  console.log("Lấy tất cả bài viết (articles)");
  db.all('SELECT * FROM articles ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error("Lỗi khi lấy tất cả bài viết (articles):", err);
      return res.status(500).json({ message: 'Lỗi khi lấy dữ liệu.', error: err.message });
    }
    res.json(rows);
  });
});

// API lấy bài viết theo ID từ bảng articles
app.get('/api/article/:id', (req, res) => {
  const { id } = req.params;
  db.get("SELECT * FROM articles WHERE id = ?", [id], (err, row) => {
    if (err) {
      console.error("Lỗi khi lấy bài viết (articles):", err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: "Không tìm thấy bài viết!" });
    }
    res.json(row);
  });
});

// API sửa bài viết trong bảng articles
app.put('/api/articles/:id', (req, res) => {
  const id = req.params.id;
  const { title, summary, link, thumbnail } = req.body;

  if (!title || !summary || !thumbnail) {
    return res.status(400).json({ message: 'Thiếu dữ liệu để chỉnh sửa.' });
  }

  db.run(
    `UPDATE articles 
     SET title = ?, summary = ?, link = ?, thumbnail = ?, created_at = datetime('now')
     WHERE id = ?`,
    [title, summary, link || '', thumbnail, id],
    function (err) {
      if (err) {
        console.error('Lỗi khi cập nhật bài viết (articles):', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật bài viết.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Không tìm thấy bài viết để cập nhật.' });
      }
      res.json({ message: 'Cập nhật bài viết thành công!' });
    }
  );
});

// API xóa bài viết từ bảng articles
app.delete('/api/articles/:topic/:id', (req, res) => {
  const { topic, id } = req.params;
  db.run('DELETE FROM articles WHERE topic = ? AND id = ?', [topic, id], function (err) {
    if (err) {
      console.error('Lỗi khi xóa bài viết (articles):', err);
      return res.status(500).json({ message: 'Lỗi khi xóa bài viết.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết để xóa.' });
    }
    res.json({ message: 'Xóa bài viết thành công!' });
  });
});

// API đăng nhập admin
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  console.log(`Kiểm tra đăng nhập với tài khoản: ${username}`);

  if (username !== adminUser.username) {
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu.' });
  }

  const isValid = await bcrypt.compare(password, adminUser.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu.' });
  }

  const accessToken = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });

  return res.json({
    message: 'Đăng nhập thành công.',
    accessToken
  });
});

// Middleware kiểm tra token cho các route cần bảo vệ (nếu cần)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Không có token, truy cập bị từ chối.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
    req.user = user; // Lưu thông tin người dùng từ token vào request
    next();
  });
};

// API đăng xuất admin
app.post('/api/admin/logout', authenticateToken, (req, res) => {
  currentAccessToken = null;
  console.log("Admin đã đăng xuất");
  res.json({ message: "Đăng xuất thành công." });
});

// --- API Mới Cho Bảng editor_articles ---

// API lấy tất cả bài viết từ bảng articles
app.get('/api/editor/articles', (req, res) => {
  console.log("Lấy tất cả bài viết (editor-articles)");
  db.all('SELECT * FROM editor_articles ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error("Lỗi khi lấy tất cả bài viết (editor-articles):", err);
      return res.status(500).json({ message: 'Lỗi khi lấy dữ liệu.', error: err.message });
    }
    res.json(rows);
  });
});

// API upload ảnh cho editor
app.post('/api/editor/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Lấy BASE_URL từ môi trường hoặc dùng giá trị mặc định
    const baseUrl = process.env.BASE_URL || 'https://api.gocnhinthitruong.com';

    // Tạo URL đúng
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;

    console.log('Uploaded file:', req.file);
    res.status(200).json({ imageUrl });
  } catch (error) {
    console.error('Lỗi upload ảnh:', error);
    res.status(500).json({ message: 'Lỗi upload ảnh.' });
  }
});

// API thêm bài viết vào bảng editor_articles
app.post('/api/editor/articles/:topic', (req, res) => {
  const topic = req.params.topic;
  const { title, summary, link, thumbnail } = req.body;

  console.log("Dữ liệu nhận từ frontend (editor_articles):", req.body);

  if (!title || !summary || !thumbnail) {
    return res.status(400).json({ message: 'Thiếu tiêu đề hoặc nội dung bài viết.' });
  }

  const currentDate = new Date().toISOString().split('T')[0];
  db.run(
    `INSERT INTO editor_articles (topic, title, summary, link, thumbnail, created_at, date) 
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    [topic, title, summary, link || '', thumbnail, currentDate],
    function (err) {
      if (err) {
        console.error("Lỗi ghi vào database (editor_articles):", err);
        return res.status(500).json({ message: 'Lỗi lưu bài viết vào database.' });
      }
      res.status(201).json({ message: 'Thêm bài viết thành công!', id: this.lastID });
    }
  );
});

// API lấy bài viết theo ID từ bảng articles
app.get('/api/editor/article/:id', (req, res) => {
  const { id } = req.params;
  db.get("SELECT * FROM editor_articles WHERE id = ?", [id], (err, row) => {
    if (err) {
      console.error("Lỗi khi lấy bài viết (articles):", err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ message: "Không tìm thấy bài viết!" });
    }
    res.json(row);
  });
});

// API lấy bài viết theo topic từ bảng editor_articles
app.get('/api/editor/articles/:topic', (req, res) => {
  const { topic } = req.params;
  db.all("SELECT * FROM editor_articles WHERE topic = ? ORDER BY created_at DESC", [topic], (err, rows) => {
    if (err) {
      console.error("LỖI SQL (editor_articles):", err.message);
      return res.status(500).json({ error: `Lỗi SQL: ${err.message}` });
    }
    res.json(rows);
  });
});

// API sửa bài viết trong bảng editor_articles
app.put('/api/editor/articles/:id', (req, res) => {
  const id = req.params.id;
  const { title, summary, link, thumbnail } = req.body;

  if (!title || !summary || !thumbnail) {
    return res.status(400).json({ message: 'Thiếu dữ liệu để chỉnh sửa.' });
  }

  db.run(
    `UPDATE editor_articles 
     SET title = ?, summary = ?, link = ?, thumbnail = ?, created_at = datetime('now')
     WHERE id = ?`,
    [title, summary, link || '', thumbnail, id],
    function (err) {
      if (err) {
        console.error('Lỗi khi cập nhật bài viết (editor_articles):', err);
        return res.status(500).json({ message: 'Lỗi khi cập nhật bài viết.' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Không tìm thấy bài viết để cập nhật.' });
      }
      res.json({ message: 'Cập nhật bài viết thành công!' });
    }
  );
});

// API xóa bài viết từ bảng editor_articles
app.delete('/api/editor/articles/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM editor_articles WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('Lỗi khi xóa bài viết (editor_articles):', err);
      return res.status(500).json({ message: 'Lỗi khi xóa bài viết.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết để xóa.' });
    }
    res.json({ message: 'Xóa bài viết thành công!' });
  });
});

// Khởi động server
app.listen(PORT, () => console.log(`Server đang chạy tại http://localhost:${PORT}`));