export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
}

export enum MessageType {
  TEXT = 'text',
  CODE = 'code',
  IMAGE = 'image',
  AUDIO = 'audio',
  SYSTEM = 'system'
}

export interface ApiPart {
  text?: string;
  inlineData?: { data: string; mimeType: string; };
  functionCall?: { name: string; args: any; };
  functionResponse?: { name:string; response: any; };
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  type: MessageType; // Used for rendering hint
  content: string; // Used for display text or image base64
  timestamp: number;
  mimeType?: string; // For images/audio
  parts?: ApiPart[]; // The actual data for the API
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export enum DomainExtension {
  COM = '.com',
  BD = '.bd',
  ORG = '.org',
  NET = '.net',
  IO = '.io',
  AI = '.ai',
  DEV = '.dev',
  APP = '.app',
  XYZ = '.xyz',
  INFO = '.info'
}

export interface DomainListing {
  extension: DomainExtension;
  priceUSD: number;
  priceBDT: number;
}