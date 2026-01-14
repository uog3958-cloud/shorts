
import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ScriptContent, GeneratedAsset } from './types';
import JSZip from 'jszip';

const ART_STYLES = [
  "선택 안함", "실사", "3D 애니메이션", "인상주의 (Impressionism)", "큐비즘 (Cubism)", 
  "리얼리즘 (Realism)", "초 surrealism (Surrealism)", "종이 (Paper)", "표현주의 (Expressionism)", 
  "미니멀리즘 (Minimalism)", "풍경화와 자연화 (Landscape and Nature)", "픽셀 아트 (Pixel Art)", 
  "만화와 코믹스 (Cartoon and Comics)", "아르데코 (Art Deco)", "기하학적 및 프랙탈 아트 (Geometric and Fractal Art)", 
  "팝 아트 (Pop Art)", "르네상스 (Renaissance)", "SF 및 판타지 (Sci-Fi and Fantasy)", "초상화 (Portrait)", 
  "플랫 디자인 (Flat Design)", "아이소메트릭 (Isometric)", "수채화 (Watercolor)", "스케치 (Sketch)", 
  "빈센트 반 고흐 스타일 (Vincent van Gogh Style)", "클로드 모네 스타일 (Claude Monet Style)", 
  "파블로 피카소 스타일 (Pablo Picasso Style)", "살바도르 달리 스타일 (Salvador Dalí Style)", 
  "프리다 칼로 스타일 (Frida Kahlo Style)"
];

const ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:3", "3:4"];

