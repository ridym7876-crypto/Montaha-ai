import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, Copy, Check, Globe, Terminal, X, RefreshCw } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  onDeploy?: () => void;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, onDeploy }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [outputLogs, setOutputLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [runKey, setRunKey] = useState(0); // Used to force iframe refresh

  // Listen for console logs from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.source === 'muntaha-sandbox') {
        setOutputLogs(prev => [...prev, event.data.message]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleRun = () => {
    setIsRunning(true);
    setOutputLogs([]);
    setRunKey(prev => prev + 1); // Re-mount iframe to re-run code
  };

  const handleCloseRun = () => {
    setIsRunning(false);
    setOutputLogs([]);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `script.${language === 'javascript' ? 'js' : language === 'html' ? 'html' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDeployable = ['html', 'javascript', 'typescript', 'css', 'jsx', 'tsx'].includes(language.toLowerCase());
  const isRunnable = ['html', 'javascript'].includes(language.toLowerCase());

  // Construct the content for the iframe based on language
  const getSrcDoc = () => {
    if (language === 'html') {
      return code;
    }
    if (language === 'javascript') {
      return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>body { font-family: monospace; color: #ccc; background: #1e1e1e; padding: 10px; margin: 0; }</style>
        </head>
        <body>
          <script>
            // Intercept console.log and friends
            function sendLog(msg) {
              window.parent.postMessage({ source: 'muntaha-sandbox', message: msg }, '*');
            }
            
            const formatArgs = (args) => {
                return args.map(arg => {
                    if (typeof arg === 'object') return JSON.stringify(arg, null, 2);
                    return String(arg);
                }).join(' ');
            };

            console.log = (...args) => sendLog('➜ ' + formatArgs(args));
            console.error = (...args) => sendLog('✖ ' + formatArgs(args));
            console.warn = (...args) => sendLog('⚠ ' + formatArgs(args));
            console.info = (...args) => sendLog('ℹ ' + formatArgs(args));
            
            window.onerror = (msg, url, line) => {
               sendLog('✖ Runtime Error: ' + msg);
            };

            try {
              ${code}
            } catch (e) {
              console.error(e.toString());
            }
          </script>
        </body>
        </html>
      `;
    }
    return '';
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-gray-700 bg-[#1e1e1e] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#252526] px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{language}</span>
        </div>
        <div className="flex items-center space-x-1">
          {onDeploy && isDeployable && (
            <button 
                onClick={onDeploy} 
                className="flex items-center gap-1 px-3 py-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 rounded text-xs transition-colors font-medium border border-blue-500/30"
                title="Deploy to live website"
            >
              <Globe size={14} />
              <span>Deploy</span>
            </button>
          )}
          {isRunnable && (
            <button 
                onClick={handleRun} 
                className={`p-1.5 rounded transition-colors ${isRunning ? 'text-green-400 bg-green-400/10' : 'text-gray-400 hover:text-green-400 hover:bg-gray-700'}`}
                title="Run Code"
            >
                <Play size={16} />
            </button>
          )}
          <button onClick={handleCopy} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="Copy Code">
             {copied ? <Check size={16} className="text-green-500"/> : <Copy size={16} />}
          </button>
          <button onClick={handleDownload} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="Download File">
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="p-4 overflow-x-auto bg-[#1e1e1e] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        <pre className="text-sm font-mono text-gray-300 leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
      
      {/* Execution Pane */}
      {isRunning && isRunnable && (
        <div className="border-t border-gray-700 bg-black animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center bg-gray-800 px-3 py-1.5 border-b border-gray-700">
             <div className="flex items-center gap-2">
                {language === 'javascript' ? <Terminal size={14} className="text-gray-400"/> : <Globe size={14} className="text-gray-400"/>}
                <span className="text-xs text-gray-300 font-semibold">{language === 'javascript' ? 'Console Output' : 'Browser Preview'}</span>
             </div>
             <div className="flex gap-2">
                 <button onClick={() => setRunKey(p => p+1)} className="text-gray-400 hover:text-white" title="Rerun">
                    <RefreshCw size={14} />
                 </button>
                 <button onClick={handleCloseRun} className="text-gray-400 hover:text-red-400" title="Close">
                    <X size={14} />
                 </button>
             </div>
          </div>
          
          <div className="relative">
             {language === 'javascript' ? (
                 <div className="h-48 overflow-y-auto p-3 font-mono text-sm bg-black text-green-400 space-y-1">
                     {outputLogs.length === 0 && <span className="text-gray-600 italic opacity-50">Running...</span>}
                     {outputLogs.map((log, i) => (
                         <div key={i} className="border-b border-gray-900/50 pb-0.5">{log}</div>
                     ))}
                     {/* Hidden iframe for execution */}
                     <iframe 
                        key={runKey}
                        srcDoc={getSrcDoc()}
                        className="hidden"
                        title="js-sandbox"
                        sandbox="allow-scripts"
                     />
                 </div>
             ) : (
                 <iframe 
                    key={runKey}
                    srcDoc={getSrcDoc()}
                    className="w-full h-64 border-none bg-white"
                    title="html-sandbox"
                    sandbox="allow-scripts"
                 />
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeBlock;