import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Home, ArrowLeft, Brain, Plus, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import ModelSelector from '../components/ModelSelector';
import UserButton from '../components/UserButton';
import ConversationHistory from '../components/ConversationHistory';
import { useAuth } from '../contexts/HybridAuthContext';
import { saveChatMessage, getConversationMessages, createConversation } from '../lib/database';
import { callSearchAPI, needsLiveInfo, enhancePromptWithSearch } from '../lib/searchAPI';

interface Message {
  id: string;
  sender: 'user' | 'tutor1' | 'tutor2';
  content: string;
  timestamp: Date;
}

const StudyChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.1-8b-instant');
  const [currentConversationId, setCurrentConversationId] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversationMessages = async (conversationId: string) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    try {
      const history = await getConversationMessages(conversationId, 50);
      const formattedHistory = history.map(msg => ({
        id: msg.id,
        sender: msg.sender as 'user' | 'tutor1' | 'tutor2',
        content: msg.content,
        timestamp: msg.createdAt
      }));
      setMessages(formattedHistory);
    } catch (error) {
      console.error('Error loading conversation messages:', error);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    loadConversationMessages(conversationId);
    setShowHistory(false);
  };

  const handleNewChat = async () => {
    if (!currentUser) return;
    
    try {
      const conversation = await createConversation(
        currentUser.id,
        `Study Session ${new Date().toLocaleString()}`,
        'study'
      );
      setCurrentConversationId(conversation.id);
      setMessages([]);
      setShowHistory(false);
    } catch (error) {
      console.error('Error creating new conversation:', error);
    }
  };

  const callGroqAPI = async (prompt: string, apiKey: string, tutorName: string) => {
    const systemPrompt = tutorName === 'Tutor1' 
      ? "You are an expert AI tutor who specializes in breaking down complex concepts into simple, understandable steps. You focus on understanding the student's learning style and providing clear, structured explanations. Always encourage questions and provide examples. Work collaboratively with other tutors to provide comprehensive learning support."
      : "You are an engaging AI tutor who excels at making learning fun and memorable through analogies, stories, and interactive explanations. You help students connect new concepts to things they already know. You work with other tutors to ensure students get well-rounded educational support.";

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || 'Sorry, I could not process that request.';
    } catch (error) {
      console.error(`Error calling Groq API for ${tutorName}:`, error);
      return `Sorry, I'm having trouble connecting right now. Please try again!`;
    }
  };

  const saveMessage = async (sender: string, content: string) => {
    if (currentUser && currentConversationId) {
      try {
        await saveChatMessage(currentConversationId, currentUser.id, sender, content);
      } catch (error) {
        console.error('Error saving message:', error);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    if (!currentUser) return;

    if (!currentConversationId) {
      await handleNewChat();
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    await saveMessage('user', userMessage.content);
    setInput('');
    setIsLoading(true);

    const conversationContext = messages.slice(-5).map(msg => 
      `${msg.sender === 'user' ? 'Student' : msg.sender === 'tutor1' ? 'Tutor1' : 'Tutor2'}: ${msg.content}`
    ).join('\n') + `\nStudent: ${userMessage.content}`;

    try {
      // Check if the query needs live information
      let liveInfo = '';
      if (needsLiveInfo(userMessage.content)) {
        try {
          liveInfo = await callSearchAPI(userMessage.content);
        } catch (error) {
          console.error('Error getting live info:', error);
        }
      }

      const tutor1EnhancedPrompt = liveInfo 
        ? enhancePromptWithSearch(
            `Learning context:\n${conversationContext}\n\nPlease provide educational support as Tutor1. Focus on clear explanations and structured learning.`,
            `Live information context: ${liveInfo}`
          )
        : `Learning context:\n${conversationContext}\n\nPlease provide educational support as Tutor1. Focus on clear explanations and structured learning.`;

      const tutor1Response = await callGroqAPI(
        tutor1EnhancedPrompt,
        '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',
        'Tutor1'
      );

      const tutor1Message: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'tutor1',
        content: tutor1Response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, tutor1Message]);
      await saveMessage('tutor1', tutor1Message.content);

      setTimeout(async () => {
        const updatedContext = conversationContext + `\nTutor1: ${tutor1Response}`;
        
        const tutor2EnhancedPrompt = liveInfo 
          ? enhancePromptWithSearch(
              `Learning context:\n${updatedContext}\n\nPlease provide additional educational support as Tutor2. You can build on Tutor1's explanation with engaging examples and connections.`,
              `Live information context: ${liveInfo}`
            )
          : `Learning context:\n${updatedContext}\n\nPlease provide additional educational support as Tutor2. You can build on Tutor1's explanation with engaging examples and connections.`;

        const tutor2Response = await callGroqAPI(
          tutor2EnhancedPrompt,
          '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',
          'Tutor2'
        );

        const tutor2Message: Message = {
          id: (Date.now() + 2).toString(),
          sender: 'tutor2',
          content: tutor2Response,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, tutor2Message]);
        await saveMessage('tutor2', tutor2Message.content);
        setIsLoading(false);
      }, 1500);

    } catch (error) {
      console.error('Error in learning session:', error);
      setIsLoading(false);
    }
  };

  const getSenderName = (sender: string) => {
    switch (sender) {
      case 'user':
        return 'You';
      case 'tutor1':
        return 'Structured Tutor';
      case 'tutor2':
        return 'Creative Tutor';
      default:
        return 'Unknown';
    }
  };

  const getSenderColor = (sender: string) => {
    switch (sender) {
      case 'user':
        return 'bg-blue-600 text-white shadow-lg';
      case 'tutor1':
        return 'bg-white text-gray-800 border border-blue-200 shadow-md';
      case 'tutor2':
        return 'bg-blue-50 text-gray-800 border border-blue-300 shadow-md';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-white flex">
      {/* Sidebar for conversation history */}
      {showHistory && (
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800">Study History</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ConversationHistory
              chatType="study"
              onSelectConversation={handleSelectConversation}
              currentConversationId={currentConversationId}
            />
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white/90 backdrop-blur-sm shadow-lg border-b border-gray-200 p-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link 
                to="/chat-selector" 
                className="flex items-center text-gray-600 hover:text-gray-800 transition-all duration-200 hover:scale-105"
              >
                <ArrowLeft size={20} className="mr-2" />
                <span className="font-medium hidden sm:inline">Back to Chat Options</span>
                <Home size={20} className="sm:hidden" />
              </Link>
              
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center text-gray-600 hover:text-gray-800 transition-colors"
              >
                <MessageCircle size={20} className="mr-2" />
                <span className="hidden sm:inline">History</span>
              </button>
              
              <button
                onClick={handleNewChat}
                className="flex items-center text-gray-600 hover:text-gray-800 transition-colors"
              >
                <Plus size={20} className="mr-2" />
                <span className="hidden sm:inline">New Study</span>
              </button>
            </div>
            
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                Study Mode
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">AI-Powered Learning Experience</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <ModelSelector 
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
              <UserButton />
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-8 sm:py-16">
                <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 sm:p-12 shadow-xl border border-gray-200 max-w-2xl mx-auto">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-r from-blue-600 to-blue-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <Brain className="text-white" size={32} />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Welcome to Study Mode!</h3>
                  <p className="text-gray-600 mb-8 max-w-md mx-auto text-sm sm:text-base">
                    Ask any question and our AI tutors will work together to help you understand and learn effectively.
                    {currentUser && <span className="block mt-2 text-green-600">✓ Your study sessions will be saved</span>}
                  </p>
                  
                  <div className="flex flex-col sm:flex-row justify-center items-center space-y-6 sm:space-y-0 sm:space-x-12">
                    <div className="text-center group">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform shadow-lg">
                        <User className="text-white" size={24} />
                      </div>
                      <p className="text-lg font-semibold text-gray-700">Structured Tutor</p>
                      <p className="text-xs sm:text-sm text-gray-500">Clear & Organized</p>
                    </div>
                    <div className="text-center group">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform shadow-lg">
                        <User className="text-white" size={24} />
                      </div>
                      <p className="text-lg font-semibold text-gray-700">Creative Tutor</p>
                      <p className="text-xs sm:text-sm text-gray-500">Engaging & Fun</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div className={`max-w-[85%] sm:max-w-[75%] rounded-3xl p-4 sm:p-6 ${getSenderColor(message.sender)} backdrop-blur-sm`}>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                      <User className="text-white" size={16} />
                    </div>
                    <span className="font-semibold text-sm">{getSenderName(message.sender)}</span>
                    <span className="text-xs opacity-70">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{message.content}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 max-w-[75%] shadow-lg border border-gray-200">
                  <div className="flex items-center space-x-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                    </div>
                    <span className="text-sm text-gray-600 font-medium">Tutors are thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="bg-white/90 backdrop-blur-sm border-t border-gray-200 p-4 sm:p-6">
          <div className="max-w-5xl mx-auto">
            <div className="flex space-x-3 sm:space-x-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask your tutors anything you want to learn..."
                className="flex-1 px-4 sm:px-6 py-3 sm:py-4 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-lg placeholder-gray-500 text-sm sm:text-base"
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="px-6 sm:px-8 py-3 sm:py-4 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2 shadow-lg hover:scale-105"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyChat;