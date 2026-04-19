import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { Message, User } from "./src/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHATS_FILE = path.join(__dirname, "chats.json");
const USERS_FILE = path.join(__dirname, "users.json");

const notifyTelegram = async (message: string) => {
  const token = process.env.TELEGRAM_BOT_TOKEN || "8677808456:AAHKMWCHT-YGkN7zQWnjfesswul2MDSGOqU";
  const chatId = process.env.TELEGRAM_CHAT_ID || "5112680061";
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
  } catch (e) {
    console.error("Telegram notification failed:", e);
  }
};

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = process.env.PORT || 3000;

  // Initialize data files if they don't exist
  try {
    await fs.access(CHATS_FILE);
  } catch {
    await fs.writeFile(CHATS_FILE, JSON.stringify([]));
  }
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, JSON.stringify({}));
  }

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get("/api/chats", async (req, res) => {
    const data = await fs.readFile(CHATS_FILE, "utf-8");
    res.json(JSON.parse(data));
  });

  app.get("/api/download-chats", async (req, res) => {
    const data = await fs.readFile(CHATS_FILE, "utf-8");
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=chats.json');
    res.send(data);
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("identify", async ({ userId, userName, profilePhoto }) => {
      const usersData = JSON.parse(await fs.readFile(USERS_FILE, "utf-8"));
      const isNew = !usersData[userId];
      const now = Date.now();
      
      usersData[userId] = { 
        ...usersData[userId],
        id: userId, 
        name: userName, 
        online: true, 
        lastSeen: now,
        profilePhoto: profilePhoto || usersData[userId]?.profilePhoto,
        createdAt: usersData[userId]?.createdAt || now
      };
      await fs.writeFile(USERS_FILE, JSON.stringify(usersData));
      
      socket.data.userId = userId;
      socket.join(userId); // Join private room
      io.emit("users_update", Object.values(usersData));

      if (isNew) {
        notifyTelegram(`🆕 <b>New User Registered</b>\nName: ${userName}\nID: ${userId}`);
      } else {
        notifyTelegram(`🟢 <b>User Online</b>\nName: ${userName}`);
      }
    });

    socket.on("update_profile", async ({ userId, name, profilePhoto }) => {
      const usersData = JSON.parse(await fs.readFile(USERS_FILE, "utf-8"));
      if (usersData[userId]) {
        if (name) usersData[userId].name = name;
        if (profilePhoto) usersData[userId].profilePhoto = profilePhoto;
        await fs.writeFile(USERS_FILE, JSON.stringify(usersData));
        io.emit("users_update", Object.values(usersData));
        notifyTelegram(`👤 <b>Profile Updated</b>\nName: ${usersData[userId].name}\nID: ${userId}`);
      }
    });

    socket.on("send_message", async (message: Message) => {
      const chats = JSON.parse(await fs.readFile(CHATS_FILE, "utf-8"));
      chats.push(message);
      await fs.writeFile(CHATS_FILE, JSON.stringify(chats));
      
      if (message.recipientId) {
        // DM: Send only to sender and recipient rooms
        io.to(message.recipientId).to(message.senderId).emit("new_message", message);
        notifyTelegram(`💬 <b>Private Message</b>\nFrom: ${message.senderName}\nText: ${message.text || '[Action]'}`);
      } else {
        // Global
        io.emit("new_message", message);
        notifyTelegram(`🌐 <b>Global Message</b>\nFrom: ${message.senderName}\nText: ${message.text || '[Action]'}`);
      }
    });

    socket.on("delete_message", async (messageId: string) => {
      const chats = JSON.parse(await fs.readFile(CHATS_FILE, "utf-8"));
      const msg = chats.find((m: Message) => m.id === messageId);
      const updatedChats = chats.filter((m: Message) => m.id !== messageId);
      await fs.writeFile(CHATS_FILE, JSON.stringify(updatedChats));
      io.emit("message_deleted", messageId);
      if (msg) notifyTelegram(`🗑 <b>Message Deleted</b>\nBy: ${msg.senderName}\nContent: ${msg.text}`);
    });

    socket.on("toggle_reaction", async ({ messageId, emoji, userId }) => {
      const chats = JSON.parse(await fs.readFile(CHATS_FILE, "utf-8"));
      const msg = chats.find((m: Message) => m.id === messageId);
      if (msg) {
        if (!msg.reactions) msg.reactions = {};
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
        
        const index = msg.reactions[emoji].indexOf(userId);
        if (index > -1) {
          msg.reactions[emoji].splice(index, 1);
          if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
        } else {
          msg.reactions[emoji].push(userId);
        }
        
        await fs.writeFile(CHATS_FILE, JSON.stringify(chats));
        io.emit("reaction_updated", { messageId, reactions: msg.reactions });
        const usersData = JSON.parse(await fs.readFile(USERS_FILE, "utf-8"));
        const reactorName = usersData[userId]?.name || "Someone";
        notifyTelegram(`🎭 <b>Reaction Toggle</b>\nBy: ${reactorName}\nEmoji: ${emoji}\nOn Message: "${msg.text || '[Image]'}"`);
      }
    });

    socket.on("mark_as_read", async ({ messageIds, userId }) => {
      const chats = JSON.parse(await fs.readFile(CHATS_FILE, "utf-8"));
      let updated = false;
      
      messageIds.forEach((id: string) => {
        const msg = chats.find((m: Message) => m.id === id);
        if (msg && msg.senderId !== userId) {
          if (!msg.readBy) msg.readBy = [];
          if (!msg.readBy.includes(userId)) {
            msg.readBy.push(userId);
            updated = true;
          }
        }
      });

      if (updated) {
        await fs.writeFile(CHATS_FILE, JSON.stringify(chats));
        io.emit("messages_read", { messageIds, userId });
      }
    });

    socket.on("delete_account", async (userId: string) => {
      const usersData = JSON.parse(await fs.readFile(USERS_FILE, "utf-8"));
      const userName = usersData[userId]?.name || "Unknown";
      
      delete usersData[userId];
      await fs.writeFile(USERS_FILE, JSON.stringify(usersData));
      
      const chats = JSON.parse(await fs.readFile(CHATS_FILE, "utf-8"));
      const updatedChats = chats.filter((m: Message) => m.senderId !== userId && m.recipientId !== userId);
      await fs.writeFile(CHATS_FILE, JSON.stringify(updatedChats));
      
      io.emit("users_update", Object.values(usersData));
      io.emit("account_deleted", userId);
      
      notifyTelegram(`❗ <b>Account Deleted</b>\nName: ${userName}\nID: ${userId}`);
    });

    socket.on("disconnect", async () => {
      const userId = socket.data.userId;
      if (userId) {
        const usersData = JSON.parse(await fs.readFile(USERS_FILE, "utf-8"));
        if (usersData[userId]) {
          usersData[userId].online = false;
          usersData[userId].lastSeen = Date.now();
          await fs.writeFile(USERS_FILE, JSON.stringify(usersData));
          io.emit("users_update", Object.values(usersData));
        }
      }
      console.log("User disconnected");
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
