require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// In-memory storage for reminders
const reminders = {};

// Send bot message with typing indicator
const sendBotMessage = (text) => {
  io.emit('typing', { sender: 'bot' });

  setTimeout(() => {
    io.emit('receive_message', {
      text,
      sender: 'bot',
      timestamp: new Date().toISOString(),
    });
  }, 1200);
};

// Smarter simpleBotReplies function
const simpleBotReplies = (text, socketId) => {
  const lowered = text.toLowerCase();
  const words = lowered
    .split(/\s+|[,!.?]+/) // split on spaces, commas, dots, exclamation marks
    .filter(Boolean); // remove empty strings

  const triggers = [
    {
      keywords: ['hello', 'hi', 'hey', 'yo', 'greetings', 'sup', 'what\'s up'],
      reply: "Hey there! 👋 How can I help you today?",
    },
    {
      keywords: ['how', 'are', 'you'],
      requireAll: true,
      reply: "I'm doing great! Thanks for asking. How about you?",
    },
    {
      keywords: ['tired', 'exhausted', 'sleepy', 'bored', 'fatigued'],
      reply: "Don't push yourself too hard. 💤 Make sure to get some rest!",
    },
    {
      keywords: ['happy', 'good', 'day', 'great', 'awesome', 'fantastic', 'wonderful', 'cheerful'],
      reply: "That's awesome! 🌞 Keep spreading positivity.",
    },
    {
      keywords: ['sad', 'depressed', 'unhappy', 'down', 'blue'],
      reply: "I'm here for you. Remember, even the darkest nights end in sunrise. 🌅",
    },
    {
      keywords: ['remind', 'me'],
      special: 'reminder',
    },
    {
      keywords: ['joke'],
      reply: [
        "Why don't skeletons fight each other? They don't have the guts! 💀",
        "What do you call fake spaghetti? An impasta! 🍝",
        "Why was the math book sad? It had too many problems. 📖",
      ],
      random: true,
    },
    {
      keywords: ['advice'],
      reply: "Trust yourself. You've survived a lot, and you'll survive whatever is coming. 💬",
    },
    {
      keywords: ['thank'],
      reply: "You're welcome! 😊 I'm always here to help.",
    },
    {
      keywords: ['who', 'are', 'you'],
      requireAll: true,
      reply: "I'm Sylvester 🐾 — your friendly assistant!",
    },
  ];

  for (const trigger of triggers) {
    if (trigger.special === 'reminder') {
      if (lowered.includes('remind me')) {
        const match = lowered.match(/remind me to (.+?) at (\d+:\d+)/i);
        if (match) {
          const task = match[1];
          const time = match[2];

          if (!reminders[socketId]) {
            reminders[socketId] = [];
          }

          reminders[socketId].push({ task, time });
          return sendBotMessage(`Got it! I'll remind you to "${task}" at ${time}. 📝`);
        } else {
          return sendBotMessage(`Please format your reminder like "Remind me to [task] at [HH:MM]". ⏰`);
        }
      }
    }

    if (trigger.requireAll) {
      const allMatch = trigger.keywords.every((word) => words.includes(word));
      if (allMatch) {
        return sendBotMessage(trigger.reply);
      }
    } else {
      const anyMatch = trigger.keywords.some((word) => words.includes(word));
      if (anyMatch) {
        if (trigger.random) {
          const randomReply = trigger.reply[Math.floor(Math.random() * trigger.reply.length)];
          return sendBotMessage(randomReply);
        }
        return sendBotMessage(trigger.reply);
      }
    }
  }
};

// Socket handling
io.on('connection', (socket) => {
  console.log('A user connected: ', socket.id);

  socket.on('send_message', (data) => {
    console.log('Message received:', data);

    io.emit('receive_message', {
      text: data.text,
      sender: data.sender,
      timestamp: new Date().toISOString(),
    });

    simpleBotReplies(data.text, socket.id);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
    delete reminders[socket.id];
  });
});

// Reminder checking every minute
setInterval(() => {
  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  for (const socketId in reminders) {
    reminders[socketId] = reminders[socketId].filter((reminder) => {
      if (reminder.time === currentTime) {
        sendBotMessage(`Reminder: ${reminder.task}`);
        return false;
      }
      return true;
    });
  }
}, 60000);

// Basic Express routes
app.get('/', (req, res) => {
  res.send('Bubble server is running! 🫧');
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = users[0];

    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) return res.status(401).json({ error: 'Invalid username or password' });

    res.json({ success: true, user: { id: user.id, username: user.username, avatar_url: user.avatar_url } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Server listen
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
