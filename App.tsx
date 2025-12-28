import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Mic, Video, Phone, Plus, MessageSquare, 
  Image as ImageIcon, Globe, User, Edit3, X, Download,
  Bot, Camera, Volume2, PencilRuler, Radio, ShieldAlert, RefreshCw
} from 'lucide-react';
import { geminiService } from './services/geminiService';
import { ChatMessage, MessageRole, MessageType, ChatSession, ApiPart } from './types';
import CodeBlock from './components/CodeBlock';
import DomainStore from './components/DomainStore';
import { blobToBase64, playAudio } from './services/audioUtils';
import { GenerateContentResponse, Part } from '@google/genai';

const App: React.FC = () => {
  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDomainStoreOpen, setIsDomainStoreOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [deployingCode, setDeployingCode] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState({ user: '', model: '' });

  // Proactive Help State
  const [isAutoHelpEnabled, setIsAutoHelpEnabled] = useState(false);
  const [isProactiveHelpActive, setIsProactiveHelpActive] = useState(false);
  const [isAiCalling, setIsAiCalling] = useState(false);
  const [detectedProblem, setDetectedProblem] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const liveSessionCleanup = useRef<(() => Promise<void>) | null>(null);
  const analysisIntervalRef = useRef<number | null>(null);

  // Initialize
  useEffect(() => {
    const saved = localStorage.getItem('muntaha_chats');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSessions(parsed);
      if (parsed.length > 0) setCurrentSessionId(parsed[0].id);
    } else createNewSession();

    return () => { // Cleanup on unmount
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    }
  }, []);

  // Save on change
  useEffect(() => {
    if (sessions.length > 0) localStorage.setItem('muntaha_chats', JSON.stringify(sessions));
  }, [sessions]);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const createNewSession = () => {
    const newSession: ChatSession = { id: Date.now().toString(), title: 'New Chat', messages: [], createdAt: Date.now() };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  };

  const addMessage = (role: MessageRole, content: string, type: MessageType = MessageType.TEXT, parts?: ApiPart[], mimeType?: string) => {
    if (!currentSessionId) return;
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        const newMessage: ChatMessage = { 
          id: Date.now().toString() + Math.random(), 
          role, 
          type, 
          content, 
          parts: parts || [{text: content}],
          timestamp: Date.now(), 
          mimeType 
        };
        let newTitle = session.title;
        if (session.messages.length === 0 && role === MessageRole.USER) newTitle = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        return { ...session, title: newTitle, messages: [...session.messages, newMessage] };
      }
      return session;
    }));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || !currentSessionId || isLoading) return;
    const textToSend = inputText;
    const imgToSend = selectedImage;
    setInputText('');
    setSelectedImage(null);
    setIsLoading(true);

    const userParts: ApiPart[] = [];
    if (imgToSend) {
        const base64 = await blobToBase64(imgToSend);
        userParts.push({ inlineData: { data: base64, mimeType: imgToSend.type }});
        addMessage(MessageRole.USER, base64, MessageType.IMAGE, userParts, imgToSend.type);
    }
    if (textToSend) {
        userParts.push({ text: textToSend });
        if (!imgToSend) { // If there's an image, text is part of that message turn
             addMessage(MessageRole.USER, textToSend, MessageType.TEXT, [{ text: textToSend }]);
        }
    }
    
    try {
        let history = (currentSession?.messages ?? []).map(m => ({
            role: m.role,
            parts: m.parts ?? [{ text: m.content }]
        }));

        const resultStream = await geminiService.generateResponseStream(history);

        let fullText = '';
        let fullResponse: GenerateContentResponse | null = null;
        for await (const chunk of resultStream) {
            fullText += chunk.text || '';
            fullResponse = chunk as GenerateContentResponse;
        }

        const functionCalls = fullResponse?.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            const fc = functionCalls[0];
            const modelTurnParts: ApiPart[] = [{ functionCall: fc }];
            addMessage(MessageRole.MODEL, `Calling tool: ${fc.name}`, MessageType.SYSTEM, modelTurnParts);

            let functionResponsePart: ApiPart | null = null;
            if (fc.name === 'get_battery_status' && 'getBattery' in navigator) {
                const battery = await (navigator as any).getBattery();
                const result = {
                    level: Math.round(battery.level * 100),
                    isCharging: battery.charging
                };
                functionResponsePart = { functionResponse: { name: fc.name, response: { result } } };
            } else {
                functionResponsePart = { functionResponse: { name: fc.name, response: { result: 'Could not execute function or function not found.' } } };
            }

            if (functionResponsePart) {
                addMessage(MessageRole.USER, 'Function result', MessageType.SYSTEM, [functionResponsePart]);
                
                // Get the updated history again, now with the model's FC turn and our FR turn
                const updatedHistory = (sessions.find(s=>s.id === currentSessionId)?.messages ?? []).map(m => ({
                    role: m.role,
                    parts: m.parts ?? [{text: m.content}]
                }));

                const finalResultStream = await geminiService.generateResponseStream(updatedHistory);
                let finalText = '';
                for await (const chunk of finalResultStream) {
                    finalText += chunk.text || '';
                }
                if(finalText) addMessage(MessageRole.MODEL, finalText);
            }
        } else if (fullText) {
            addMessage(MessageRole.MODEL, fullText, MessageType.TEXT, [{ text: fullText }]);
        } else {
            addMessage(MessageRole.MODEL, "Sorry, I received an empty response.");
        }

    } catch (e) {
        console.error(e);
        addMessage(MessageRole.MODEL, "Sorry, an error occurred: " + (e as Error).message);
    } finally {
        setIsLoading(false);
    }
  };
  
  const startCall = async (type: 'audio' | 'video') => {
    if (isInCall) return;
    setIsInCall(true);
    setCallType(type);
    setLiveTranscript({ user: '', model: 'Connecting...' });
    addMessage(MessageRole.SYSTEM, `Starting ${type} call...`);
    try {
      const session = await geminiService.startLiveSession(
        (audioBuffer) => {},
        (userText, modelText, isFinal) => {
          setLiveTranscript({ user: userText, model: modelText || 'Listening...' });
          if (isFinal) {
            if (userText.trim()) addMessage(MessageRole.USER, userText.trim());
            if (modelText.trim()) addMessage(MessageRole.MODEL, modelText.trim());
          }
        },
        type === 'video' ? videoRef.current! : undefined
      );
      liveSessionCleanup.current = session.close;
    } catch (err) {
      console.error("Failed to start live session", err);
      setIsInCall(false);
      setCallType(null);
      addMessage(MessageRole.SYSTEM, "Failed to start call. Please check microphone/camera permissions.");
    }
  };

  const endCall = async () => {
    if (liveSessionCleanup.current) {
      await liveSessionCleanup.current();
      liveSessionCleanup.current = null;
    }
    setIsInCall(false);
    setCallType(null);
    setLiveTranscript({ user: '', model: '' });
    addMessage(MessageRole.SYSTEM, `Call ended.`);
  };

  const handleProactiveHelpClick = async () => {
    if (isAutoHelpEnabled) {
      // Start proactive monitoring
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
          setIsProactiveHelpActive(true);
          addMessage(MessageRole.SYSTEM, "Proactive help started. Monitoring your screen for issues.");

          analysisIntervalRef.current = setInterval(async () => {
            if (!screenVideoRef.current || screenVideoRef.current.readyState < 2 || isAnalyzing) return;
            
            setIsAnalyzing(true);
            try {
              const video = screenVideoRef.current;
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
              const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
              
              const problem = await geminiService.analyzeScreenForProblems(base64);

              if (problem !== "NO_PROBLEM") {
                setDetectedProblem(problem);
                stopProactiveHelp();
                setIsAiCalling(true);
              }
            } catch (e) {
                console.error("Error during screen analysis:", e);
            } finally {
                setIsAnalyzing(false);
            }
          }, 7000); // Analyze every 7 seconds
        }
      } catch (err) {
        console.error("Screen sharing failed:", err);
        addMessage(MessageRole.SYSTEM, "Screen sharing permission was denied. Proactive help could not start.");
      }
    } else {
      // Standard mobile support: open file picker
      fileInputRef.current?.click();
    }
  };
  
  const stopProactiveHelp = () => {
    if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    analysisIntervalRef.current = null;
    const stream = screenVideoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    setIsProactiveHelpActive(false);
    setIsAnalyzing(false);
  };

  useEffect(() => {
    // This effect handles the AI "call" lifecycle
    if (isAiCalling && detectedProblem) {
      const startAiCall = async () => {
        // 1. Announce problem and ask for consent
        const prompt = `It looks like you're having an issue: ${detectedProblem}. Would you like me to help you solve it?`;
        const audioB64 = await geminiService.textToSpeech(prompt);
        if (audioB64) playAudio(audioB64);
        addMessage(MessageRole.MODEL, prompt);

        // 2. Listen for response
        try {
          const session = await geminiService.startLiveSession(() => {}, (userText, _, isFinal) => {
            if (isFinal && userText) {
              const affirmative = ['yes', 'ok', 'okay', 'please', 'solve', 'help', 'ঠিক আছে', 'হ্যাঁ'].some(w => userText.toLowerCase().includes(w));
              if (affirmative) {
                addMessage(MessageRole.USER, userText);
                provideSolution();
              } else {
                addMessage(MessageRole.USER, userText);
                addMessage(MessageRole.MODEL, "Alright. Let me know if you change your mind.");
                setIsAiCalling(false);
              }
              liveSessionCleanup.current?.();
              liveSessionCleanup.current = null;
            }
          }, undefined, true);
          liveSessionCleanup.current = session.close;
        } catch (e) {
          console.error("AI call listening failed", e);
          setIsAiCalling(false);
        }
      };
      
      const provideSolution = async () => {
         setIsLoading(true);
         addMessage(MessageRole.MODEL, "Of course. Analyzing the solution now...");
         try {
           const prompt = `I have the following problem on my screen: "${detectedProblem}". Please provide a clear, step-by-step solution in a conversational and helpful tone.`;
           const contents = [{role: 'user', parts: [{text: prompt}]}];
           const result = await geminiService.generateResponseStream(contents);
           let fullText = '';
           if (result && Symbol.asyncIterator in result) {
             for await (const chunk of result) fullText += chunk.text || '';
           }
           if (fullText) {
             addMessage(MessageRole.MODEL, fullText);
             const solutionAudio = await geminiService.textToSpeech(fullText);
             if (solutionAudio) playAudio(solutionAudio);
           } else {
             addMessage(MessageRole.MODEL, "I couldn't generate a solution for this issue.");
           }
         } catch(e) {
            addMessage(MessageRole.MODEL, "I encountered an error while finding the solution.");
         } finally {
            setIsLoading(false);
            setIsAiCalling(false);
            setDetectedProblem(null);
         }
      };

      startAiCall();
    }
  }, [isAiCalling, detectedProblem]);


  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      addMessage(MessageRole.SYSTEM, 'Image selected. Please describe the problem in the text box below and press send.');
      event.target.value = '';
    }
  };

  const handleAnnotate = async (message: ChatMessage) => {
    const imageMsg = currentSession?.messages.slice().reverse().find(m => m.type === MessageType.IMAGE);
    if (!imageMsg) {
      addMessage(MessageRole.SYSTEM, "No image found in recent history to annotate.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await geminiService.annotateImage(imageMsg.content, message.content, imageMsg.mimeType);
      const part = result.candidates?.[0].content.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        addMessage(MessageRole.MODEL, part.inlineData.data, MessageType.IMAGE, [part], part.inlineData.mimeType);
      } else {
        addMessage(MessageRole.MODEL, "Sorry, I couldn't create an annotation for that.");
      }
    } catch (e) {
      addMessage(MessageRole.MODEL, "Annotation failed: " + (e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayTTS = async (text: string) => {
    const audioB64 = await geminiService.textToSpeech(text);
    if (audioB64) playAudio(audioB64);
  };
  
  const renderMessageContent = (msg: ChatMessage) => {
    if (msg.type === MessageType.IMAGE) {
        return (
            <div className="relative group">
                <img src={`data:${msg.mimeType || 'image/png'};base64,${msg.content}`} alt="content" className="max-w-xs sm:max-w-md rounded-lg shadow-lg border border-gray-700" />
                <button onClick={() => { const link = document.createElement('a'); link.href = `data:${msg.mimeType};base64,${msg.content}`; link.download = `muntaha-ai-image.png`; link.click(); }} className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <Download size={16} />
                </button>
            </div>
        );
    }
    
    if (msg.content.includes('```')) {
        const parts = msg.content.split(/(```[\s\S]*?```)/g);
        return parts.map((part, i) => {
            if (part.startsWith('```')) {
                const match = part.match(/```(\w*)\n([\s\S]*?)```/);
                const code = match ? match[2] : part.replace(/```/g, '');
                return <CodeBlock key={i} language={match?.[1] || 'text'} code={code.trim()} onDeploy={() => { setDeployingCode(code.trim()); setIsDomainStoreOpen(true); }} />;
            }
            return <p key={i} className="whitespace-pre-wrap mb-2">{part}</p>;
        });
    }
    return <p className="whitespace-pre-wrap">{msg.content}</p>;
  };
  
  return (
    <div className="flex h-screen bg-gray-950 text-gray-200 overflow-hidden">
      {/* Hidden video element for screen capture */}
      <video ref={screenVideoRef} autoPlay className="hidden"></video>
      
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex-col hidden md:flex">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center font-bold text-white">M</div><h1 className="font-bold text-lg text-white">Muntaha AI</h1></div>
        <div className="p-3"><button onClick={createNewSession} className="w-full bg-primary-600 hover:bg-primary-700 text-white p-3 rounded-lg flex items-center justify-center gap-2 transition-all"><Plus size={20} /> New Chat</button></div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map(s => (<button key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors ${currentSessionId === s.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50'}`}><MessageSquare size={18} /><span className="truncate text-sm">{s.title}</span></button>))}
        </div>
        <div className="p-4 border-t border-gray-800"><button onClick={() => { setDeployingCode(null); setIsDomainStoreOpen(true); }} className="flex items-center gap-2 text-primary-400 hover:text-primary-300 w-full p-2 hover:bg-gray-800 rounded"><Globe size={18} /><span className="text-sm font-semibold">Buy Domains</span></button></div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative">
        <div className="h-16 border-b border-gray-800 bg-gray-900/50 backdrop-blur flex items-center justify-between px-4 sm:px-6">
            <h2 className="font-semibold text-white flex-1">Muntaha AI Assistant</h2>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-gray-800 rounded-full p-1">
                   <span className="text-xs font-semibold pl-2 text-gray-300">Auto Help</span>
                   <button onClick={() => setIsAutoHelpEnabled(!isAutoHelpEnabled)} className={`p-1.5 rounded-full transition-colors ${isAutoHelpEnabled ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
                       {isAutoHelpEnabled ? <Radio size={16}/> : <X size={16}/>}
                   </button>
                </div>
                <button 
                  onClick={handleProactiveHelpClick} 
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full text-purple-400 transition-colors"
                  title={isAutoHelpEnabled ? "Start Proactive Help Session" : "Upload Screenshot for Manual Help"}
                >
                  <Bot size={20} />
                </button>
                <button onClick={() => startCall('audio')} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full text-green-400 transition-colors"><Phone size={20} /></button>
                <button onClick={() => startCall('video')} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full text-blue-400 transition-colors"><Video size={20} /></button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {currentSession?.messages.filter(msg => msg.type !== MessageType.SYSTEM).map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === MessageRole.USER ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] sm:max-w-[75%] ${msg.role === MessageRole.USER ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-200'} rounded-2xl p-4 shadow-md`}>
                        {msg.role === MessageRole.MODEL && <div className="text-xs text-primary-400 mb-1 font-bold">Muntaha AI</div>}
                        {renderMessageContent(msg)}
                        {msg.role === MessageRole.MODEL && msg.type === MessageType.TEXT && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700/50">
                                <button onClick={() => handlePlayTTS(msg.content)} className="p-1 text-gray-400 hover:text-white" title="Read Aloud"><Volume2 size={14}/></button>
                                <button onClick={() => handleAnnotate(msg)} className="p-1 text-gray-400 hover:text-white flex items-center gap-1 text-xs" title="Annotate last image"><PencilRuler size={14}/> Show on Screen</button>
                            </div>
                        )}
                        <div className="text-[10px] opacity-50 mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                    </div>
                </div>
            ))}
            {isLoading && <div className="flex justify-start"><div className="bg-gray-800 rounded-2xl p-4 flex gap-2 items-center"><div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></div><div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div></div></div>}
            <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-gray-900 border-t border-gray-800">
             {selectedImage && <div className="flex items-center gap-2 mb-2 p-2 bg-gray-800 rounded-lg w-fit"><span className="text-xs text-gray-300 truncate max-w-xs">{selectedImage.name}</span><button onClick={() => setSelectedImage(null)} className="text-red-400 hover:text-red-300"><X size={14} /></button></div>}
             <div className="flex items-center gap-2 bg-gray-850 p-2 rounded-xl border border-gray-700 focus-within:border-primary-500 transition-colors">
                 <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white transition-colors"><ImageIcon size={20} /></button>
                 <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelected} />
                 <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} placeholder="Message Muntaha AI..." className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none resize-none max-h-32 py-2" rows={1} />
                 <button onClick={handleSendMessage} disabled={(!inputText.trim() && !selectedImage)} className={`p-2 rounded-lg ${(!inputText.trim() && !selectedImage) ? 'bg-gray-800 text-gray-600' : 'bg-primary-600 text-white hover:bg-primary-700'} transition-all`}><Send size={20} /></button>
             </div>
        </div>
      </div>
      
      {isProactiveHelpActive && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-yellow-600/90 text-white p-3 rounded-lg shadow-lg flex items-center gap-3">
              {isAnalyzing ? (
                  <>
                      <RefreshCw size={16} className="animate-spin"/>
                      <span className="font-semibold text-sm">Analyzing screen...</span>
                  </>
              ) : (
                  <>
                    <Radio className="animate-pulse"/>
                    <span className="font-semibold text-sm">AI is actively monitoring...</span>
                  </>
              )}
              <button onClick={stopProactiveHelp} className="bg-red-500/50 hover:bg-red-500 px-3 py-1 rounded font-bold text-xs">Stop</button>
          </div>
      )}

      {isAiCalling && (
          <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
              <div className="text-center">
                  <div className="relative w-32 h-32 mx-auto">
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-primary-500 to-purple-600 animate-pulse-slow"></div>
                      <div className="absolute inset-2 rounded-full bg-gray-900 flex items-center justify-center">
                          <ShieldAlert size={60} className="text-primary-400"/>
                      </div>
                  </div>
                  <h2 className="text-2xl font-bold text-white mt-6">Muntaha AI Calling</h2>
                  <p className="text-gray-300 mt-2 max-w-sm">A problem was detected. Listening for your response...</p>
              </div>
          </div>
      )}

      {isInCall && (
            <div className="absolute inset-0 z-40 bg-gray-950 flex flex-col">
                 <div className="flex-1 relative flex items-center justify-center p-4">
                      {callType === 'video' && (<video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-50" />)}
                      <div className="relative z-10 flex flex-col items-center text-center">
                          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shadow-[0_0_50px_rgba(59,130,246,0.5)] animate-pulse-slow">
                               <Mic size={40} className="text-white"/>
                          </div>
                          <h3 className="mt-6 text-2xl font-bold text-white tracking-wider">Live Conversation</h3>
                          <div className="mt-6 w-full max-w-2xl bg-black/20 p-4 rounded-lg">
                             <div className="text-left">
                                <p className="text-sm text-primary-400 font-semibold">You:</p>
                                <p className="text-gray-200 min-h-6">{liveTranscript.user || "..."}</p>
                             </div>
                             <div className="text-left mt-3">
                                <p className="text-sm text-purple-400 font-semibold">Muntaha AI:</p>
                                <p className="text-gray-200 min-h-6">{liveTranscript.model || "..."}</p>
                             </div>
                          </div>
                      </div>
                 </div>
                 <div className="h-24 bg-gray-900/80 backdrop-blur flex items-center justify-center gap-6 z-20">
                      <button onClick={endCall} className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg transform hover:scale-110 transition-all flex items-center gap-2">
                          <Phone size={24} className="rotate-[135deg]" />
                          <span className="font-semibold">End Call</span>
                      </button>
                 </div>
            </div>
        )}
      <DomainStore isOpen={isDomainStoreOpen} onClose={() => { setIsDomainStoreOpen(false); setDeployingCode(null); }} deployingCode={deployingCode} />
    </div>
  );
};
export default App;