'use client';

import React, { useRef, useState, useEffect } from 'react';

export default function Home() {
  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // MediaPipe SDK 동적 로드
  useEffect(() => {
    const loadScript = (src: string) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve(true);
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error(`Script load error for ${src}`));
        document.body.appendChild(script);
      });
    };

    Promise.all([
      loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
      loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js'),
      loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js'),
    ])
      .then(() => setIsSdkLoaded(true))
      .catch((err) => console.error('MediaPipe SDK 로딩 실패:', err));
  }, []);

  // 분석 처리 함수
  const analyzePosture = (imageElement: HTMLImageElement, typeName: string) => {
    const windowObject = window as any;
    if (!windowObject.Pose || !windowObject.drawConnectors || !windowObject.drawLandmarks) {
      alert('AI 라이브러리를 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setIsLoading(true);

    const pose = new windowObject.Pose({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results: any) => {
      setIsLoading(false);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (!results.poseLandmarks) {
        alert('인식된 관절이 없습니다. 전신 또는 상반신이 잘 보이는 사진을 올려주세요.');
        return;
      }

      setHasResult(true);
      canvas.width = imageElement.width;
      canvas.height = imageElement.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      // 스켈레톤 덮어 그리기
      windowObject.drawConnectors(ctx, results.poseLandmarks, windowObject.POSE_CONNECTIONS, {
        color: '#2563EB',
        lineWidth: 3,
      });
      windowObject.drawLandmarks(ctx, results.poseLandmarks, {
        color: '#DC2626',
        lineWidth: 2,
      });

      // 분석 결과 추가
      const resultMsg = `${name || '참가자'}님 (${typeName}) - 측정 완료`;
      setHistory((prev) => [resultMsg, ...prev]);
    });

    pose.send({ image: imageElement });
  };

  // 사진 파일 선택 핸들러
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, typeName: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => analyzePosture(img, typeName);
    }
  };

  return (
    <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {/* 상단 타이틀 (튼튼병원 로고 완전 제거) */}
        <header style={{ marginBottom: '30px' }}>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '28px', color: '#0F172A', fontWeight: 'bold' }}>
            AI 자세분석
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748B' }}>
            자세 스크리닝 · 척추관절 특화
          </p>
        </header>

        {/* 1. 참가자 정보 */}
        <section style={{
          backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '20px'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#1E3A8A' }}>1. 참가자 정보</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '240px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px', color: '#334155' }}>
                이름 (필수)
              </label>
              <input
                type="text"
                placeholder="예: 홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%', padding: '12px', borderRadius: '8px',
                  border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '240px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '6px', color: '#334155' }}>
                키 cm (선택 · 입력 시 cm 단위 표시)
              </label>
              <input
                type="text"
                placeholder="예: 165"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                style={{
                  width: '100%', padding: '12px', borderRadius: '8px',
                  border: '1px solid #CBD5E1', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </section>

        {/* 2. 측정 시작 */}
        <section style={{
          backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '20px'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#1E3A8A' }}>2. 측정 시작</h3>
          
          {/* 메인 버튼: 정면 -> 측면 연속 촬영 */}
          <label style={{
            display: 'block', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE',
            borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer',
            marginBottom: '12px', transition: 'all 0.2s'
          }}>
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleImageChange(e, '정면+측면')}
              disabled={!isSdkLoaded}
            />
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1E40AF', marginBottom: '4px' }}>
              측정 시작 — 정면 → 측면 연속 촬영
            </div>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>
              ① 정면 촬영·분석 → ② 측면 촬영·분석 → ③ 결과지 2장이 한 번에 만들어져 함께 공유·저장됩니다
            </div>
          </label>

          {/* 서브 버튼: 정면 따로 / 측면 따로 */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{
              flex: 1, backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '14px',
              textAlign: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#334155', fontSize: '15px'
            }}>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageChange(e, '정면')}
                disabled={!isSdkLoaded}
              />
              정면만 따로 측정
            </label>

            <label style={{
              flex: 1, backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '14px',
              textAlign: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#334155', fontSize: '15px'
            }}>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageChange(e, '측면')}
                disabled={!isSdkLoaded}
              />
              측면만 따로 측정
            </label>
          </div>

          <div style={{ marginTop: '16px', fontSize: '13px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{isSdkLoaded ? 'AI 모델 준비 완료 ✓ (인터넷 연결 필요)' : 'AI 모델 준비 중...'}</span>
          </div>
        </section>

        {/* 캔버스 화면 (사진 업로드 전까지는 하얀 빈 공간이 숨겨집니다) */}
        {(isLoading || hasResult) && (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            {isLoading && <p style={{ color: '#2563EB', fontWeight: 'bold' }}>AI가 자세를 분석 중입니다...</p>}
            <canvas
              ref={canvasRef}
              style={{
                maxWidth: '100%',
                borderRadius: '12px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                display: hasResult ? 'inline-block' : 'none'
              }}
            />
          </div>
        )}

        {/* 3. 오늘의 측정 기록 */}
        <section style={{
          backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: '30px'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#1E3A8A' }}>오늘의 측정 기록</h3>
          {history.length === 0 ? (
            <p style={{ margin: 0, fontSize: '14px', color: '#94A3B8' }}>아직 측정 기록이 없습니다.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155', fontSize: '14px' }}>
              {history.map((item, index) => (
                <li key={index} style={{ marginBottom: '6px' }}>{item}</li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  );
}