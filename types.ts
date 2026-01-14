
export interface ScriptContent {
  title: string;
  hook: string;
  body: string;
  conclusion: string;
  imagePrompts: string[];
}

export interface GeneratedAsset {
  id: string;
  type: 'image' | 'audio';
  url: string;
  data: string; // base64
  fileName: string;
}
