const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');
const db = require('./db');
const bcrypt = require('bcryptjs');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'your_mysql_username',
  password: 'your_mysql_password',
  database: 'bubble',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Store reminders in memory (later you can upgrade to database if needed)
const reminders = {};

const sendBotMessage = (text) => {
  const now = new Date().toISOString();
  io.emit('receive_message', { text, sender: 'bot', timestamp: now });
};

const simpleBotReplies = (text, socketId) => {
  const lowered = text.toLowerCase();
  const now = new Date().toISOString();

  if (lowered.includes('hello') || lowered.includes('hi') || lowered.includes('hey')) {
    sendBotMessage(`Hey there! 👋 How can I help you today?`);
  }

  if (lowered.includes('how are you')) {
    sendBotMessage(`I'm doing great! Thanks for asking. How about you?`);
  }

  if (lowered.includes('tired') || lowered.includes('exhausted') || lowered.includes('sleepy')) {
    sendBotMessage(`Don't push yourself too hard. 💤 Make sure to get some rest!`);
  }

  if (lowered.includes('happy') || lowered.includes('good day')) {
    sendBotMessage(`That's awesome! 🌞 Keep spreading positivity.`);
  }

  if (lowered.includes('sad') || lowered.includes('depressed') || lowered.includes('unhappy')) {
    sendBotMessage(`I'm here for you. Remember, even the darkest nights end in sunrise. 🌅`);
  }

  if (lowered.includes('remind me')) {
    const reminderMatch = text.match(/remind me to (.+?) at (\d+:\d+)/i);
    if (reminderMatch) {
      const task = reminderMatch[1];
      const time = reminderMatch[2];

      if (!reminders[socketId]) {
        reminders[socketId] = [];
      }

      reminders[socketId].push({ task, time });
      sendBotMessage(`Got it! I'll remind you to "${task}" at ${time}. 📝`);
    } else {
      sendBotMessage(`Please format your reminder like "Remind me to [task] at [HH:MM]". ⏰`);
    }
  }

  if (lowered.includes('joke')) {
    const jokes = [
      "Why don't skeletons fight each other? They don't have the guts! 💀",
      "What do you call fake spaghetti? An impasta! 🍝",
      "Why was the math book sad? It had too many problems. 📖",
    ];
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    sendBotMessage(joke);
  }

  if (lowered.includes('advice')) {
    sendBotMessage(`Trust yourself. You've survived a lot, and you'll survive whatever is coming. 💬`);
  }

  if (lowered.includes('thank')) {
    sendBotMessage(`You're welcome! 😊 I'm always here to help.`);
  }

  if (lowered.includes('who are you')) {
    sendBotMessage(`I'm Sylvester 🐾 — your friendly assistant!`);
  }

};

io.on('connection', (socket) => {
  console.log('A user connected: ', socket.id);

  socket.on('send_message', (data) => {
    console.log('Message received:', data);

    // Always echo back the user message
    io.emit('receive_message', { text: data.text, sender: 'user', timestamp: new Date().toISOString() });

    // Bot logic based on the message content
    simpleBotReplies(data.text, socket.id);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    delete reminders[socket.id];
  });
});

// Scheduled task to check for reminders (simple approach)
setInterval(() => {
  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  for (const socketId in reminders) {
    reminders[socketId] = reminders[socketId].filter((reminder) => {
      if (reminder.time === currentTime) {
        sendBotMessage(`Reminder: ${reminder.task}`);
        return false; // Remove after sending
      }
      return true; // Keep it
    });
  }
}, 60000); // check every 1 min

app.get('/', (req, res) => {
  res.send('Bubble server is running! 🫧');
});

// Register a new user
app.post('/register', express.json(), async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const [existingUser] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);

    res.json({ success: true, message: 'User registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login a user
app.post('/login', express.json(), async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = users[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // For now, just send basic success (later you can attach sessions)
    res.json({ success: true, user: { id: user.id, username: user.username, avatar_url: user.avatar_url } });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
