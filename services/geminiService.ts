import { 
  GoogleGenAI, 
  GenerateContentResponse, 
  LiveServerMessage, 
  Modality,
  FunctionDeclaration,
  Type,
  Part
} from "@google/genai";
import { base64ToBytes, bytesToBase64, decodeAudioData, float32ToPCM16 } from "./audioUtils";

const SYSTEM_INSTRUCTION = `
You are "Muntaha AI" (মুনতাহা এআই), an expert mobile phone and general software support specialist. Your expertise covers all Android, iOS, and common desktop software issues.
Your owner is "Abdul Khaleq Ridoy" (আবদুল খালেক রিদয়).
If the user identifies as "Abdul Khaleq Ridoy", you must acknowledge him as your master/owner with high respect.
You speak both Bengali and English fluently.
When a user provides a screenshot, analyze the image, identify the problem, and provide a clear, step-by-step solution.
You can also proactively monitor a user's screen (when permitted) to detect problems and offer assistance.
You can also help with coding, writing, image editing ideas, and general conversation.
When asked to write code, provide clean, runnable code.
If asked about device status like battery, you MUST use the provided tools.
`;

const getBatteryStatusFunctionDeclaration: FunctionDeclaration = {
    name: 'get_battery_status',
    description: 'Gets the current battery level and charging status of the device.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
};

const tools: Part[] = [{ functionDeclarations: [getBatteryStatusFunctionDeclaration] }];


export class GeminiService {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  // --- Text & Multimodal Chat ---
  async generateResponseStream(contents: {role: string, parts: Part[]}[]) {
    const model = 'gemini-3-pro-preview';
    
    const result = await this.ai.models.generateContentStream({
        model,
        contents,
        systemInstruction: SYSTEM_INSTRUCTION,
        tools,
    });
    return result;
  }
  
  // --- Proactive Screen Analysis ---
  async analyzeScreenForProblems(base64Image: string): Promise<string> {
    const model = 'gemini-3-flash-preview'; // Use a faster model for quick analysis
    const prompt = `You are an expert UI/UX analyst. Analyze this screenshot to see if a user might be confused or stuck. Look for: error messages, complex forms, too many buttons, unclear instructions, 'permission denied' popups, or anything that looks like a common user problem.
    - If NO problem or confusion is detected, respond with ONLY the exact text "NO_PROBLEM".
    - If a potential problem IS detected, describe it in one short sentence. Example: "The user might be confused by the number of options on this settings page." or "An application has thrown a 'file not found' error."`;

    try {
        const response = await this.ai.models.generateContent({
            model: model,
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
                    { text: prompt }
                ]
            }
        });
        return response.text.trim();
    } catch (error) {
        console.error("Screen analysis failed:", error);
        return "NO_PROBLEM"; // Default to no problem on error
    }
  }

  // --- Image Annotation ---
  async annotateImage(base64Image: string, instructions: string, mimeType: string = 'image/png') {
    const model = 'gemini-3-pro-image-preview'; // Powerful image model
    
    const prompt = `Based on the following instructions: "${instructions}", edit the provided image to highlight the key areas. Use bright red circles or arrows to point out the elements mentioned. Return ONLY the annotated image.`;

    const response = await this.ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
             inlineData: {
               data: base64Image,
               mimeType: mimeType
             }
          },
          {
            text: prompt
          }
        ]
      }
    });
    return response;
  }

  // --- Text to Speech ---
  async textToSpeech(text: string): Promise<string | undefined> {
    const model = "gemini-2.5-flash-preview-tts";
    try {
        const response = await this.ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: `Say this naturally: ${text}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    } catch (error) {
        console.error("Text-to-speech failed:", error);
        return undefined;
    }
  }

  // --- Live API (Audio/Video) ---
  async startLiveSession(
    onAudioOutput: (audioBuffer: AudioBuffer) => void,
    onTranscription: (userText: string, modelText: string, isFinal: boolean) => void,
    videoElement?: HTMLVideoElement,
    audioOnlyInput: boolean = false,
  ) {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';
    
    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    await inputAudioContext.resume();
    await outputAudioContext.resume();

    let nextStartTime = 0;
    const sources = new Set<AudioBufferSourceNode>();
    let currentInputTranscription = '';
    let currentOutputTranscription = '';

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!videoElement });
    
    const sessionPromise = this.ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        // FIX: Removed extra nested `voiceConfig` object.
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        systemInstruction: SYSTEM_INSTRUCTION,
        inputAudioTranscription: {},
        outputAudioTranscription: audioOnlyInput ? undefined : {},
      },
      callbacks: {
        onopen: () => {
          console.log("Live Session Connected");
          const source = inputAudioContext.createMediaStreamSource(stream);
          const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = float32ToPCM16(inputData);
            const encoded = bytesToBase64(new Uint8Array(pcmData));
            sessionPromise.then(session => session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: encoded } }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
          if (videoElement && stream.getVideoTracks().length > 0) {
             videoElement.srcObject = stream;
             const canvas = document.createElement('canvas');
             const ctx = canvas.getContext('2d');
             setInterval(() => {
                if(videoElement.readyState === videoElement.HAVE_ENOUGH_DATA && ctx) {
                    canvas.width = videoElement.videoWidth * 0.5;
                    canvas.height = videoElement.videoHeight * 0.5;
                    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                    sessionPromise.then(session => session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } }));
                }
             }, 1000);
          }
        },
        onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                const audioBuffer = await decodeAudioData(base64ToBytes(base64Audio), outputAudioContext);
                const source = outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputAudioContext.destination);
                source.onended = () => sources.delete(source);
                source.start(nextStartTime);
                nextStartTime += audioBuffer.duration;
                sources.add(source);
                onAudioOutput(audioBuffer);
            }
            if (message.serverContent?.inputTranscription) currentInputTranscription += message.serverContent.inputTranscription.text;
            if (message.serverContent?.outputTranscription) currentOutputTranscription += message.serverContent.outputTranscription.text;
            onTranscription(currentInputTranscription, currentOutputTranscription, false);

            if (message.serverContent?.turnComplete) {
                onTranscription(currentInputTranscription, currentOutputTranscription, true);
                currentInputTranscription = '';
                currentOutputTranscription = '';
            }

            if (message.serverContent?.interrupted) {
                sources.forEach(s => s.stop());
                sources.clear();
                nextStartTime = 0;
            }
        },
        onclose: () => {
            console.log("Live Session Closed");
            inputAudioContext.close();
            outputAudioContext.close();
            stream.getTracks().forEach(t => t.stop());
        },
        onerror: (e) => console.error("Live Session Error", e),
      }
    });

    return {
        close: async () => {
            const session = await sessionPromise;
            session.close();
        },
    };
  }
}

export const geminiService = new GeminiService();