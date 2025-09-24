"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";


// Define the structure of a message in our chat
interface Message {
  sender: "user" | "agent";
  text: string;
  isCode?: boolean;
  fullText?: string;
  visible?: boolean;
}

export default function ChatInterface() {
  // State Management
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const typingSpeed = 10; // ms per character
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

    // --- Configuration ---
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"; // Base URL for the API
  const appName = "apim_generator"; // Example app name
  const userId = useRef(`user-${Math.random().toString(36).substring(2, 12)}`).current;

  // --- Copy Feedback Function ---
  const showCopyFeedback = (message: string) => {
    setCopyFeedback(message);
    setTimeout(() => {
      setCopyFeedback(null);
    }, 2000); // Hide after 2 seconds
  };

  // --- API Functions ---

    // 1. Create a Session
  useEffect(() => {
    const createSession = async () => {
      try {
        console.log("Creating session...");
        const sessionResponse = await fetch(`${API_BASE_URL}/apps/${appName}/users/${userId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!sessionResponse.ok) 
          throw new Error("Failed to create session");
        const sessionData = await sessionResponse.json();
        setSessionId(sessionData.id);
        console.log("Session created with ID:", sessionData.id);
      } catch (error) {
        console.error("Session creation error:", error);
        setMessages([{ sender: 'agent', text: 'Error: Could not connect to the agent.' }]);
      }
    };
    createSession();
  }, [appName, userId]);

  // 2. Send initial message when session is created
  useEffect(() => {
    const sendInitialMessage = async () => {
      if (!sessionId) return;
      
      try {
        console.log("Sending initial message...");
        const initialMessage = "Hi! What can you do for me?";
        setMessages([{ sender: 'agent', text: '' }]);
        setIsLoading(true);

        const response = await fetch(`${API_BASE_URL}/run_sse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
          body: JSON.stringify({
            appName: appName,
            userId: userId,
            sessionId: sessionId,
            newMessage: {
              role: "user",
              parts: [{ text: initialMessage }],
            },
          }),
        });

        if (!response.body) throw new Error("Response body is null");

        // Set up the stream reader
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";

        // Read from the stream
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += value;
          // Process buffer line-by-line for SSE messages
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const chunk = buffer.substring(0, boundary);
            buffer = buffer.substring(boundary + 2);
            
            if (chunk.startsWith("data:")) {
              const jsonString = chunk.substring(5).trim();
              if (jsonString) {
                try {
                const eventData = JSON.parse(jsonString);
                const textChunk = eventData?.content?.parts?.[0]?.text || "";
                
                setMessages(prev => {
                  const lastMsg = prev[prev.length - 1];
                  const newText = (lastMsg.fullText || lastMsg.text) + textChunk;
                  
                  // Check if the chunk contains a code block
                  const isCodeBlock = textChunk.includes("```");
                  
                  // If it's a code block, show it immediately
                  if (isCodeBlock) {
                    return prev.map((msg, index) => 
                      index === prev.length - 1 
                        ? { ...msg, text: newText, fullText: newText, isCode: true }
                        : msg
                    );
                  }
                  
                  // For regular text, update the full text but keep displaying the partial text
                  return prev.map((msg, index) => 
                    index === prev.length - 1 
                      ? { 
                          ...msg, 
                          text: lastMsg.text || "", // Keep the current display text
                          fullText: newText // Store the complete text
                        }
                      : msg
                  );
                });
                } catch (e) {
                  console.error("Failed to parse SSE JSON chunk:", jsonString, e);
                }
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        console.error("Error sending initial message:", error);
        setMessages([{ sender: 'agent', text: 'Error: Could not initialize the agent' }]);
      } finally {
        setIsLoading(false);
      }
    };
    
    sendInitialMessage();
  }, [sessionId, appName, userId, API_BASE_URL]);

  // Scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

    // Add this before the return statement
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.sender === 'agent' && lastMessage.fullText && !lastMessage.visible) {
      // Short delay before showing the message
      setTimeout(() => {
        setMessages(prev => prev.map((msg, index) =>
          index === prev.length - 1
            ? { ...msg, text: msg.fullText || '', visible: true }
            : msg
        ));
      }, 100);
    }
  }, [messages]);

  // 2. Handle a new message submission using the /run_sse endpoint
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userInput.trim() || isLoading || !sessionId) return;

    // Add user message to UI and prepare for agent's streaming response
    const userMessage: Message = { sender: "user", text: userInput, visible: true };
    setMessages((prev) => [...prev, userMessage, { sender: "agent", text: "", visible: true }]);
    
    setIsLoading(true);
    const currentInput = userInput;
    setUserInput("");

    try {
      const response = await fetch(`${API_BASE_URL}/run_sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        body: JSON.stringify({
          appName: appName,
          userId: userId,
          sessionId: sessionId,
          newMessage: {
            role: "user",
            parts: [{ text: currentInput }],
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      if (!response.body) throw new Error("Response body is null");

      // Set up the stream reader
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";

      // Read from the stream
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        // Process buffer line-by-line for SSE messages
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const chunk = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 2);
          
          if (chunk.startsWith("data:")) {
            const jsonString = chunk.substring(5).trim();
            if (jsonString) {
              try {
                const eventData = JSON.parse(jsonString);
                const textChunk = eventData?.content?.parts?.[0]?.text || "";
                if (!textChunk) continue;
                
                setMessages(prev => {
                  const lastMsg = prev[prev.length - 1];
                  const newText = (lastMsg.fullText || lastMsg.text) + textChunk;
                  const isCodeBlock = textChunk.includes("```");
                  
                  return prev.map((msg, index) => 
                    index === prev.length - 1 
                      ? { 
                          ...msg, 
                          text: newText,        // Always show the updated text
                          fullText: newText,    // Keep track of the full text
                          isCode: isCodeBlock || msg.isCode,
                          visible: true         // Ensure message is visible
                        }
                      : msg
                  );
                });
              }
              catch (e) {
                console.error("Failed to parse SSE JSON chunk:", jsonString, e);
              }
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      console.error("SSE stream error:", error);
      setMessages(prev => [...prev, { sender: 'agent', text: 'An error occurred during streaming.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI Rendering (No changes needed here) ---
  return (
    <div className="flex h-screen bg-gray-900 text-white font-sans">
      {/* Help Sidebar */}
      <div 
        className={`fixed inset-y-0 right-0 w-80 bg-gray-800 transform transition-transform duration-300 ease-in-out ${
          isHelpOpen ? 'translate-x-0' : 'translate-x-full'
        } shadow-lg z-50`}
      >
        <div className="p-6 h-full overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-cyan-400">Help Guide</h2>
            <button 
              onClick={() => setIsHelpOpen(false)}
              className="text-gray-400 hover:text-white"
              aria-label="Close help"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-6">
            <section>
              <h3 className="text-md font-semibold text-cyan-400 mb-2">Getting Started</h3>
              <p className="text-sm text-gray-300 mb-2">
                Welcome to GenAPI! This tool helps you interact with an AI assistant specialized in API development.
              </p>
            </section>

            <section>
              <h3 className="text-md font-semibold text-cyan-400 mb-2">Features</h3>
              <ul className="text-sm text-gray-300 list-disc list-inside space-y-2">
                <li>Prompt to design your APIs</li>
                <li>Code Generation specific to Kong Gateway</li>
              </ul>
            </section>

            <section>
              <h3 className="text-md font-semibold text-cyan-400 mb-2">Tips</h3>
              <ul className="text-sm text-gray-300 list-disc list-inside space-y-2">
                <li>Be specific in your prompts and do not use any sensitive data as some data may be passed onto LLM</li>
                <li>You can iterate over the API Design and you can also provide JSON responses to be used in your spec</li>
                <li>Your session persists until you close the browser, userID is randomly generated for the pilot testing</li>
              </ul>
            </section>

            <section>
              <h3 className="text-md font-semibold text-cyan-400 mb-2">Example Prompts</h3>
              <ul className="text-sm text-gray-300 list-disc list-inside space-y-2">
                <li>"I would like generate an API for hello world API with GET endpoint"</li>
                <li>"Help me design an API for managing inventory for an online store"</li>
                <li>"Modify the existing API to use API Key security scheme"</li>
              </ul>
            </section>
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1">
        <header className="bg-gray-800 p-4 border-b border-gray-700 shadow-lg relative">
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-400">
              <div>User ID: {userId}</div>
              <div>Session ID: {sessionId || 'Connecting...'}</div>
            </div>
            <h1 className="text-xl font-bold text-cyan-400">GenAPI ⚡️</h1>
            <button 
              onClick={() => setIsHelpOpen(true)}
              className="w-32 text-gray-400 hover:text-cyan-400 transition-colors text-sm flex items-center justify-end"
              aria-label="Open help"
            >
              <span className="mr-1">Help</span>
              <span className="text-lg">🤔</span>
            </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Copy Feedback Message */}
          {copyFeedback && (
            <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse">
              {copyFeedback}
            </div>
          )}
          
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xl px-4 py-2 rounded-lg shadow whitespace-pre-wrap 
                ${msg.sender === 'user' ? 'bg-cyan-600' : 'bg-gray-700'}
                transition-all duration-500 ease-in-out
                ${msg.visible ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'}`}>
                <ReactMarkdown
                  className="text-base"
                  components={{
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const codeContent = String(children).replace(/\n$/, "");
                      
                      return match ? (
                        <div className="relative group">
                          <SyntaxHighlighter
                            {...{
                              style: vscDarkPlus,
                              language: match[1],
                              PreTag: "div",
                              ...props
                            } as any}
                          >
                            {codeContent}
                          </SyntaxHighlighter>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(codeContent);
                                showCopyFeedback('Code copied to clipboard!');
                              } catch (err) {
                                console.error('Failed to copy code:', err);
                                showCopyFeedback('Failed to copy code');
                              }
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs font-medium border border-gray-600 hover:border-gray-500"
                            title="Copy code"
                          >
                            ⧉ Copy
                          </button>
                        </div>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {String(msg.text) + (isLoading && msg.sender === 'agent' && index === messages.length -1 ? '▌' : '')}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </main>
        
        <footer className="p-4 bg-gray-800 border-t border-gray-700">
            <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={sessionId ? "Describe your requirements here..." : "Connecting to agent..."}
              className="flex-1 p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-white"
              disabled={isLoading || !sessionId}
              ref={(input) => {
              if (input && !isLoading && messages.length > 0) {
                input.focus();
              }
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !userInput.trim()}
              className="px-6 py-3 bg-cyan-600 rounded-lg font-semibold text-white hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
            </form>
        </footer>
      </div>
    </div>
  );
}