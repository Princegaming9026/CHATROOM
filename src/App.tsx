/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lock,
  MessageSquare,
  ShieldCheck,
  Send, 
  Image as ImageIcon, 
  Trash2, 
  UserPlus, 
  Circle, 
  X,
  PlusCircle,
  Hash,
  Link,
  Check,
  CheckCheck,
  Menu,
  Clock,
  Smile,
  LogOut,
  Camera,
  User as UserIcon
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Message, User } from './types';

// Premium Glassmorphism Theme classes
const glassEffect = "backdrop-blur-xl bg-white/70 border border-white/20 shadow-2xl";
const glassDark = "backdrop-blur-xl bg-gray-900/80 border border-gray-800 shadow-2xl";

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; profilePhoto?: string; createdAt?: number } | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSettingName, setIsSettingName] = useState(false);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [tempName, setTempName] = useState('');
  const [showInviteToast, setShowInviteToast] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null); // null means Global Chat
  const [unreadCounts, setUnreadCounts] = useState<{ [id: string]: number }>({});
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedPeerIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedPeerIdRef.current = selectedPeerId;
    // Clear unread count for selected peer
    if (selectedPeerId === null) {
      setUnreadCounts(prev => ({ ...prev, global: 0 }));
    } else {
      setUnreadCounts(prev => ({ ...prev, [selectedPeerId]: 0 }));
    }
  }, [selectedPeerId]);

  // Initialize Socket and User
  useEffect(() => {
    const s = io();
    setSocket(s);

    const storedId = localStorage.getItem('luxchat_user_id') || uuidv4();
    const storedName = localStorage.getItem('luxchat_user_name');
    
    localStorage.setItem('luxchat_user_id', storedId);
    
    if (!storedName) {
      setIsSettingName(true);
    } else {
      const storedPhoto = localStorage.getItem('luxchat_user_photo') || undefined;
      const verified = sessionStorage.getItem('luxchat_pin_verified') === 'true';
      setIsPinVerified(verified);
      
      const user = { id: storedId, name: storedName, profilePhoto: storedPhoto };
      setCurrentUser(user);
      s.emit('identify', { userId: user.id, userName: user.name, profilePhoto: user.profilePhoto });
    }

    s.on('users_update', (updatedUsers: User[]) => {
      setUsers(updatedUsers);
      // Update current user's createdAt if it was just received
      const storedId = localStorage.getItem('luxchat_user_id');
      const me = updatedUsers.find(u => u.id === storedId);
      if (me) {
        setCurrentUser(prev => prev ? { ...prev, createdAt: me.createdAt } : null);
      }
    });

    s.on('account_deleted', (id: string) => {
      setUsers(prev => prev.filter(u => u.id !== id));
      setMessages(prev => prev.filter(m => m.senderId !== id && m.recipientId !== id));
      if (id === localStorage.getItem('luxchat_user_id')) {
        handleLogout();
      }
    });

    return () => {
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref && !localStorage.getItem('luxchat_user_name')) {
      setTempName(ref);
    }
  }, []);

  // Mark as read when messages or room changes
  useEffect(() => {
    if (!currentUser || !socket) return;
    
    const unreadIds = messages
      .filter(m => {
        // Filter based on current room
        const inCurrentRoom = selectedPeerId === null 
          ? !m.recipientId 
          : (m.senderId === selectedPeerId && m.recipientId === currentUser.id);
        
        return inCurrentRoom && m.senderId !== currentUser.id && (!m.readBy || !m.readBy.includes(currentUser.id));
      })
      .map(m => m.id);

    if (unreadIds.length > 0) {
      socket.emit('mark_as_read', { messageIds: unreadIds, userId: currentUser.id });
    }
  }, [messages, selectedPeerId, currentUser, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    
    // Load initial chats
    fetch('/api/chats')
      .then(res => res.json())
      .then(data => setMessages(data));

    const handleNewMessage = (msg: Message) => {
      setMessages(prev => [...prev, msg]);
      const activePeer = selectedPeerIdRef.current;
      const isGlobal = !msg.recipientId;
      if (msg.senderId !== localStorage.getItem('luxchat_user_id')) {
        if (isGlobal) {
          if (activePeer !== null) {
            setUnreadCounts(prev => ({ ...prev, global: (prev.global || 0) + 1 }));
          }
        } else if (msg.senderId !== activePeer) {
          setUnreadCounts(prev => ({ ...prev, [msg.senderId]: (prev[msg.senderId] || 0) + 1 }));
        }
      }
    };

    const handleReaction = ({ messageId, reactions }: { messageId: string, reactions: any }) => {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
    };

    const handleRead = ({ messageIds, userId }: { messageIds: string[], userId: string }) => {
      setMessages(prev => prev.map(m => messageIds.includes(m.id) ? { 
        ...m, 
        readBy: m.readBy ? [...new Set([...m.readBy, userId])] : [userId] 
      } : m));
    };

    const handleDelete = (id: string) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    };

    socket.on('new_message', handleNewMessage);
    socket.on('reaction_updated', handleReaction);
    socket.on('messages_read', handleRead);
    socket.on('message_deleted', handleDelete);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('reaction_updated', handleReaction);
      socket.off('messages_read', handleRead);
      socket.off('message_deleted', handleDelete);
    };
  }, [socket]);

  const handleSetName = () => {
    if (tempName.trim()) {
      const storedId = localStorage.getItem('luxchat_user_id')!;
      const storedPhoto = localStorage.getItem('luxchat_user_photo') || undefined;
      localStorage.setItem('luxchat_user_name', tempName.trim());
      const user = { id: storedId, name: tempName.trim(), profilePhoto: storedPhoto };
      setCurrentUser(user);
      setIsSettingName(false);
      socket?.emit('identify', { userId: user.id, userName: user.name, profilePhoto: user.profilePhoto });
    }
  };

  const handleVerifyPin = () => {
    if (pinInput === '7658') {
      setIsPinVerified(true);
      sessionStorage.setItem('luxchat_pin_verified', 'true');
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 2000);
      setPinInput('');
    }
  };

  const filteredMessages = messages.filter(msg => {
    const isGlobal = !msg.recipientId;
    if (selectedPeerId === null) {
      if (!isGlobal) return false;
      // Filter Global messages by join date: Users can only see messages sent after they joined
      return !currentUser?.createdAt || msg.timestamp >= currentUser.createdAt;
    }
    return (msg.senderId === currentUser?.id && msg.recipientId === selectedPeerId) || 
           (msg.senderId === selectedPeerId && msg.recipientId === currentUser?.id);
  });

  const handleUpdateProfilePhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (currentUser && socket) {
        localStorage.setItem('luxchat_user_photo', dataUrl);
        setCurrentUser({ ...currentUser, profilePhoto: dataUrl });
        socket.emit('update_profile', { userId: currentUser.id, profilePhoto: dataUrl });
      }
    };
    reader.readAsDataURL(file);
  };

  const sendMessage = (text?: string, imageUrl?: string) => {
    if ((text?.trim() || imageUrl) && currentUser && socket) {
      const message: Message = {
        id: uuidv4(),
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: text || '',
        timestamp: Date.now(),
        type: imageUrl ? 'image' : 'text',
        imageUrl,
        recipientId: selectedPeerId || undefined,
      };
      socket.emit('send_message', message);
      setInputText('');
    }
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    socket?.emit('toggle_reaction', { messageId, emoji, userId: currentUser?.id });
  };

  const deleteMessage = (id: string) => {
    socket?.emit('delete_message', id);
  };

  const handleLogout = () => {
    localStorage.removeItem('luxchat_user_name');
    localStorage.removeItem('luxchat_user_id');
    localStorage.removeItem('luxchat_user_photo');
    window.location.reload();
  };

  const deleteAccount = () => {
    if (currentUser && socket && confirm("Are you sure you want to delete your account? This will remove all your messages and data forever.")) {
      socket.emit('delete_account', currentUser.id);
      handleLogout();
    }
  };

  const inviteUser = () => {
    const baseUrl = window.location.origin;
    const inviteUrl = `${baseUrl}?ref=${encodeURIComponent(currentUser?.name || '')}`;
    navigator.clipboard.writeText(inviteUrl);
    setShowInviteToast(true);
    setTimeout(() => setShowInviteToast(false), 2000);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        sendMessage(undefined, reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  }, [currentUser, socket]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop: onDrop as any, 
    accept: { 'image/*': [] },
    noClick: true 
  } as any);

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] overflow-hidden font-sans text-gray-900" {...getRootProps()}>
      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative w-full max-w-md overflow-hidden rounded-[2.5rem] shadow-2xl ${glassDark} text-white`}
            >
              <div className="relative h-32 bg-gradient-to-br from-blue-600 to-purple-600">
                <button 
                  onClick={() => setIsProfileOpen(false)}
                  className="absolute top-6 right-6 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="px-8 pb-8 -mt-12 flex flex-col items-center text-center">
                <div className="relative group/avatar">
                  <div className="w-24 h-24 rounded-[2rem] bg-white p-1 shadow-2xl mb-4 overflow-hidden">
                    {currentUser?.profilePhoto ? (
                      <img src={currentUser.profilePhoto} alt="Profile" className="w-full h-full object-cover rounded-[1.8rem]" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full rounded-[1.8rem] bg-blue-600 flex items-center justify-center text-white text-4xl font-black">
                        {currentUser?.name[0]}
                      </div>
                    )}
                  </div>
                  <label className="absolute bottom-4 right-0 w-8 h-8 bg-blue-600 rounded-xl border-2 border-white flex items-center justify-center text-white cursor-pointer hover:scale-110 transition-transform shadow-lg">
                    <Camera size={14} />
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => e.target.files?.[0] && handleUpdateProfilePhoto(e.target.files[0])}
                    />
                  </label>
                </div>
                
                <h3 className="text-2xl font-black tracking-tight">{currentUser?.name}</h3>
                <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mt-1">Premium Member</p>
                
                <div className="w-full mt-8 p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                  <div className="flex items-center justify-between text-left">
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">User ID</p>
                      <p className="font-mono text-sm opacity-80">{currentUser?.id.slice(0, 16)}...</p>
                    </div>
                    <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                      <UserIcon size={18} />
                    </div>
                  </div>
                </div>

                <div className="w-full grid grid-cols-2 gap-3 mt-8">
                  <button 
                    onClick={handleLogout}
                    className="flex items-center justify-center gap-2 py-4 bg-white/10 hover:bg-white/20 transition-all rounded-2xl font-bold text-sm"
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
                  <button 
                    onClick={deleteAccount}
                    className="flex items-center justify-center gap-2 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-all rounded-2xl font-bold text-sm"
                  >
                    <Trash2 size={18} />
                    Delete Account
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <input {...getInputProps()} />
      
      {/* Mobile Menu Backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500 rounded-full blur-[120px]" />
      </div>

      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -250 }}
        animate={{ x: isMobileMenuOpen || window.innerWidth >= 768 ? 0 : -300 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`fixed md:relative w-72 h-full ${glassEffect} z-40 flex flex-col`}
      >
        <div className="p-6 border-b border-white/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
              <Hash size={18} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">LuxChat</h1>
          </div>
          <button 
            onClick={inviteUser}
            className="p-2 hover:bg-black/5 rounded-full transition-colors text-blue-600 relative"
            title="Invite User"
          >
            <UserPlus size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest px-2">Conversations</div>
          <div className="flex flex-col gap-1">
            {/* Global Chat Item */}
            <motion.div
              layout
              onClick={() => { setSelectedPeerId(null); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all ${selectedPeerId === null ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-white/50'}`}
            >
              <div className="relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedPeerId === null ? 'bg-white/20' : 'bg-blue-100 text-blue-600'}`}>
                  <Hash size={18} />
                </div>
                {unreadCounts.global > 0 && selectedPeerId !== null && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                    {unreadCounts.global}
                  </div>
                )}
              </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-sm">All Members Group</div>
                  <div className={`text-[10px] uppercase tracking-wide ${selectedPeerId === null ? 'text-white/70' : 'text-gray-400'}`}>Members Only</div>
                </div>
              </motion.div>

            <div className="h-px bg-white/40 my-2 mx-2" />
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">Direct Messages</div>

            {users.filter(u => u.id !== currentUser?.id).map(user => (
              <motion.div 
                key={user.id}
                layout
                onClick={() => { setSelectedPeerId(user.id); setIsMobileMenuOpen(false); }}
                className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all ${selectedPeerId === user.id ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-white/50'}`}
              >
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full ${user.online ? 'bg-gradient-to-br from-blue-100 to-blue-200' : 'bg-gradient-to-br from-gray-100 to-gray-200'} flex items-center justify-center overflow-hidden`}>
                    {user.profilePhoto ? (
                      <img src={user.profilePhoto} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon size={18} className={user.online ? 'text-blue-600' : 'text-gray-400'} />
                    )}
                  </div>
                  {user.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                  )}
                  {unreadCounts[user.id] > 0 && selectedPeerId !== user.id && (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                      {unreadCounts[user.id]}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-sm">{user.name}</div>
                  <div className={`text-[10px] uppercase tracking-wide flex items-center gap-1 ${selectedPeerId === user.id ? 'text-white/70' : 'text-gray-400'}`}>
                    {user.online ? (
                      <>
                        <Circle size={8} className="fill-green-500 text-green-500" /> 
                        <span>Online</span>
                      </>
                    ) : (
                      <>
                        <Clock size={8} />
                        <span>Seen {new Date(user.lastSeen).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {currentUser && (
          <div 
            onClick={() => setIsProfileOpen(true)}
            className="p-6 border-t border-white/40 bg-white/10 hover:bg-white/20 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-110 transition-transform overflow-hidden">
                {currentUser.profilePhoto ? (
                  <img src={currentUser.profilePhoto} alt="P" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  currentUser.name[0]
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{currentUser.name}</div>
                <div className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">View Profile</div>
              </div>
            </div>
          </div>
        )}
      </motion.aside>

      {/* Main Chat Area */}
      <main className="flex-1 relative flex flex-col h-full z-10">
        {isDragActive && (
          <div className="absolute inset-0 z-50 bg-blue-600/10 backdrop-blur-sm flex items-center justify-center">
            <div className={`p-12 ${glassEffect} rounded-3xl flex flex-col items-center gap-4`}>
              <PlusCircle size={48} className="text-blue-600 animate-pulse" />
              <p className="text-xl font-bold">Drop photos to send</p>
            </div>
          </div>
        )}

        {/* Top bar (mobile) */}
        <div className="md:hidden p-4 flex items-center justify-between border-b bg-white/50 backdrop-blur-md">
           <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 hover:bg-black/5 rounded-full"
            >
              <Menu size={20} />
            </button>
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
              <Hash size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">LuxChat</h1>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                {selectedPeerId ? `DM: ${users.find(u => u.id === selectedPeerId)?.name}` : 'All Members Group'}
              </div>
            </div>
          </div>
          <button onClick={inviteUser} className="p-2 text-blue-600"><UserPlus size={20} /></button>
        </div>

        {/* Desktop Header Overlay */}
        <div className="hidden md:flex p-6 border-b bg-white/30 backdrop-blur-md items-center justify-between z-20">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${selectedPeerId ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
              {selectedPeerId ? <UserIcon size={24} /> : <Hash size={24} />}
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">
                {selectedPeerId ? users.find(u => u.id === selectedPeerId)?.name : 'All Members Group'}
              </h2>
              <p className="text-xs text-blue-400 font-bold uppercase tracking-widest flex items-center gap-2">
                {selectedPeerId ? (
                  users.find(u => u.id === selectedPeerId)?.online ? (
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Active Now</span>
                  ) : (
                    <span className="opacity-60 italic whitespace-nowrap overflow-hidden text-ellipsis">Last Seen: {new Date(users.find(u => u.id === selectedPeerId)?.lastSeen || 0).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  )
                ) : (
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> {users.filter(u => u.online).length} Members Online</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scrollbar-hide">
          <AnimatePresence initial={false}>
            {filteredMessages.map((msg, index, filteredArr) => {
              const isMine = msg.senderId === currentUser?.id;
              const nextMsg = filteredArr[index + 1];
              const isSameSenderAsNext = nextMsg?.senderId === msg.senderId;

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <div className={`flex items-end gap-2 max-w-[85%] md:max-w-[70%] ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                    {!isMine && !isSameSenderAsNext && (
                       <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-500 mb-1 overflow-hidden">
                          {users.find(u => u.id === msg.senderId)?.profilePhoto ? (
                            <img src={users.find(u => u.id === msg.senderId)?.profilePhoto} alt="P" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            msg.senderName[0]
                          )}
                       </div>
                    )}
                    {isMine && !isSameSenderAsNext && <div className="w-8" />}
                    
                    <div className="group relative">
                      {!isMine && !isSameSenderAsNext && (
                        <div className="text-[10px] font-bold text-gray-400 ml-3 mb-1 uppercase tracking-wider">{msg.senderName}</div>
                      )}
                      
                      <div className={`
                        relative px-4 py-3 rounded-3xl text-sm leading-relaxed shadow-sm
                        ${isMine 
                          ? 'bg-blue-600 text-white rounded-br-lg' 
                          : 'bg-white border border-gray-100 rounded-bl-lg text-gray-800'
                        }
                      `}>
                        {msg.type === 'text' ? (
                          <p>{msg.text}</p>
                        ) : (
                          <div className="space-y-2">
                            <img 
                              src={msg.imageUrl} 
                              alt="Shared photo" 
                              className="rounded-xl max-h-60 w-auto object-cover border border-black/5" 
                              referrerPolicy="no-referrer"
                            />
                            {msg.text && <p className="mt-2 opacity-90">{msg.text}</p>}
                          </div>
                        )}
                        
                        {/* Reactions Display */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(msg.reactions).map(([emoji, uIds]) => {
                              const userIds = uIds as string[];
                              const reactedByMe = userIds.includes(currentUser?.id || '');
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(msg.id, emoji)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 border transition-all ${reactedByMe ? 'bg-blue-100 border-blue-300 text-blue-600' : 'bg-white/50 border-gray-100 text-gray-400'}`}
                                >
                                  <span>{emoji}</span>
                                  <span className="font-bold">{userIds.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className={`text-[9px] mt-1 opacity-50 flex items-center gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isMine && (
                            <CheckCheck size={10} className={msg.readBy && msg.readBy.length > 0 ? 'text-red-500' : (users.filter(u => u.online && u.id !== currentUser?.id).length > 0 ? 'text-blue-300' : '')} />
                          )}
                        </div>

                        {/* Delete & React Overlays */}
                        <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMine ? '-left-20' : '-right-20 flex-row-reverse'}`}>
                          {isMine && (
                            <button 
                              onClick={() => deleteMessage(msg.id)}
                              className="p-2 hover:text-red-500"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <div className="relative group/emojis">
                            <button className="p-2 hover:text-blue-600"><Smile size={16} /></button>
                            <div className={`absolute bottom-full mb-2 bg-white rounded-full shadow-xl border p-1 hidden group-hover/emojis:flex gap-1 animate-in fade-in slide-in-from-bottom-2 ${isMine ? 'left-0' : 'right-0'}`}>
                              {['❤️', '👍', '🔥', '😂', '😮', '😢'].map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction(msg.id, emoji)}
                                  className="w-8 h-8 hover:bg-gray-100 rounded-full flex items-center justify-center text-sm transition-transform active:scale-125"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-8 bg-gradient-to-t from-[#f8f9fa] to-transparent">
          <div className={`max-w-4xl mx-auto flex items-end gap-3 p-3 ${glassEffect} rounded-[2.5rem]`}>
            <button 
              onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
              className="p-3 bg-white hover:bg-gray-50 rounded-full text-blue-600 transition-all active:scale-95 shadow-sm"
            >
              <ImageIcon size={20} />
            </button>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(inputText);
                }
              }}
              placeholder="What's on your mind?..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3 px-2 resize-none max-h-32 min-h-[44px]"
              rows={1}
            />
            <button
              onClick={() => sendMessage(inputText)}
              disabled={!inputText.trim()}
              className={`p-3 rounded-full transition-all active:scale-90 shadow-lg ${inputText.trim() ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}
            >
              <Send size={20} />
            </button>
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-4 uppercase tracking-[0.2em]">Press Enter to send • Drag and drop images to share</p>
        </div>
      </main>

      {/* Auth Overlay */}
      <AnimatePresence>
        {isSettingName && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] bg-gray-900/40 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={`w-full max-w-md p-8 ${glassEffect} rounded-[3rem] shadow-3xl text-center`}
            >
              <div className="w-20 h-20 bg-blue-600 rounded-[2.5rem] mx-auto mb-6 flex items-center justify-center text-white shadow-2xl">
                <UserIcon size={40} />
              </div>
              <h2 className="text-3xl font-black mb-2 tracking-tight">Welcome to LuxChat</h2>
              <p className="text-gray-500 mb-8 px-4 leading-relaxed">Let others know who you are. Enter a display name to join the conversation.</p>
              
              <div className="space-y-4">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Enter your name..."
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
                  className="w-full px-8 py-5 rounded-3xl border-2 border-transparent bg-white shadow-inner focus:border-blue-600 focus:ring-0 transition-all text-center text-lg font-bold"
                />
                <button
                  onClick={handleSetName}
                  disabled={!tempName.trim()}
                  className="w-full py-5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-3xl font-black shadow-xl shadow-blue-500/20 transition-all active:scale-95 text-lg"
                >
                  Join Premium Chat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN Verification Screen */}
      <AnimatePresence>
        {!isPinVerified && !isSettingName && currentUser && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900">
            <div className="absolute inset-0 overflow-hidden opacity-30">
               <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600 rounded-full blur-[150px]" />
               <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-600 rounded-full blur-[150px]" />
            </div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`relative w-full max-w-md p-10 rounded-[3rem] ${glassDark} border-white/5 shadow-2xl text-center`}
            >
              <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center text-blue-500 mx-auto mb-6">
                <ShieldCheck size={40} />
              </div>
              
              <h2 className="text-3xl font-black text-white tracking-tight mb-2">Security Verification</h2>
              <p className="text-gray-400 text-sm mb-8 px-4">Hello <span className="text-blue-400 font-bold">{currentUser.name}</span>! Enter your secret 4-digit PIN to access LuxChat.</p>
              
              <div className="relative group">
                <input
                  type="password"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="••••"
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyPin()}
                  className={`w-full bg-white/5 border-2 ${pinError ? 'border-red-500 animate-shake' : 'border-white/10'} rounded-2xl py-5 text-center text-3xl tracking-[1.5rem] font-black text-blue-500 focus:outline-none focus:border-blue-600 transition-all placeholder:text-white/10`}
                />
              </div>

              {pinError && <p className="text-red-500 text-xs font-bold mt-4 uppercase tracking-widest">Access Denied: Invalid PIN</p>}
              
              <button
                onClick={handleVerifyPin}
                className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.4)] hover:scale-[1.02] active:scale-95 transition-all text-lg"
              >
                Verify & Enter
              </button>
              
              <div className="mt-8 pt-8 border-t border-white/5 text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                <Lock size={12} />
                Encrypted Connection
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {showInviteToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[150]"
          >
            <div className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
              <Check size={18} className="text-green-400" />
              <span className="text-sm font-bold">Invite link copied!</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