const App: React.FC = () => {
  const [topic, setTopic] = useState('겨울철 별미');
  const [imageCount, setImageCount] = useState<string>('5');
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [selectedStyle, setSelectedStyle] = useState<string>("실사");
  const [bgmStyle, setBgmStyle] = useState<string>("잔잔하고 따뜻한 겨울 분위기의 어쿠스틱 음악");
  
  const [loading, setLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [imageLoadingStates, setImageLoadingStates] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState('');
  const [script, setScript] = useState<ScriptContent | null>(null);
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  const checkApiKey = async () => {
    // @ts-ignore
    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }
  };

  const generateShorts = async () => {
    if (!topic.trim()) {
      alert('주제를 입력해주세요!');
      return;
    }
    setLoading(true);
    setAssets([]);
    setScript(null);
    setFinalVideoUrl(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      const countPrompt = imageCount === 'auto' ? '내용에 적절한 개수만큼' : `${imageCount}개`;
      const stylePrompt = selectedStyle !== "선택 안함" ? `, 전체적인 비주얼 스타일은 '${selectedStyle}' 스타일로` : "";

      setStatus(`기획 중...`);
      const scriptResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `'${topic}'에 대한 30초짜리 쇼츠대본을 만들어줘. 후킹, 본문, 마침글로 구성해줘. 또한, 이 대본의 흐름에 어울리는 고퀄리티 이미지 생성 프롬프트를 ${countPrompt} 한국어로 작성해줘${stylePrompt}.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              hook: { type: Type.STRING },
              body: { type: Type.STRING },
              conclusion: { type: Type.STRING },
              imagePrompts: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["title", "hook", "body", "conclusion", "imagePrompts"]
          }
        }
      });

      const scriptData: ScriptContent = JSON.parse(scriptResponse.text);
      setScript(scriptData);

      const newAssets: GeneratedAsset[] = [];
      setStatus(`이미지 생성 중...`);
      
      for (let i = 0; i < scriptData.imagePrompts.length; i++) {
        const imgAsset = await generateSingleImage(scriptData.imagePrompts[i], i);
        if (imgAsset) newAssets.push(imgAsset);
      }

      setAssets(newAssets);
      await generateAudio(scriptData, newAssets);
      setStatus('에셋 생성 완료!');
    } catch (error) {
      console.error(error);
      setStatus('오류 발생: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const generateSingleImage = async (prompt: string, index: number): Promise<GeneratedAsset | null> => {
    setImageLoadingStates(prev => ({ ...prev, [index]: true }));
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const imgResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: prompt,
        config: {
          imageConfig: { aspectRatio: aspectRatio as any }
        }
      });

      for (const part of imgResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          return {
            id: `img-${index}`,
            type: 'image',
            data: part.inlineData.data,
            url: `data:image/png;base64,${part.inlineData.data}`,
            fileName: `image_${index + 1}.png`
          };
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setImageLoadingStates(prev => ({ ...prev, [index]: false }));
    }
    return null;
  };

  const regenerateImage = async (index: number) => {
    if (!script) return;
    const prompt = script.imagePrompts[index];
    const newAsset = await generateSingleImage(prompt, index);
    if (newAsset) {
      setAssets(prev => {
        const otherAssets = prev.filter(a => a.id !== `img-${index}`);
        return [...otherAssets, newAsset].sort((a, b) => a.id.localeCompare(b.id));
      });
    }
  };

  const generateAudio = async (currentScript: ScriptContent, currentAssets: GeneratedAsset[]) => {
    setAudioLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const fullText = `${currentScript.hook}. ${currentScript.body}. ${currentScript.conclusion}`;
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `읽어줘: ${fullText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        const audioAsset: GeneratedAsset = {
          id: 'audio-main',
          type: 'audio',
          data: audioData,
          url: `data:audio/wav;base64,${audioData}`,
          fileName: 'narration.wav'
        };
        const filteredAssets = currentAssets.filter(a => a.id !== 'audio-main');
        setAssets([...filteredAssets, audioAsset]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setAudioLoading(false);
    }
  };

  const createFinalVideo = async () => {
    if (!script || assets.length === 0) return;
    await checkApiKey();
    setVideoLoading(true);
    setStatus('Veo 엔진으로 최종 영상 합성 중... (수 분이 소요될 수 있습니다)');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const firstImage = assets.find(a => a.type === 'image');
      
      // We use the prompt and the first image as a reference for Veo
      const videoPrompt = `A high quality vertical short video about ${topic}. 
      Subtitles should be burned in at the bottom center, one line at a time. 
      The visual style is ${selectedStyle}. 
      Music style: ${bgmStyle}.
      Narration text: ${script.hook} ${script.body} ${script.conclusion}`;

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt,
        image: firstImage ? {
          imageBytes: firstImage.data,
          mimeType: 'image/png'
        } : undefined,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: aspectRatio === '9:16' || aspectRatio === '16:9' ? aspectRatio : '9:16'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        setFinalVideoUrl(URL.createObjectURL(blob));
        setStatus('최종 영상 생성 완료!');
      }
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes("entity was not found")) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
      }
      setStatus('영상 생성 실패: ' + error.message);
    } finally {
      setVideoLoading(false);
    }
  };

  const handleScriptChange = (field: keyof ScriptContent, value: string) => {
    if (!script) return;
    setScript({ ...script, [field]: value });
  };

  const handlePromptChange = (index: number, value: string) => {
    if (!script) return;
    const newPrompts = [...script.imagePrompts];
    newPrompts[index] = value;
    setScript({ ...script, imagePrompts: newPrompts });
  };

  const downloadZip = async () => {
    if (!script) return;
    const zip = new JSZip();
    const scriptInfo = `제목: ${script.title}\n비율: ${aspectRatio}\n스타일: ${selectedStyle}\n\n[후킹]\n${script.hook}\n\n[본문]\n${script.body}\n\n[마침글]\n${script.conclusion}`;
    zip.file("project_info.txt", scriptInfo);
    assets.forEach(asset => zip.file(asset.fileName, asset.data, { base64: true }));
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${script.title || 'shorts'}.zip`;
    link.click();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 pb-20">
      <header className="text-center space-y-4 pt-10">
        <h1 className="text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
          AI Shorts Creator Pro
        </h1>
        <p className="text-gray-400 font-medium">대본, 이미지, 오디오, 그리고 영상까지 한 번에</p>
      </header>

      <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700 shadow-2xl space-y-6 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 col-span-full">
            <label className="text-sm font-bold text-gray-400">주제</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-2xl px-5 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-400">이미지 개수</label>
            <select value={imageCount} onChange={(e) => setImageCount(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3">
              <option value="auto">자동</option>
              {[...Array(20)].map((_, i) => <option key={i+1} value={i+1}>{i+1}개</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-400">비율</label>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3">
              {ASPECT_RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-2 col-span-full">
            <label className="text-sm font-bold text-gray-400">아트 스타일</label>
            <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3">
              {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-2 col-span-full">
            <label className="text-sm font-bold text-gray-400">BGM 스타일</label>
            <input
              type="text"
              value={bgmStyle}
              onChange={(e) => setBgmStyle(e.target.value)}
              placeholder="음악 분위기를 설명해주세요..."
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-5 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
        <button
          onClick={generateShorts}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 py-5 rounded-2xl font-black text-xl shadow-xl transition-all disabled:bg-gray-700"
        >
          {loading ? '생성 중...' : '프로젝트 시작'}
        </button>
      </div>

      {status && (
        <div className="bg-indigo-600/10 border border-indigo-500/30 p-4 rounded-2xl text-center max-w-2xl mx-auto animate-pulse">
          <p className="text-indigo-300 font-bold text-sm">{status}</p>
        </div>
      )}

      {script && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
          {/* Left Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-gray-800 p-6 rounded-3xl border border-gray-700 shadow-lg space-y-5 sticky top-6">
              <h2 className="text-xl font-black text-indigo-400 flex items-center gap-2">콘텐츠 편집</h2>
              <div className="space-y-4">
                <textarea value={script.hook} onChange={(e) => handleScriptChange('hook', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm h-20" placeholder="Hook" />
                <textarea value={script.body} onChange={(e) => handleScriptChange('body', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm h-40" placeholder="Body" />
                <textarea value={script.conclusion} onChange={(e) => handleScriptChange('conclusion', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm h-20" placeholder="Conclusion" />
              </div>
              <div className="pt-4 border-t border-gray-700">
                <button onClick={() => generateAudio(script, assets)} disabled={audioLoading} className="w-full bg-indigo-500 py-2 rounded-xl text-xs font-bold mb-3">
                  {audioLoading ? '오디오 생성 중...' : '나래이션 재녹음'}
                </button>
                {assets.some(a => a.type === 'audio') && <audio controls src={assets.find(a => a.type === 'audio')?.url} className="w-full h-8 invert" />}
              </div>

              <div className="pt-4 border-t border-gray-700 space-y-3">
                <button 
                  onClick={createFinalVideo} 
                  disabled={videoLoading} 
                  className="w-full bg-purple-600 hover:bg-purple-500 py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg"
                >
                  {videoLoading ? '영상 합성 중...' : '최종 영상 생성 (Veo)'}
                </button>
                <button onClick={downloadZip} className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-2xl font-black">압축 다운로드</button>
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="lg:col-span-8 space-y-6">
            {finalVideoUrl && (
              <div className="bg-black rounded-3xl overflow-hidden border-4 border-indigo-500 shadow-2xl relative aspect-[9/16] max-w-sm mx-auto">
                <video src={finalVideoUrl} controls autoPlay loop className="w-full h-full object-cover" />
                <div className="absolute bottom-10 left-0 right-0 text-center px-4">
                   <p className="bg-black/60 backdrop-blur-md inline-block px-4 py-2 rounded-lg text-white font-bold text-lg shadow-xl border border-white/20">
                     {script.hook}
                   </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {script.imagePrompts.map((prompt, idx) => (
                <div key={idx} className="bg-gray-800 p-4 rounded-2xl border border-gray-700 space-y-3">
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-black border border-gray-700">
                    {imageLoadingStates[idx] ? (
                      <div className="absolute inset-0 flex items-center justify-center animate-spin">🌀</div>
                    ) : assets.find(a => a.id === `img-${idx}`) ? (
                      <img src={assets.find(a => a.id === `img-${idx}`)?.url} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <textarea value={prompt} onChange={(e) => handlePromptChange(idx, e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs h-16 resize-none" />
                  <button onClick={() => regenerateImage(idx)} className="w-full bg-gray-700 py-1 rounded text-[10px] font-bold">이미지 재생성</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
