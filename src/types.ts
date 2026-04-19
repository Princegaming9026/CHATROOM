export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  type: 'text' | 'image';
  imageUrl?: string;
  seen?: boolean;
  recipientId?: string; // If undefined, it's a global message
  reactions?: { [emoji: string]: string[] }; // emoji -> list of userIds
  readBy?: string[]; // list of userIds who have read this
}

export interface User {
  id: string;
  name: string;
  online: boolean;
  lastSeen: number;
  profilePhoto?: string;
  createdAt: number;
}
